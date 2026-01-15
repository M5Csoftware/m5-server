import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    await connectDB();
    const { branch, fromDate, toDate, lock } = await req.json();

    if (!branch || !fromDate || !toDate) {
      return NextResponse.json({ message: "Missing fields" }, { status: 400 });
    }

    // full-day range
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    // find customers in that branch
    const customers = await CustomerAccount.find({ branch }).select(
      "accountCode"
    );
    const codes = customers.map((c) => c.accountCode);

    if (!codes.length) {
      return NextResponse.json({ message: "No accounts found" });
    }

    // update shipments
    const update = await Shipment.updateMany(
      {
        accountCode: { $in: codes },
        createdAt: { $gte: start, $lte: end },
      },
      { $set: { completeDataLock: lock } }
    );

    return NextResponse.json({
      message: lock ? "Locked" : "Unlocked",
      count: update.modifiedCount,
    });
  } catch (err) {
    console.log("Branch lock error:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
