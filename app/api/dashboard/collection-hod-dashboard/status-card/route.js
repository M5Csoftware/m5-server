import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import dayjs from "dayjs";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "All Time";

    let dateFilter = {};

    if (range === "Today") {
      dateFilter = {
        createdAt: {
          $gte: dayjs().startOf("day").toDate(),
          $lte: dayjs().endOf("day").toDate(),
        },
      };
    }

    if (range === "Last 7 Days") {
      dateFilter = { createdAt: { $gte: dayjs().subtract(7, "day").toDate() } };
    }

    if (range === "Last 30 Days") {
      dateFilter = {
        createdAt: { $gte: dayjs().subtract(30, "day").toDate() },
      };
    }

    if (range === "This Month") {
      dateFilter = {
        createdAt: {
          $gte: dayjs().startOf("month").toDate(),
          $lte: dayjs().endOf("month").toDate(),
        },
      };
    }

    // ----------- SALES TOTAL (Not on hold) -----------
    const salesData = await Shipment.aggregate([
      { $match: { ...dateFilter, isHold: false } },
      { $group: { _id: null, total: { $sum: "$totalAmt" } } },
    ]);

    // ----------- OUTSTANDING TOTAL (ONLY Credit Limit Exceeded) -----------
    const outstandingData = await Shipment.aggregate([
      {
        $match: {
          ...dateFilter,
          isHold: true,
          holdReason: "Credit Limit Exceeded",
        },
      },
      { $group: { _id: null, total: { $sum: "$totalAmt" } } },
    ]);

    return NextResponse.json({
      sales: salesData[0]?.total || 0,
      outstanding: outstandingData[0]?.total || 0,
    });
  } catch (err) {
    console.error("Status card error:", err);
    return NextResponse.json({ sales: 0, outstanding: 0 }, { status: 500 });
  }
}
