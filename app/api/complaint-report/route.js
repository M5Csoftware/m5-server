import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

const parseDDMMYYYY = (str, end = false) => {
  const [d, m, y] = str.split("/").map(Number);

  if (!d || !m || !y) return null;

  // UTC-safe range
  return end
    ? new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
    : new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
};

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { success: false, message: "from and to dates required" },
        { status: 400 }
      );
    }

    // Change this: Parse ISO dates from your frontend (YYYY-MM-DD format)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    // 1️⃣ Fetch complaints by createdAt (not date)
    const complaints = await Complaint.find({
      createdAt: { $gte: fromDate, $lte: toDate }, // CHANGED: date → createdAt
    }).lean();

    if (!complaints.length) {
      return NextResponse.json({ success: true, reports: [] });
    }

    // 2️⃣ Get all AWBs
    const awbNos = complaints.map((c) => c.awbNo).filter(Boolean);

    // 3️⃣ Fetch shipments in one query
    const shipments = await Shipment.find({ awbNo: { $in: awbNos } }).lean();

    const shipmentMap = {};
    shipments.forEach((s) => {
      shipmentMap[s.awbNo] = s;
    });

    // 4️⃣ Fetch customers in one query
    const accountCodes = [
      ...new Set(shipments.map((s) => s.accountCode).filter(Boolean)),
    ];

    const customers = await CustomerAccount.find({
      accountCode: { $in: accountCodes },
    }).lean();

    const customerMap = {};
    customers.forEach((c) => {
      customerMap[c.accountCode] = c;
    });

    // 5️⃣ Build report rows
    const reports = complaints.map((comp) => {
      const shipment = shipmentMap[comp.awbNo] || {};
      const customer = customerMap[shipment.accountCode] || {};

      return {
        complaintNo: comp.complaintNo || "",
        jobID: comp.complaintID || "",
        compDate: comp.createdAt
          ? new Date(comp.createdAt).toLocaleDateString()
          : "",
        awbNo: comp.awbNo || "",
        customerCode: shipment.accountCode || "",
        customerName: customer.name || shipment.receiverFullName || "",
        sector: shipment.sector || "",
        compType: comp.complaintType || "",
        caseType: comp.caseType || "",
        assignTo: comp.assignTo || "",
        status: comp.status || "",
        action: comp.history?.[0]?.action || "",
        actionUser: comp.history?.[0]?.actionUser || "",
      };
    });

    return NextResponse.json({ success: true, reports });
  } catch (err) {
    console.error("Complaint report error:", err);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
