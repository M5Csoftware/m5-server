import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const awb = searchParams.get("awb");

    const shipment = await Shipment.findOne({ awbNo: awb }).lean();

    return NextResponse.json({
      success: true,
      data: shipment || null,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
