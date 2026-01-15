import connectDB from "@/app/lib/db";
import SalesTarget from "@/app/model/SalesTarget";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    await connectDB();

    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ message: "userId required" }, { status: 400 });
    }

    const target = await SalesTarget.findOne({ userId });
    if (!target || !target.customersAssigned?.length) {
      return NextResponse.json([]);
    }

    const assigned = target.customersAssigned.map((c) => c.accountCode);

    // Basic logic — treat accounts with any shipment as active
    const activeCount = await Shipment.distinct("accountCode", {
      accountCode: { $in: assigned },
    });

    const inactive = assigned.length - activeCount.length;

    const result = [
      {
        name: "Active",
        value: activeCount.length,
        color: "#34A853", // green
      },
      {
        name: "Inactive",
        value: inactive,
        color: "#EA4335", // red
      },
    ];

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
