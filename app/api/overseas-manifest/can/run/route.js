import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return NextResponse.json(
        { success: false, message: "runNo is required" },
        { status: 400 }
      );
    }

    const bag = await Bagging.findOne({ runNo }).lean();

    if (!bag) {
      return NextResponse.json(
        { success: false, message: "Bagging run not found", data: null },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: bag,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
