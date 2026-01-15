import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import ChildShipment from "@/app/model/portal/ChildShipment";
import RunEntry from "@/app/model/RunEntry";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    
    // Extract query parameters
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
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
    const accountManager = searchParams.get("accountManager");
    const customerCode = searchParams.get("customerCode");
    const withBookingDate = searchParams.get("withBookingDate") === "true";
    const withUnbilled = searchParams.get("withUnbilled") === "true";
    const withDHL = searchParams.get("withDHL") === "true";

    // Build query filter
    let query = {};

    // Date filter
    if (fromDate && toDate) {
      const dateField = withBookingDate ? "createdAt" : "date";
      query[dateField] = {
        $gte: new Date(fromDate),
        $lte: new Date(new Date(toDate).setHours(23, 59, 59, 999)),
      };
    }

    // Other filters
    if (runNumber) query.runNo = { $regex: runNumber, $options: "i" };
    if (payment) query.payment = payment;
    if (origin) query.origin = { $regex: origin, $options: "i" };
    if (sector) query.sector = { $regex: sector, $options: "i" };
    if (destination) query.destination = { $regex: destination, $options: "i" };
    if (network) query.network = { $regex: network, $options: "i" };
    if (company) query.companyName = { $regex: company, $options: "i" };
    if (customerCode) query.accountCode = customerCode;

    // Unbilled shipment filter
    if (withUnbilled) {
      query.isBilled = false;
    }

    // Skip DHL filter
    if (withDHL) {
      query.network = { $ne: "DHL" };
    }

    // Fetch shipments
    const shipments = await Shipment.find(query).lean();

    if (shipments.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        totals: {
          totalBagWeight: 0,
          totalWeight: 0,
          grandTotal: 0,
        },
      });
    }

    // Fetch related data
    const accountCodes = [...new Set(shipments.map(s => s.accountCode).filter(Boolean))];
    const customers = await CustomerAccount.find({
      accountCode: { $in: accountCodes }
    }).lean();

    const customerMap = {};
    customers.forEach(c => {
      customerMap[c.accountCode] = c;
    });

    const awbNos = shipments.map(s => s.awbNo).filter(Boolean);
    const childShipments = await ChildShipment.find({
      masterAwbNo: { $in: awbNos }
    }).lean();

    const childShipmentMap = {};
    childShipments.forEach(cs => {
      if (!childShipmentMap[cs.masterAwbNo]) {
        childShipmentMap[cs.masterAwbNo] = [];
      }
      childShipmentMap[cs.masterAwbNo].push(cs);
    });

    const runNos = [...new Set(shipments.map(s => s.runNo).filter(Boolean))];
    const runs = await RunEntry.find({
      runNo: { $in: runNos }
    }).lean();

    const runMap = {};
    runs.forEach(r => {
      runMap[r.runNo] = r;
    });

    // Process data
    const reportData = shipments.map(shipment => {
      const customer = customerMap[shipment.accountCode] || {};
      const childShipmentList = childShipmentMap[shipment.awbNo] || [];
      const run = runMap[shipment.runNo] || {};

      // Apply additional filters
      if (branch && customer.branch && !customer.branch.toLowerCase().includes(branch.toLowerCase())) return null;
      if (salePerson && customer.salesPersonName !== salePerson) return null;
      if (saleRefPerson && customer.referenceBy !== saleRefPerson) return null;
      if (accountManager && customer.accountManager !== accountManager) return null;
      if (counterPart && run.counterpart !== counterPart) return null;

      return {
        AwbNo: shipment.awbNo || "",
        Mawbno: childShipmentList.map(cs => cs.childAwbNo).join(", ") || "",
        ClubNo: shipment.clubNo || "",
        ForwardingNo: shipment.forwardingNo || "",
        BookingDate: shipment.createdAt ? new Date(shipment.createdAt).toLocaleDateString("en-GB") : "",
        FlightDate: shipment.date ? new Date(shipment.date).toLocaleDateString("en-GB") : "",
        RunNo: shipment.runNo || "",
        HUB: customer.hub || "",
        Branch: customer.branch || "",
        State: customer.state || "",
        City: customer.city || "",
        Type: shipment.shipmentType || "",
        SalePerson: customer.salesPersonName || "",
        RefrenceBy: customer.referenceBy || "",
        CollectionBy: customer.collectionBy || "",
        AccountManager: customer.accountManager || "",
        RateType: customer.rateType || "",
        OpeningAccount: customer.openingBalance || "",
        Currency: shipment.currency || "",
        OriginName: shipment.origin || "",
        Sector: shipment.sector || "",
        DestinationCode: shipment.destination || "",
        CustomerCode: shipment.accountCode || "",
        CustomerName: customer.name || "",
        ConsignorName: shipment.shipperFullName || "",
        ConsigneeName: shipment.receiverFullName || "",
        ConsigneeAddressLine1: shipment.receiverAddressLine1 || "",
        ConsigneeCity: shipment.receiverCity || "",
        ConsigneeState: shipment.receiverState || "",
        ConsigneeZipCode: shipment.receiverPincode || "",
        ConsigneePhoneNo: shipment.receiverPhoneNumber || "",
        ShipmentForwarderTo: shipment.forwarder || "",
        ServiceType: shipment.service || "",
        Pcs: shipment.pcs || 0,
        GoodsDesc: shipment.goodstype || "",
        ActWeight: shipment.totalActualWt || 0,
        VolWeight: shipment.totalVolWt || 0,
        VolDiscount: shipment.volDisc || 0,
        ChgWeight: shipment.chargableWt || 0,
        BagWeight: shipment.bag || 0,
        PaymentType: shipment.payment || "",
        BillingTag: customer.billingTag || "",
        BasicAmount: shipment.basicAmt || 0,
        RateHike: shipment.hikeAmt || 0,
        SGST: shipment.sgst || 0,
        CGST: shipment.cgst || 0,
        IGST: shipment.igst || 0,
        Handling: shipment.handlingAmount || 0,
        OVWT: shipment.overWtHandling || 0,
        Mischg: shipment.miscChg || 0,
        MiscRemark: shipment.miscChgReason || "",
        Fuel: shipment.fuelAmt || 0,
        NonTaxable: 0,
        GrandTotal: shipment.totalAmt || 0,
        Currency1: shipment.currencys || "",
        BillNo: shipment.billNo || "",
        AwbCheck: shipment.awbStatus || "",
        ShipmentRemark: shipment.operationRemark || "",
        CSB: shipment.csb ? "Yes" : "No",
        HandlingTag: shipment.handling ? "Yes" : "No",
      };
    }).filter(item => item !== null);

    // Calculate totals
    const totals = {
      totalBagWeight: reportData.reduce((sum, item) => sum + (parseFloat(item.BagWeight) || 0), 0),
      totalWeight: reportData.reduce((sum, item) => sum + (parseFloat(item.ChgWeight) || 0), 0),
      grandTotal: reportData.reduce((sum, item) => sum + (parseFloat(item.GrandTotal) || 0), 0),
    };

    return NextResponse.json({
      success: true,
      data: reportData,
      totals,
      count: reportData.length,
    });

  } catch (error) {
    console.error("Error fetching sale report:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch sale report", error: error.message },
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
        branch: customer.branch,
        hub: customer.hub,
        salesPersonName: customer.salesPersonName,
        referenceBy: customer.referenceBy,
        accountManager: customer.accountManager,
      },
    });

  } catch (error) {
    console.error("Error fetching customer name:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch customer name", error: error.message },
      { status: 500 }
    );
  }
}