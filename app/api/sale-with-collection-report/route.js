// app/api/sale-with-collection-report/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import AccountLedger from "@/app/model/AccountLedger";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    
    // Extract query parameters
    const accountCode = searchParams.get("accountCode");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const withHold = searchParams.get("withHold") === "true";

    // Build query filter
    let query = {};

    // Account code is required
    if (!accountCode) {
      return NextResponse.json(
        { 
          success: false, 
          message: "Customer Code is required" 
        },
        { status: 400 }
      );
    }

    // Add account code to query
    query.accountCode = accountCode;

    // Add date filter if both dates are provided
    if (fromDate && toDate) {
      query.date = {
        $gte: new Date(fromDate),
        $lte: new Date(new Date(toDate).setHours(23, 59, 59, 999)),
      };
    }

    // FIXED: With Hold AWB filter
    // When withHold is FALSE (unchecked): show ONLY non-hold shipments
    // When withHold is TRUE (checked): show ALL shipments (hold + non-hold)
    if (!withHold) {
      // Checkbox unchecked: exclude hold shipments
      query.isHold = { $ne: true };
    }
    // When withHold is true, don't add any isHold filter - this shows ALL data

    // Fetch account ledger entries
    const ledgerEntries = await AccountLedger.find(query)
      .sort({ date: 1, createdAt: 1 })
      .lean();

    if (ledgerEntries.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        openingBalance: 0,
        closingBalance: 0,
        customerInfo: null,
      });
    }

    // Get customer information
    const customer = await CustomerAccount.findOne({ 
      accountCode: accountCode 
    }).lean();

    const openingBalance = customer?.openingBalance || 0;

    // Process ledger entries - Use leftOverBalance directly from database
    const reportData = ledgerEntries.map((entry) => {
      // Calculate received amount (credit - debit)
      const receivedAmount = (entry.creditAmount || 0) - (entry.debitAmount || 0);
      
      return {
        AwbNo: entry.awbNo || "",
        SaleType: entry.payment || "",
        Date: entry.date ? new Date(entry.date).toLocaleDateString("en-GB") : "",
        CustomerCode: entry.accountCode || "",
        ConsigneeName: entry.receiverFullName || "",
        ShipmentForwarderBy: entry.forwarder || "",
        Sector: entry.sector || "",
        DestinationCode: entry.destination || "",
        ConsigneeCity: entry.receiverCity || "",
        ConsigneeZipCode: entry.receiverPincode || "",
        ServiceType: entry.service || "",
        NumofItems: entry.pcs || 0,
        ActWeight: entry.totalActualWt || 0,
        VolWeight: entry.totalVolWt || 0,
        ChgWeight: entry.chargableWt || 0,
        BasicAmount: entry.basicAmt || 0,
        RateHike: entry.hikeAmt || 0,
        SGST: entry.sgst || 0,
        CSGT: entry.cgst || 0,
        IGST: entry.igst || 0,
        Mischg: entry.miscChg || 0,
        Fuel: entry.fuelAmt || 0,
        NonTaxable: entry.nonTaxable || 0,
        GrandTotal: entry.totalAmt || 0,
        RcvAmount: receivedAmount,
        DebitAmount: entry.debitAmount || 0,
        CreditAmount: entry.creditAmount || 0,
        Remark: entry.operationRemark || "",
        Balance: (entry.leftOverBalance || 0).toFixed(2), // Use leftOverBalance from database
      };
    });

    // Get closing balance from last entry's leftOverBalance
    const closingBalance = ledgerEntries[ledgerEntries.length - 1]?.leftOverBalance || openingBalance;

    return NextResponse.json({
      success: true,
      data: reportData,
      openingBalance: openingBalance,
      closingBalance: closingBalance,
      customerInfo: customer ? {
        name: customer.name,
        accountCode: customer.accountCode,
        branch: customer.branch,
        state: customer.state,
        city: customer.city,
      } : null,
      count: reportData.length,
    });

  } catch (error) {
    console.error("Error fetching sale with collection report:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Failed to fetch sale with collection report", 
        error: error.message 
      },
      { status: 500 }
    );
  }
}

// POST - Get customer name by account code
export async function POST(request) {
  try {
    await connectDB();

    const { accountCode } = await request.json();

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({ accountCode }).lean();

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      customerName: customer.name,
      customer: {
        name: customer.name,
        accountCode: customer.accountCode,
        branch: customer.branch,
        state: customer.state,
        city: customer.city,
        openingBalance: customer.openingBalance,
      },
    });

  } catch (error) {
    console.error("Error fetching customer name:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Failed to fetch customer name", 
        error: error.message 
      },
      { status: 500 }
    );
  }
}