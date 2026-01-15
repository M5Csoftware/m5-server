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

    // 1️⃣ Fetch SalesTarget for this user & month
    const st = await SalesTarget.findOne({ userId, month: monthString });

    if (!st) {
      return NextResponse.json({ list: [] });
    }

    // Extract customer accountCodes only
    const customers = st.customersAssigned.map((c) => c.accountCode);

    // Date range for shipments
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    // 2️⃣ Group shipments by customer
    const list = await Shipment.aggregate([
      {
        $match: {
          accountCode: { $in: customers },
          date: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: "$accountCode",
          totalAmount: { $sum: "$totalAmt" },
          totalWeight: { $sum: "$totalActualWt" }, // change if needed
        },
      },
      {
        $sort: { totalAmount: -1 }, // highest revenue first
      },
    ]);

    // 3️⃣ Attach customer name (from SalesTarget) and format result
    const formatted = list.map((item) => {
      const customer = st.customersAssigned.find(
        (c) => c.accountCode === item._id
      );

      return {
        id: item._id,
        name: customer?.name || "Unknown",
        image: "/user.png", // default avatar
        state: st.stateAssigned || "-", // optional
        weight: item.totalWeight || 0,
        amount: item.totalAmount || 0,
      };
    });

    return NextResponse.json({ list: formatted });
  } catch (err) {
    console.log("TOP_LIST_ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
