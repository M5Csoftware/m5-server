import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";

await connectDB();

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const accountCode = searchParams.get("accountCode");
  const filter = searchParams.get("filter");
  const onlyCustomer = searchParams.get("onlyCustomer");

  if (!accountCode) {
    return NextResponse.json(
      { error: "Customer code is required" },
      { status: 400 }
    );
  }

  const query = {};

  // date filter
  if (from && to) {
    const start = new Date(from);
    const end = new Date(to);

    // validate
    if (!isNaN(start) && !isNaN(end)) {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      query.createdAt = {
        $gte: start,
        $lte: end,
      };
    }
  }

  // ✅ customer filter
  if (accountCode) {
    query.accountCode = accountCode.trim();
  }

  // ✅ fetch shipments once
  let shipments = await Shipment.find(query).lean();

  // ✅ case 1 → only customer name
  if (onlyCustomer === "true" && accountCode) {
    let customerName = "";

    // 1️⃣ Try to get from latest shipment
    if (shipments.length > 0) {
      customerName = shipments[0]?.customer || shipments[0]?.customerName || "";
    }

    // 2️⃣ Fallback to CustomerAccount if still empty
    if (!customerName) {
      const customer = await CustomerAccount.findOne({
        accountCode: accountCode.trim(),
      }).lean();
      customerName = customer?.name || ""; // <-- correct field in CustomerAccount
    }

    console.log("Query used:", query);
    console.log("Shipments found:", shipments.length);

    return NextResponse.json({
      accountCode,
      customerName,
    });
  }

  // ✅ case 2 → apply filter type
  if (filter === "Hike Amount") {
    shipments = shipments.filter((s) => s.hikeAmount && s.hikeAmount > 0);
  } else if (filter === "Less Amount") {
    shipments = shipments.filter((s) => s.lessAmount && s.lessAmount > 0);
  }

  // ✅ helper for formatting dates
  const formatDate = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // ✅ map schema → table columns
  const formatted = shipments.map((s) => ({
    awbNo: s.awbNo || "",

    accountCode: s.accountCode || "",
    customerName: s.customer || s.customerName || "",

    basicamt: s.basicAmt || 0,
    sgst: s.sgst || 0,
    cgst: s.cgst || 0,
    igst: s.igst || 0,
    mischg: s.miscChg || 0,
    miscRemark: s.miscChgReason || "",

    fuel: s.fuelAmt || 0,
    fuelPercent: s.fuelPercentage || 0,
    handling: s.handlingAmount || 0,
    OVWT: s.overWtHandling || 0,
    rateHike: s.volDisc || "",

    grandTotal: s.totalAmt || 0,
    hikeAmount: s.hikeAmount || 0, // ✅ for Hike filter
    lessAmount: s.lessAmount || 0, // ✅ for Less filter
    diffAmount: s.manualAmount || 0,

    insertDate: formatDate(s.createdAt),
    lastUpdateDate: formatDate(s.updatedAt),
    insertUser: s.insertUser || "",
    updateUser: s.updateUser || "",
  }));

  return NextResponse.json(formatted);
}
