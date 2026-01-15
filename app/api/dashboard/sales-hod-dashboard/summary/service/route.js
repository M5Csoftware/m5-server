import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

// Convert month string → date range
function getMonthRange(monthStr) {
  if (!monthStr) return null;

  let start, end;

  // Case: YYYY-MM
  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    start = new Date(`${monthStr}-01`);
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  // Case: Month-YYYY
  const parts = monthStr.split("-");
  if (parts.length === 2) {
    const [m, y] = parts;
    const monthIndex = new Date(`${m} 1, ${y}`).getMonth();

    if (!isNaN(monthIndex)) {
      start = new Date(y, monthIndex, 1);
      end = new Date(y, monthIndex + 1, 1);
      return { start, end };
    }
  }

  return null;
}

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const range = getMonthRange(month);

    // Build match query
    const matchQuery = {
      service: { $nin: ["", null] },
    };

    // Apply month filter using correct field: "date"
    if (range) {
      matchQuery.date = { $gte: range.start, $lt: range.end };
    }

    const data = await Shipment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$service",
          awb: { $sum: 1 },
          chgWt: { $sum: "$chargeableWt" },
          total: { $sum: "$totalAmt" },
        },
      },
      {
        $project: {
          _id: 0,
          service: "$_id",
          awb: 1,
          chgWt: 1,
          total: 1,
        },
      },
    ]);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Service summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch service summary" },
      { status: 500 }
    );
  }
}
