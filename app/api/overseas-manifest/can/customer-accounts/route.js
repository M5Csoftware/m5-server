import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");

    const acc = await CustomerAccount.findOne({ accountCode: code }).lean();

    return NextResponse.json({
      success: true,
      data: acc || null,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
