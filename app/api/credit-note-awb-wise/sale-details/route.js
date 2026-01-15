import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CreditNote from "@/app/model/CreditNote";
import Shipment from "@/app/model/portal/Shipment";
import Run from "@/app/model/RunEntry";
import CustomerAccount from "@/app/model/CustomerAccount";

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
    const state = searchParams.get("state");
    const accountManager = searchParams.get("accountManager");
    const type = searchParams.get("type");
    const customerCode = searchParams.get("customerCode");
    const withBookingDate = searchParams.get("withBookingDate") === "true";
    const withUnbilled = searchParams.get("withUnbilled") === "true";
    const withDHL = searchParams.get("withDHL") === "true";
    const withDate = searchParams.get("withDate") === "true";
    const withBranchWise = searchParams.get("withBranchWise") === "true";
    const withConsignor = searchParams.get("withConsignor") === "true";

    // Validate required dates
    if (!from || !to) {
      return NextResponse.json(
        { success: false, message: "From and To dates are required" },
        { status: 400 }
      );
    }

    // Build credit note query
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const creditNoteQuery = {
      "clientDetails.invoiceDate": {
        $gte: fromDate,
        $lte: toDate,
      },
    };

    // Fetch credit notes
    const creditNotes = await CreditNote.find(creditNoteQuery).lean();

    if (creditNotes.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        totals: {
          totalBagWeight: 0,
          totalWeight: 0,
          grandTotal: 0,
        },
        message: "No credit notes found for the given date range",
      });
    }

    // Extract unique AWB numbers
    const awbNumbers = [];
    creditNotes.forEach((cn) => {
      if (cn.creditItems && Array.isArray(cn.creditItems)) {
        cn.creditItems.forEach((item) => {
          if (item.awbNo) {
            awbNumbers.push(item.awbNo);
          }
        });
      }
    });

    const uniqueAwbNumbers = [...new Set(awbNumbers)];

    if (uniqueAwbNumbers.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        totals: {
          totalBagWeight: 0,
          totalWeight: 0,
          grandTotal: 0,
        },
        message: "No AWB numbers found in credit notes",
      });
    }

    // Build shipment query - DO NOT filter by branch/state here as they don't exist in Shipment
    const shipmentQuery = {
      awbNo: { $in: uniqueAwbNumbers },
    };

    // Add filters that exist in Shipment schema
    if (payment) shipmentQuery.payment = payment;
    if (origin) shipmentQuery.origin = origin;
    if (sector) shipmentQuery.sector = sector;
    if (destination) shipmentQuery.destination = destination;
    if (network) shipmentQuery.network = network;
    if (counterPart) shipmentQuery.coLoader = counterPart;
    if (company) shipmentQuery.company = company;
    if (customerCode) shipmentQuery.accountCode = customerCode;
    if (runNumber) shipmentQuery.runNo = runNumber;

    // Type filter - map to goodstype
    if (type) {
      shipmentQuery.goodstype = type;
    }

    // Filter for unbilled shipments
    if (withUnbilled) {
      shipmentQuery.$or = [
        { billNo: { $in: [null, ""] } },
        { isBilled: false },
      ];
    }

    // Skip DHL shipments
    if (withDHL) {
      shipmentQuery.network = { $ne: "DHL" };
    }

    // Fetch shipments
    const shipments = await Shipment.find(shipmentQuery).lean();

    if (shipments.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        totals: {
          totalBagWeight: 0,
          totalWeight: 0,
          grandTotal: 0,
        },
        message: "No shipments found for the given criteria",
      });
    }

    // Get unique account codes from shipments
    const accountCodes = [
      ...new Set(shipments.map((s) => s.accountCode).filter(Boolean)),
    ];

    // Fetch customer accounts
    const customers = await CustomerAccount.find({
      accountCode: { $in: accountCodes },
    }).lean();

    // Create a map for quick customer lookup
    const customerMap = {};
    customers.forEach((customer) => {
      customerMap[customer.accountCode] = customer;
    });

    // NOW filter by customer-specific fields (branch, state, salePerson, etc.)
    let filteredShipments = shipments.filter((shipment) => {
      const customer = customerMap[shipment.accountCode];
      if (!customer) return false;

      // Apply customer-based filters
      if (branch && customer.branch !== branch) return false;
      if (state && customer.state !== state) return false;
      if (salePerson && customer.salesPersonName !== salePerson) return false;
      if (saleRefPerson && customer.referenceBy !== saleRefPerson) return false;
      if (accountManager && customer.accountManager !== accountManager)
        return false;

      return true;
    });

    // Get unique run numbers from filtered shipments
    const runNumbers = [
      ...new Set(filteredShipments.map((s) => s.runNo).filter(Boolean)),
    ];

    // Fetch runs
    const runs = await Run.find({
      runNo: { $in: runNumbers },
    }).lean();

    // Create a map for quick run lookup
    const runMap = {};
    runs.forEach((run) => {
      runMap[run.runNo] = run;
    });

    // Create a map for credit note lookup by AWB
    const creditNoteMap = {};
    creditNotes.forEach((cn) => {
      if (cn.creditItems && Array.isArray(cn.creditItems)) {
        cn.creditItems.forEach((item) => {
          if (item.awbNo) {
            creditNoteMap[item.awbNo] = {
              creditNoteNo: cn.clientDetails?.invoiceNo || "",
              amount: item.creditAmount || 0,
              invoiceDate: cn.clientDetails?.invoiceDate,
            };
          }
        });
      }
    });

    // Format date helper
    const formatDate = (date, yyyymmdd = false) => {
      if (!date) return "";
      const d = new Date(date);
      if (isNaN(d.getTime())) return "";
      if (yyyymmdd) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}${month}${day}`;
      }
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // Map shipments to result format
    const resultData = filteredShipments.map((shipment) => {
      const customer = customerMap[shipment.accountCode] || {};
      const creditNote = creditNoteMap[shipment.awbNo] || {};
      const run = runMap[shipment.runNo] || {};

      return {
        AwbNo: shipment.awbNo || "",
        BookingDate: withBookingDate ? formatDate(shipment.date, withDate) : "",
        FlightDate: formatDate(run.date, withDate),
        RunNo: shipment.runNo || "",
        HUB: run.hub || "",
        ClubNo: shipment.clubNo || "",
        Branch: customer.branch || "",
        State: customer.state || "",
        City: customer.city || "",
        Type: shipment.goodstype || "",
        SalePerson: customer.salesPersonName || "",
        RefrenceBy: customer.referenceBy || "",
        ManagedBy: customer.managedBy || "",
        CollectionBy: customer.collectionBy || "",
        AccountManager: customer.accountManager || "",
        GM: customer.gm || "",
        RM: customer.rm || "",
        SM: customer.sm || "",
        RateType: customer.rateType || "",
        OpeningAccount: customer.openingBalance || "",
        Currency: shipment.currency || "",
        OriginName: shipment.origin || "",
        Sector: shipment.sector || "",
        DestinationCode: shipment.destination || "",
        CustomerCode: shipment.accountCode || "",
        CustomerName: customer.name || "",
        // ConsignorName: withConsignor ? shipment.shipperFullName || "" : "",
        ConsignorName: shipment.shipperFullName || "",

        ConsigneeName: shipment.receiverFullName || "",
        ConsigneeAddressLine1: shipment.receiverAddressLine1 || "",
        ConsigneeCity: shipment.receiverCity || "",
        ConsigneeState: shipment.receiverState || "",
        ConsigneeZipCode: shipment.receiverPincode || "",
        ConsigneePhoneNo: shipment.receiverPhoneNumber || "",
        ShipmentForwarderTo: shipment.forwarder || "",
        ShipmentForwardingNo: shipment.forwardingNo || "",
        ServiceType: shipment.service || "",
        Pcs: shipment.pcs || 0,
        GoodsDesc: shipment.goodstype || "",
        ActWeight: Math.round((shipment.totalActualWt || 0) * 100) / 100,
        VolWeight: Math.round((shipment.totalVolWt || 0) * 100) / 100,
        VolDiscount: Math.round((shipment.volDisc || 0) * 100) / 100,
        ChgWeight: Math.round((shipment.chargeableWt || 0) * 100) / 100,
        BagWeight: Math.round((shipment.chargeableWt || 0) * 100) / 100,
        PaymentType: shipment.payment || "",
        BillingTag:
          customer.billingTag || (shipment.billNo ? "Billed" : "Unbilled"),
        BasicAmount: Math.round((shipment.basicAmt || 0) * 100) / 100,
        DiscountPerKg: Math.round((shipment.discount || 0) * 100) / 100,
        DiscountAmt: Math.round((shipment.discountAmt || 0) * 100) / 100,
        BasicAmtAfterDiscount:
          Math.round(
            ((shipment.basicAmt || 0) - (shipment.discountAmt || 0)) * 100
          ) / 100,
        RateHike: Math.round((shipment.hikeAmt || 0) * 100) / 100,
        SGST: Math.round((shipment.sgst || 0) * 100) / 100,
        CGST: Math.round((shipment.cgst || 0) * 100) / 100,
        IGST: Math.round((shipment.igst || 0) * 100) / 100,
        Handling: Math.round((shipment.handlingAmount || 0) * 100) / 100,
        OVWT: Math.round((shipment.overWtHandling || 0) * 100) / 100,
        Mischg: Math.round((shipment.miscChg || 0) * 100) / 100,
        MiscRemark: shipment.miscChgReason || "",
        Fuel: Math.round((shipment.fuelAmt || 0) * 100) / 100,
        NonTaxable: Math.round((shipment.duty || 0) * 100) / 100,
        GrandTotal: Math.round((shipment.totalAmt || 0) * 100) / 100,
        Currency1: shipment.currencys || shipment.currency || "",
        BillNo: shipment.billNo || "",
        CRAmount: Math.round((creditNote.amount || 0) * 100) / 100,
        CRBillNo: creditNote.creditNoteNo || "",
        AwbCheck: shipment.awbStatus || "",
        ShipmentRemark: shipment.operationRemark || "",
        CSB: shipment.csb ? "Yes" : "No",
        HandlingTag: shipment.handling ? "Yes" : "No",
      };
    });

    // Calculate totals
    const totals = {
      totalBagWeight: resultData.reduce(
        (sum, r) => sum + (r.BagWeight || 0),
        0
      ),
      totalWeight: resultData.reduce((sum, r) => sum + (r.ChgWeight || 0), 0),
      grandTotal: resultData.reduce((sum, r) => sum + (r.GrandTotal || 0), 0),
    };

    return NextResponse.json({
      success: true,
      data: resultData,
      totals: {
        totalBagWeight: Math.round(totals.totalBagWeight * 100) / 100,
        totalWeight: Math.round(totals.totalWeight * 100) / 100,
        grandTotal: Math.round(totals.grandTotal * 100) / 100,
      },
      message: `Found ${resultData.length} records`,
    });
  } catch (error) {
    console.error("Error in sale-details report:", error);
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
