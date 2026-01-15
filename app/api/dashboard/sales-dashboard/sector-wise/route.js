// app/api/dashboard/sales-dashboard/sector-wise/route.js

import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import SalesTarget from "@/app/model/SalesTarget";
import { NextResponse } from "next/server";
import dayjs from "dayjs";

export async function POST(request) {
  try {
    await connectDB();

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { message: "userId is required" },
        { status: 400 }
      );
    }

    // Option 1 fix applied — ignore month
    const salesTarget = await SalesTarget.findOne({ userId });

    if (!salesTarget || !salesTarget.customersAssigned?.length) {
      return NextResponse.json({
        "Last 7 Days": [],
        "Last 30 Days": [],
        "Last Year": [],
      });
    }

    const assignedAccountCodes = salesTarget.customersAssigned.map(
      (c) => c.accountCode
    );

    const now = dayjs();
    const last7 = now.subtract(7, "day").toDate();
    const last30 = now.subtract(30, "day").toDate();
    const lastYear = now.subtract(1, "year").toDate();

    const getSectorData = async (startDate) => {
      const agg = await Shipment.aggregate([
        {
          $match: {
            accountCode: { $in: assignedAccountCodes },
            date: { $gte: startDate },
            sector: { $exists: true, $ne: "" },
          },
        },
        {
          $group: {
            _id: "$sector",
            totalAmount: { $sum: "$totalAmt" },
          },
        },
        {
          $sort: { totalAmount: -1 },
        },
      ]);

      return agg.map((item) => ({
        label: item._id,
        value: Math.round(item.totalAmount),
      }));
    };

    const [d7, d30, dYear] = await Promise.all([
      getSectorData(last7),
      getSectorData(last30),
      getSectorData(lastYear),
    ]);

    return NextResponse.json({
      "Last 7 Days": d7,
      "Last 30 Days": d30,
      "Last Year": dYear,
    });
  } catch (err) {
    return NextResponse.json(
      { message: "Failed", error: err.message },
      { status: 500 }
    );
  }
}
