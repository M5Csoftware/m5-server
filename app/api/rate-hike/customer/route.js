import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import ShipperTariff from "@/app/model/ShipperTariff";

export async function GET(req) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const customerCode = searchParams.get("customerCode");

  if (!customerCode) {
    return NextResponse.json([], { status: 200 });
  }

  const doc = await ShipperTariff.findOne(
    { accountCode: customerCode },
    { ratesApplicable: 1 },
  ).lean();

  if (!doc || !doc.ratesApplicable || doc.ratesApplicable.length === 0) {
    return NextResponse.json([], { status: 200 });
  }

  const map = {};

  for (const r of doc.ratesApplicable) {
    if (!r.rateTariff?.trim() || !r.service?.trim()) continue;

    const tariff = r.rateTariff.trim();

    if (!map[tariff]) {
      map[tariff] = new Set();
    }
    map[tariff].add(r.service.trim());
  }

  const result = Object.entries(map).map(([rateTariff, services]) => ({
    _id: rateTariff,
    label: rateTariff,
    services: Array.from(services).map((s) => ({
      label: s,
      value: s,
    })),
  }));

  return NextResponse.json(result, { status: 200 });
}
