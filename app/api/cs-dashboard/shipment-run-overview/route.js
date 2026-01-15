import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();

    // 1️⃣ Active runs (not delivered)
    const activeShipments = await Shipment.aggregate([
      {
        $match: {
          status: { $ne: "Delivered" },
          runNo: { $ne: "" },
        },
      },
      {
        $group: {
          _id: "$runNo",
          totalBags: { $addToSet: "$bag" },
          totalWeight: { $sum: "$totalActualWt" },
          runStatuses: { $addToSet: "$status" },
        },
      },
    ]);

    const activeRuns = activeShipments.length;
    const totalBags = activeShipments.reduce(
      (acc, r) => acc + r.totalBags.length,
      0
    );
    const totalWeight = activeShipments.reduce(
      (acc, r) => acc + r.totalWeight,
      0
    );

    // 2️⃣ Delays Notified → runs having any shipment with status “Delayed” or “Hold”
    const delaysNotified = await Shipment.distinct("runNo", {
      status: { $in: ["Delayed", "Hold", "On Hold", "In Delay"] },
      runNo: { $ne: "" },
    });

    // 3️⃣ Pending Pre-Alerts → runs with status “Pending Pre-Alert”
    const pendingPreAlerts = await Shipment.distinct("runNo", {
      status: { $in: ["Pending Pre-Alert", "Pre-Alert Pending"] },
      runNo: { $ne: "" },
    });

    // Prepare response in your dashboard format
    const data = [
      { label: "Active Runs", value: activeRuns },
      { label: "Delays Notified", value: delaysNotified.length },
      { label: "Total Bags", value: totalBags },
      { label: "Pending Pre-Alerts", value: pendingPreAlerts.length },
      { label: "Total Weight", value: `${totalWeight.toFixed(2)} kg` },
    ];

    return NextResponse.json(data);
  } catch (err) {
    console.error("Shipment Run Overview error:", err);
    return NextResponse.json(
      { error: "Failed to fetch shipment run overview" },
      { status: 500 }
    );
  }
}
