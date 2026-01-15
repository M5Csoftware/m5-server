import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";
import Ticket from "@/app/model/portal/Ticket";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();

    console.log("Fetching unified complaint + ticket summary...");

    // 🔹 1️⃣ Tickets data
    const tickets = await Ticket.find({}).select(
      "accountCode isResolved status"
    );

    // Build base summary
    const summaryMap = {};

    for (const t of tickets) {
      const code = t.accountCode?.trim();
      if (!code) continue;

      if (!summaryMap[code]) {
        summaryMap[code] = { resolved: 0, unresolved: 0 };
      }

      const isResolved =
        t.isResolved === true || t.status?.toLowerCase() === "close";

      if (isResolved) summaryMap[code].resolved++;
      else summaryMap[code].unresolved++;
    }

    // 🔹 2️⃣ Complaints data (linked by awbNo → Shipment.accountCode)
    const complaints = await Complaint.find({}).select(
      "awbNo isResolved status"
    );

    const awbNos = complaints.map((c) => c.awbNo);

    // Fetch related shipments to map awb → accountCode
    const shipments = await Shipment.find({
      awbNo: { $in: awbNos },
    }).select("awbNo accountCode");

    const awbToAccount = {};
    shipments.forEach((s) => {
      if (s.awbNo && s.accountCode) {
        awbToAccount[s.awbNo.trim()] = s.accountCode.trim();
      }
    });

    // Count complaint stats per accountCode
    for (const c of complaints) {
      const awb = c.awbNo?.trim();
      const accountCode = awbToAccount[awb];
      if (!accountCode) continue;

      if (!summaryMap[accountCode]) {
        summaryMap[accountCode] = { resolved: 0, unresolved: 0 };
      }

      const isResolved =
        c.isResolved === true || c.status?.toLowerCase() === "close";

      if (isResolved) summaryMap[accountCode].resolved++;
      else summaryMap[accountCode].unresolved++;
    }

    // 🔹 3️⃣ Fetch customer names
    const accountCodes = Object.keys(summaryMap);

    const customers = await CustomerAccount.find({
      accountCode: { $in: accountCodes },
    }).select("accountCode name companyName");

    // 🔹 4️⃣ Merge everything
    const result = accountCodes.map((code) => {
      const customer = customers.find((c) => c.accountCode === code);
      const name =
        customer?.name?.trim() ||
        customer?.companyName?.trim() ||
        "Unknown Customer";

      return {
        accountCode: code,
        name,
        resolved: summaryMap[code].resolved,
        unresolved: summaryMap[code].unresolved,
      };
    });

    console.log("Complaint Summary:", result);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error building unified complaint summary:", error);
    return NextResponse.json(
      {
        message: "Error building complaint summary",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
