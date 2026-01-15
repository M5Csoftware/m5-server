// /credit-limit-temp/customer/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CreditLimitTemp from "@/app/model/CreditLimitTemp";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const customerCode = searchParams.get("customerCode")?.trim();

    if (!customerCode) {
      return NextResponse.json(
        { error: "customerCode query param required" },
        { status: 400 }
      );
    }

    // Fetch all credit limit temp records for this customer
    const records = await CreditLimitTemp.find({
      customerCode: customerCode.toUpperCase(),
    })
      .sort({ date: -1 }) // latest first
      .lean();

    if (!records || records.length === 0) {
      return NextResponse.json([], { status: 200 }); // return empty array, not error
    }

    return NextResponse.json(records, { status: 200 });
  } catch (err) {
    console.error("Error fetching credit limit temp records:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    );
  }
}
