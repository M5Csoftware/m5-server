import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    let dateMatch = {};

    if (month && year) {
      const startDate = new Date(year, Number(month) - 1, 1);
      const endDate = new Date(year, Number(month), 1);

      dateMatch = {
        createdAt: { $gte: startDate, $lt: endDate },
      };
    }

    const result = await Shipment.aggregate([
      { $match: dateMatch },

      {
        $group: {
          _id: "$receiverState",

          shipments: { $sum: 1 },

          saleAmt: {
            $sum: {
              $cond: [{ $eq: ["$isHold", false] }, "$totalAmt", 0],
            },
          },

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
          state: "$_id",
          _id: 0,
          shipments: 1,
          saleAmt: 1,
          shipmentsOnHold: 1,
          outstanding: 1,
        },
      },

      { $sort: { state: 1 } },
    ]);

    return NextResponse.json(result);
  } catch (err) {
    console.error("State-wise error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
