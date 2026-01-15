import connectDB from "@/app/lib/db";
import EventActivity from "@/app/model/EventActivity";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    console.log("Fetching POD Pending Summary (unique AWBs without DLV)...");

    // ✅ Step 1: fetch all event activities
    const allEvents = await EventActivity.find({}).select("awbNo eventCode");

    // ✅ Step 2: group by awbNo → keep only AWBs that do NOT have DLV
    const uniqueAWBs = new Map();

    for (const ev of allEvents) {
      const awb = ev.awbNo?.trim();
      if (!awb) continue;

      const hasDLV = ev.eventCode?.includes("DLV");
      const existing = uniqueAWBs.get(awb);

      // if we already saw a DLV for this AWB, skip
      if (existing === "DLV") continue;

      // if this record has DLV, mark AWB as delivered
      if (hasDLV) {
        uniqueAWBs.set(awb, "DLV");
      } else if (!existing) {
        // only mark as pending if not seen before
        uniqueAWBs.set(awb, "PENDING");
      }
    }

    // ✅ Step 3: count how many AWBs are still pending
    const podPendingCount = [...uniqueAWBs.values()].filter(
      (v) => v === "PENDING"
    ).length;

    const result = { podPendingCount };

    console.log("POD Pending Summary:", result);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error fetching POD summary:", error);
    return NextResponse.json(
      {
        message: "Error fetching POD summary",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
