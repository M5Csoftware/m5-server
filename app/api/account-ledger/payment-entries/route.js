import connectDB from "@/app/lib/db";
import PaymentEntry from "@/app/model/PaymentEntry";
import { NextResponse } from "next/server";

await connectDB();

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const customerCode = searchParams.get("code");

  if (!customerCode) {
    return new NextResponse(
      JSON.stringify({ success: false, message: "Customer code is required" }),
      { status: 400 }
    );
  }

  try {
    const payments = await PaymentEntry.find({ customerCode }).sort({
      date: 1,
    });

    return new NextResponse(JSON.stringify({ success: true, payments }), {
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching payment entries:", error);
    return new NextResponse(
      JSON.stringify({ success: false, message: "Server error" }),
      { status: 500 }
    );
  }
}
