import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import ShipperTariff from "@/app/model/ShipperTariff";

export async function GET(req) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const customerCode = searchParams.get("customerCode");
  const rateTariff = searchParams.get("rateTariff");

  if (!customerCode || !rateTariff) {
    return NextResponse.json("", { status: 200 });
  }

  const doc = await ShipperTariff.findOne(
    { accountCode: customerCode },
    { ratesApplicable: 1 },
  ).lean();

  if (!doc?.ratesApplicable?.length) {
    return NextResponse.json("", { status: 200 });
  }

  const row = doc.ratesApplicable.find(
    (r) => r.rateTariff?.trim() === rateTariff.trim() && r.zoneMatrix?.trim(),
  );

  return NextResponse.json(row?.zoneMatrix?.trim() || "", { status: 200 });
}
