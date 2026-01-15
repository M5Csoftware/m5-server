import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";

await connectDB();

// FLEXIBLE DATE PARSER → accepts "YYYY-MM-DD" or "DD/MM/YYYY"
function parseDateFlexible(dateStr) {
  if (!dateStr) return null;

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + "T00:00:00");
  }

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split("/");
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }

  return null;
}

// Formatter for output
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date)) return "";
  return date.toLocaleDateString("en-GB");
};

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const type = searchParams.get("type");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // ---------------------------
    // FIXED DATE HANDLING
    // ---------------------------
    const startDate = parseDateFlexible(from);
    const endDate = parseDateFlexible(to);

    const query = {};
    if (startDate && endDate) {
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }

    // Count total docs
    const totalCount = await Shipment.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    // Fetch shipments for this page
    const shipments = await Shipment.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Fetch CustomerAccount data
    const accountCodes = shipments.map((s) => s.accountCode).filter(Boolean);
    const accounts = await CustomerAccount.find({
      accountCode: { $in: accountCodes },
    }).lean();

    const accountMap = {};
    accounts.forEach((a) => (accountMap[a.accountCode] = a));

    const mapped = shipments.map((item) => {
      const account = accountMap[item.accountCode] || {};

      return {
        awbNo: item.awbNo || "",
        bookingDate: formatDate(item.date),
        flightDate: formatDate(item.flight),
        runNo: item.runNo || "",
        hub: account.hub || "",
        branch: account.branch || "",
        customerCode: item.accountCode || "",
        customerName: item.customer || "",
        state: item.shipperState || "",
        city: item.shipperCity || "",
        type: account.accountType || "",
        billingTag: account.billingTag || "",
        service: item.service || "",
        gstTag: account.gst || "",
        currency: item.currency || account.currency || "",
        sector: item.sector || "",
        destinationCode: item.destination || "",
        pcs: item.pcs || 0,
        goodsDesc: item.goodstype || "",
        actWeight: item.totalActualWt || 0,
        volWeight: item.totalVolWt || 0,
        volDiscount: item.volDisc || 0,
        chgWeight: item.totalVolWt || 0,
        bagWeight: item.bag || 0,
        paymentType: item.payment || "",
        basicAmount: item.basicAmt || 0,
        discountPerKg: item.discount || 0,
        discountAmt: item.discountAmt || 0,
        basicAmtAfterDiscount: item.basicAmt || 0,
        rateHike: item.hikeAmt || 0,
        sgst: item.sgst || 0,
        cgst: item.cgst || 0,
        igst: item.sgst + item.cgst || item.igst || 0,
        handling: item.handlingAmount || 0,
        ovwt: item.overWtHandling || 0,
        mischg: item.miscChg || 0,
        miscRemark: item.miscChgReason || "",
        revenue: item.basicAmt || 0,
        grandTotal: item.totalAmt || 0,
      };
    });

    // ---------------------------
    // Comparison Mode
    // ---------------------------
    if (type === "Comparison") {
      const allShipments = await Shipment.find(query).lean();

      const allAccCodes = allShipments
        .map((s) => s.accountCode)
        .filter(Boolean);
      const allAccounts = await CustomerAccount.find({
        accountCode: { $in: allAccCodes },
      }).lean();

      const allAccMap = {};
      allAccounts.forEach((a) => (allAccMap[a.accountCode] = a));

      const comparison = {};

      allShipments.forEach((item) => {
        const acc = allAccMap[item.accountCode] || {};
        const key = `${item.customer}-${item.shipperState}`;

        if (!comparison[key]) {
          comparison[key] = {
            state: item.shipperState || "",
            customerName: item.customer || "",
            total: 0,
            awbCount: 0,
            chargeableWeight: 0,
            revenue: 0,
            igst: 0,
            grandTotal: 0,
          };
        }

        const row = comparison[key];
        row.total += item.totalAmt || 0;
        row.awbCount += 1;
        row.chargeableWeight += item.totalVolWt || 0;
        row.revenue += item.totalAmt || 0;
        row.igst += item.igst || 0;
        row.grandTotal += item.totalAmt || 0;
      });

      const arr = Object.values(comparison);
      const paginated = arr.slice((page - 1) * limit, page * limit);

      return NextResponse.json({
        data: paginated,
        totalPages: Math.ceil(arr.length / limit),
        totalCount: arr.length,
        page,
      });
    }

    // ---------------------------
    // DEFAULT: AWB / CLIENT WISE
    // ---------------------------
    return NextResponse.json({
      data: mapped,
      page,
      limit,
      totalPages,
      totalCount,
    });
  } catch (err) {
    console.error("ERROR in new-sale-report:", err);
    return NextResponse.json(
      { error: "Failed to fetch shipments" },
      { status: 500 }
    );
  }
}
