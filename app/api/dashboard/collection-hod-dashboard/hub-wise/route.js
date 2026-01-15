import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();

    // read query params
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    let dateFilter = {};

    if (month && year) {
      const start = new Date(year, Number(month) - 1, 1);
      const end = new Date(year, Number(month), 1);

      dateFilter = {
        createdAt: { $gte: start, $lt: end },
      };
    }

    const result = await Shipment.aggregate([
      { $match: dateFilter },

      {
        $group: {
          _id: "$origin",

          shipments: { $sum: 1 },

          saleAmt: {
            $sum: {
              $cond: [{ $eq: ["$isHold", false] }, "$totalAmt", 0],
            },
          },

          // FIXED CONDITION
          shipmentsOnHold: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$isHold", true] },
                    { $eq: ["$holdReason", "Credit Limit Exceeded"] },
                  ],
                },
                1,
                0,
              ],
            },
          },

          outstanding: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$isHold", true] },
                    { $eq: ["$holdReason", "Credit Limit Exceeded"] },
                  ],
                },
                "$totalAmt",
                0,
              ],
            },
          },
        },
      },

      {
        $project: {
          hub: "$_id",
          _id: 0,
          shipments: 1,
          saleAmt: 1,
          shipmentsOnHold: 1,
          outstanding: 1,
        },
      },

      { $sort: { hub: 1 } },
    ]);

    return NextResponse.json(result);
  } catch (err) {
    console.error("Hub-wise error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
