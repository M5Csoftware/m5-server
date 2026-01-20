import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Zone from "@/app/model/Zone";

export async function GET(req) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const zoneTariff = searchParams.get("zoneTariff");

  console.log("Zone List API - Received zoneTariff:", zoneTariff);

  if (!zoneTariff || !zoneTariff.trim()) {
    console.log("No zone tariff provided");
    return NextResponse.json([], { status: 200 });
  }

  try {
    // Clean the zoneTariff value
    const cleanZoneTariff = zoneTariff.trim();
    console.log("Searching for zoneMatrix:", cleanZoneTariff);

    // Find ALL zone entries with this zoneMatrix
    const zoneData = await Zone.find({
      zoneMatrix: cleanZoneTariff,
    })
      .select("service sector zone destination zoneMatrix -_id")
      .sort({ zone: 1 }); // Sort by zone number ascending

    console.log(
      `Found ${zoneData.length} zone entries for zoneMatrix: "${cleanZoneTariff}"`,
    );

    // Log first few entries to debug
    if (zoneData.length > 0) {
      console.log("First 3 zone entries:", zoneData.slice(0, 3));
    }

    // Transform data to match expected format
    const transformedData = zoneData.map((zone) => ({
      service: zone.service || "",
      sector: zone.sector || "",
      zone: zone.zone || "",
      destination: zone.destination || "",
      zoneMatrix: zone.zoneMatrix || "", // Keep for debugging
    }));

    return NextResponse.json(transformedData, { status: 200 });
  } catch (error) {
    console.error("Zone List API Error:", error);
    return NextResponse.json(
      { error: `Failed to fetch zone list: ${error.message}` },
      { status: 500 },
    );
  }
}
