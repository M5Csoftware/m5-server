import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import RateSheet from "@/app/model/RateSheet";

export async function GET(req) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const customerCode = searchParams.get("customerCode");
  const rateTariff = searchParams.get("rateTariff");
  const service = searchParams.get("service");
  const zoneTariff = searchParams.get("zoneTariff");

  if (!customerCode || !rateTariff || !service || !zoneTariff) {
    return NextResponse.json([], { status: 200 });
  }

  const rows = await RateSheet.find({
    shipper: customerCode,
    rateSheetName: rateTariff,
    service,
    zoneTariff,
  }).lean();

  return NextResponse.json(rows || [], { status: 200 });
}
