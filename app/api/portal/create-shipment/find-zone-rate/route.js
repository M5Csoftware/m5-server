import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import ShipperTariff from "@/app/model/ShipperTariff";
import Zone from "@/app/model/Zone";

connectDB();

export async function GET(req) {
  try {
    const { searchParams } = req.nextUrl;

    const accountCode = searchParams.get("accountCode");
    const sector = searchParams.get("sector");
    const destination = searchParams.get("destination");
    const service = searchParams.get("service");
    const date = new Date(searchParams.get("date"));

    if (!accountCode || !sector || !destination || !service) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    /* ===========================
       1️⃣ FIND RATE TARIFF FIRST
    ============================ */
    const shipper = await ShipperTariff.findOne({
      accountCode: accountCode.toUpperCase(),
      "ratesApplicable.service": {
        $regex: new RegExp(`^${service.trim()}$`, "i"),
      },
      "ratesApplicable.from": { $lte: date },
      "ratesApplicable.to": { $gte: date },
    });

    if (!shipper) {
      return NextResponse.json(
        { error: "Rate tariff not found" },
        { status: 404 },
      );
    }

    const rateRow = shipper.ratesApplicable.find(
      (r) =>
        r.service.trim().toUpperCase() === service.trim().toUpperCase() &&
        r.sector.trim().toUpperCase() === sector.trim().toUpperCase() &&
        date >= new Date(r.from) &&
        date <= new Date(r.to),
    );

    if (!rateRow) {
      return NextResponse.json(
        { error: "Rate slab not applicable" },
        { status: 404 },
      );
    }

    /* ===========================
       2️⃣ FIND ZONE USING zoneMatrix
    ============================ */
    const zone = await Zone.findOne({
      zoneMatrix: rateRow.zoneMatrix,
      sector: { $regex: new RegExp(`^${sector}$`, "i") },
      destination: { $regex: new RegExp(`^${destination}$`, "i") },
      service: { $regex: new RegExp(`^${service}$`, "i") },
      effectiveDateFrom: { $lte: date },
      effectiveDateTo: { $gte: date },
    });

    if (!zone) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    /* ===========================
       3️⃣ SUCCESS
    ============================ */
    return NextResponse.json({
      success: true,
      zone: zone.zone,
      rateTariff: rateRow.rateTariff,
      zoneMatrix: rateRow.zoneMatrix,
      network: rateRow.network,
      mode: rateRow.mode,
    });
  } catch (err) {
    console.error("find-zone-rate error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
