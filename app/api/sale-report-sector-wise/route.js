import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import AccountLedger from "@/app/model/AccountLedger";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    
    // Extract query parameters
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const runNumber = searchParams.get("runNumber");
    const payment = searchParams.get("payment");
    const branch = searchParams.get("branch");
    const origin = searchParams.get("origin");
    const sector = searchParams.get("sector");
    const destination = searchParams.get("destination");
    const network = searchParams.get("network");
    const counterPart = searchParams.get("counterPart");
    const salePerson = searchParams.get("salePerson");
    const saleRefPerson = searchParams.get("saleRefPerson");
    const company = searchParams.get("company");
    const customerCode = searchParams.get("customerCode");
    const withBookingDate = searchParams.get("withBookingDate") === "true";

    // Validate required dates
    if (!from || !to) {
      return NextResponse.json(
        { success: false, message: "From and To dates are required" },
        { status: 400 }
      );
    }

    // Build shipment query
    const shipmentQuery = {
      date: {
        $gte: new Date(from),
        $lte: new Date(to),
      },
    };

    // Add optional filters
    if (runNumber) shipmentQuery.runNo = runNumber;
    if (payment) shipmentQuery.payment = payment;
    if (branch) shipmentQuery.branch = branch;
    if (origin) shipmentQuery.origin = origin;
    if (sector) shipmentQuery.sector = sector;
    if (destination) shipmentQuery.destination = destination;
    if (network) shipmentQuery.network = network;
    if (counterPart) shipmentQuery.coLoader = counterPart;
    if (company) shipmentQuery.company = company;
    if (customerCode) shipmentQuery.accountCode = customerCode;

    // Fetch shipments
    const shipments = await Shipment.find(shipmentQuery).lean();

    if (shipments.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "No shipments found for the given criteria",
      });
    }

    // Get unique account codes
    const accountCodes = [...new Set(shipments.map(s => s.accountCode))];

    // Fetch customer accounts
    const customers = await CustomerAccount.find({
      accountCode: { $in: accountCodes }
    }).lean();

    // Apply customer filters if provided
    let filteredCustomers = customers;
    if (salePerson) {
      filteredCustomers = filteredCustomers.filter(c => c.salesPersonName === salePerson);
    }
    if (saleRefPerson) {
      filteredCustomers = filteredCustomers.filter(c => c.referenceBy === saleRefPerson);
    }

    const filteredAccountCodes = filteredCustomers.map(c => c.accountCode);

    // Filter shipments based on customer filters
    const filteredShipments = shipments.filter(s => 
      filteredAccountCodes.includes(s.accountCode)
    );

    // Fetch account ledger data for opening balance and receipts
    const ledgerData = await AccountLedger.find({
      accountCode: { $in: filteredAccountCodes }
    }).lean();

    // Group shipments by account code and sector
    const groupedData = {};

    filteredShipments.forEach(shipment => {
      const key = `${shipment.accountCode}_${shipment.sector || 'NO_SECTOR'}`;
      
      if (!groupedData[key]) {
        const customer = filteredCustomers.find(c => c.accountCode === shipment.accountCode);
        const accountLedger = ledgerData.filter(l => l.accountCode === shipment.accountCode);
        
        // Calculate ledger totals
        const totalReceipts = accountLedger.reduce((sum, l) => sum + (l.creditAmount || 0), 0);
        const totalDebits = accountLedger.reduce((sum, l) => sum + (l.debitAmount || 0), 0);
        const totalCredits = accountLedger.reduce((sum, l) => sum + (l.creditAmount || 0), 0);
        const openingBalance = customer?.openingBalance ? parseFloat(customer.openingBalance) || 0 : 0;
        
        groupedData[key] = {
          CustomerCode: shipment.accountCode,
          CustomerName: customer?.name || '',
          BranchCode: customer?.branch || '',
          City: customer?.city || '',
          SalePerson: customer?.salesPersonName || '',
          RefrenceBy: customer?.referenceBy || '',
          CollectionBy: customer?.collectionBy || '',
          Sector: shipment.sector || '',
          CountAwbNo: 0,
          Pcs: 0,
          ActWeight: 0,
          VolWeight: 0,
          ChgWeight: 0,
          BasicAmount: 0,
          SGST: 0,
          CGST: 0,
          IGST: 0,
          Mischg: 0,
          Fuel: 0,
          GrandTotal: 0,
          OpeningBalance: openingBalance,
          TotalRcpt: totalReceipts,
          TotalDebit: totalDebits,
          TotalCredit: totalCredits,
          TotalOutStanding: 0,
        };
      }

      // Aggregate values
      groupedData[key].CountAwbNo += 1;
      groupedData[key].Pcs += shipment.pcs || 0;
      groupedData[key].ActWeight += shipment.totalActualWt || 0;
      groupedData[key].VolWeight += shipment.totalVolWt || 0;
      groupedData[key].ChgWeight += shipment.chargeableWt || 0;
      groupedData[key].BasicAmount += shipment.basicAmt || 0;
      groupedData[key].SGST += shipment.sgst || 0;
      groupedData[key].CGST += shipment.cgst || 0;
      groupedData[key].IGST += shipment.igst || 0;
      groupedData[key].Mischg += shipment.miscChg || 0;
      groupedData[key].Fuel += shipment.fuelAmt || 0;
      groupedData[key].GrandTotal += shipment.totalAmt || 0;
    });

    // Calculate outstanding balance for each group
    Object.keys(groupedData).forEach(key => {
      const record = groupedData[key];
      record.TotalOutStanding = 
        record.OpeningBalance + 
        record.TotalDebit - 
        record.TotalCredit + 
        record.GrandTotal;
    });

    // Convert to array and round values
    const resultData = Object.values(groupedData).map(record => ({
      ...record,
      ActWeight: Math.round(record.ActWeight * 100) / 100,
      VolWeight: Math.round(record.VolWeight * 100) / 100,
      ChgWeight: Math.round(record.ChgWeight * 100) / 100,
      BasicAmount: Math.round(record.BasicAmount * 100) / 100,
      SGST: Math.round(record.SGST * 100) / 100,
      CGST: Math.round(record.CGST * 100) / 100,
      IGST: Math.round(record.IGST * 100) / 100,
      Mischg: Math.round(record.Mischg * 100) / 100,
      Fuel: Math.round(record.Fuel * 100) / 100,
      GrandTotal: Math.round(record.GrandTotal * 100) / 100,
      OpeningBalance: Math.round(record.OpeningBalance * 100) / 100,
      TotalRcpt: Math.round(record.TotalRcpt * 100) / 100,
      TotalDebit: Math.round(record.TotalDebit * 100) / 100,
      TotalCredit: Math.round(record.TotalCredit * 100) / 100,
      TotalOutStanding: Math.round(record.TotalOutStanding * 100) / 100,
    }));

    // Calculate totals
    const totals = {
      totalWeight: resultData.reduce((sum, r) => sum + r.ChgWeight, 0),
      grandTotal: resultData.reduce((sum, r) => sum + r.GrandTotal, 0),
    };

    return NextResponse.json({
      success: true,
      data: resultData,
      totals: {
        totalWeight: Math.round(totals.totalWeight * 100) / 100,
        grandTotal: Math.round(totals.grandTotal * 100) / 100,
      },
    });

  } catch (error) {
    console.error("Error in sale-report-sector-wise:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        error: error.message,
      },
      { status: 500 }
    );
  }
}