import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import SalesTarget from "@/app/model/SalesTarget";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month"); // "2025-11"
    const userId = searchParams.get("userId");

    if (!monthParam || !userId) {
      return NextResponse.json(
        { error: "month and userId required" },
        { status: 400 }
      );
    }

    // Convert "2025-11" → "November-2025"
    const [year, month] = monthParam.split("-");
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const monthString = `${monthNames[Number(month) - 1]}-${year}`;

    // 1️⃣ Find SalesTarget for this month
    const st = await SalesTarget.findOne({
      userId,
      month: monthString, // <-- correct match
    });

    if (!st) {
      return NextResponse.json({ current: 0, target: 0, customers: [] });
    }

    // Extract accountCodes only
    const customers = st.customersAssigned.map((c) => c.accountCode);

    const target = st.targetAmount || 0;

    // Build date range for shipments
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    // 2️⃣ Aggregate shipments for these customers
    const agg = await Shipment.aggregate([
      {
        $match: {
          accountCode: { $in: customers },
          date: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmt" }, // correct revenue field
        },
      },
    ]);

    const current = agg[0]?.total || 0;

    return NextResponse.json({
      userId,
      month: monthString,
      customers,
      current,
      target,
    });
  } catch (err) {
    console.log("TARGET_CARD_ERR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
