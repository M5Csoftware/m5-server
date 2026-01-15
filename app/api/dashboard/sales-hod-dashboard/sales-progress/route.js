import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import SalesTarget from "@/app/model/SalesTarget";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const monthStr = searchParams.get("month"); // e.g. "November-2025"

    const [monthName, year] = monthStr.split("-");
    const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();

    const startDate = new Date(Date.UTC(year, monthIndex, 1));
    const endDate = new Date(Date.UTC(year, monthIndex + 1, 1));

    const targets = await SalesTarget.find({ month: monthStr });

    const totalTarget = targets.reduce(
      (sum, t) => sum + (t.targetAmount || 0),
      0
    );

    let totalProgress = 0;
    let totalWeight = 0;

    for (const t of targets) {
      const codes = t.customersAssigned.map((c) => c.accountCode);

      const shipments = await Shipment.find({
        accountCode: { $in: codes },
        date: { $gte: startDate, $lt: endDate }, // << FIXED
      });

      totalProgress += shipments.reduce((s, x) => s + (x.totalAmt || 0), 0);
      totalWeight += shipments.reduce((s, x) => s + (x.totalActualWt || 0), 0);
    }

    return NextResponse.json({
      target: totalTarget,
      progress: totalProgress,
      weight: totalWeight,
    });
  } catch (err) {
    console.log("overall progress error:", err);
    return NextResponse.json({ message: "server error" }, { status: 500 });
  }
}
