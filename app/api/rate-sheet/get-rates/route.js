import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import RateSheet from "@/app/model/RateSheet";

connectDB();

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const shipper = searchParams.get("shipper");
    const service = searchParams.get("service");
    const zone = searchParams.get("zone");
    const weight = parseFloat(searchParams.get("weight")) || 0;

    console.log("RateSheet lookup params:", { shipper, service, zone, weight });

    // Find matching rate sheets
    const rateSheets = await RateSheet.find({
      shipper: shipper,
      service: service,
      minWeight: { $lte: weight },
      maxWeight: { $gte: weight },
    }).sort({ minWeight: 1 });

    if (rateSheets.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No rate sheet found for given parameters",
      });
    }

    const rateSheet = rateSheets[0];
    const zoneKey = zone.toString();
    const rate = rateSheet[zoneKey];

    if (rate === undefined || rate === null) {
      return NextResponse.json({
        success: false,
        message: `No rate found for zone ${zone}`,
      });
    }

    return NextResponse.json({
      success: true,
      rate: parseFloat(rate),
      weightRange: {
        min: rateSheet.minWeight,
        max: rateSheet.maxWeight,
      },
      shipper: shipper,
      service: service,
      zone: zone,
    });
  } catch (error) {
    console.error("RateSheet API error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error fetching rate",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
