import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();

    // total customers
    const totalCustomers = await CustomerAccount.countDocuments();

    // customers that have at least one shipment
    const workingCustomers = await Shipment.distinct("accountCode");
    const workingCount = workingCustomers.length;

    const nonWorkingCount = totalCustomers - workingCount;

    return NextResponse.json({
      working: workingCount,
      nonWorking: nonWorkingCount,
      total: totalCustomers,
    });
  } catch (error) {
    console.log("client stats error:", error);
    return NextResponse.json({ message: "server error" }, { status: 500 });
  }
}
