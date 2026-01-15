import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

export async function POST(req) {
  try {
    await connectDB();
    const { awbNo, from, to, all, lock } = await req.json();

    // ALL shipments date-range
    if (all) {
      if (!from || !to) {
        return NextResponse.json(
          { message: "Pick both dates" },
          { status: 400 }
        );
      }

      // force full day range
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);

      const end = new Date(to);
      end.setHours(23, 59, 59, 999);

      const query = {
        createdAt: {
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
    }

    // Single AWB mode
    if (!awbNo) {
      return NextResponse.json(
        { field: "awbNo", message: "Enter AWB number" },
        { status: 400 }
      );
    }

    const exists = await Shipment.findOne({ awbNo });
    if (!exists) {
      return NextResponse.json(
        { field: "awbNo", message: "AWB not found" },
        { status: 404 }
      );
    }

    await Shipment.updateOne({ awbNo }, { $set: { completeDataLock: lock } });

    return NextResponse.json({
      message: lock ? "Locked successfully" : "Unlocked successfully",
    });
  } catch (err) {
    console.error("Data lock error:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
