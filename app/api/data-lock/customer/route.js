import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

export async function POST(req) {
  try {
    await connectDB();
    const { accountCode, from, to, lock } = await req.json();

    if (!accountCode) {
      return NextResponse.json(
        { message: "Enter customer code" },
        { status: 400 }
      );
    }

    if (!from || !to) {
      return NextResponse.json({ message: "Pick both dates" }, { status: 400 });
    }

    // full day range
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);

    const end = new Date(to);
    end.setHours(23, 59, 59, 999);

    const query = {
      accountCode,
      date: {
        $gte: start,
        $lte: end,
      },
    };

    const update = await Shipment.updateMany(query, {
      $set: { completeDataLock: lock },
    });

    return NextResponse.json({
      message: `${lock ? "Locked" : "Unlocked"} ${
        update.modifiedCount
      } shipments`,
    });
  } catch (err) {
    console.error("Customer lock error:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
