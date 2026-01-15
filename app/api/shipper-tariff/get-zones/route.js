// app/api/shipper-tariff/get-zones/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Zone from "@/app/model/Zone";

/**
 * Normalize string for case-insensitive comparison
 */
function normalizeString(str) {
  if (!str || typeof str !== "string") return "";
  return str.trim().toLowerCase();
}

export async function GET(req) {
  await connectDB();
  try {
    const sector = req.nextUrl.searchParams.get("sector");
    console.log("🌍 Received sector parameter:", sector);

    if (!sector || sector.trim() === "") {
      console.log("⚠️ No sector provided, returning empty");
      return NextResponse.json(
        { services: [], zoneMatrix: [] },
        { status: 200 }
      );
    }

    // Clean the sector parameter (don't force uppercase yet)
    const cleanSector = sector.trim();
    console.log("🔍 Searching for sector (case-insensitive):", cleanSector);

    // Find zones for this sector using case-insensitive regex
    // This will match "Europe", "EUROPE", "europe", etc.
    const zones = await Zone.find({ 
      sector: { $regex: new RegExp(`^${cleanSector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") },
      isActive: true 
    }).lean();

    console.log(`✅ Found ${zones.length} zones for sector: ${cleanSector}`);

    if (zones.length === 0) {
      console.log("⚠️ No zones found for this sector");
      return NextResponse.json(
        { 
          services: [], 
          zoneMatrix: [],
          message: `No zones found for sector: ${cleanSector}`
        },
        { status: 200 }
      );
    }

    // Extract unique services - case-insensitive deduplication, preserve original case
    const servicesMap = new Map();
    zones.forEach(zone => {
      if (zone.service && zone.service.trim() !== "") {
        const normalized = normalizeString(zone.service);
        if (!servicesMap.has(normalized)) {
          servicesMap.set(normalized, zone.service); // Store original case
        }
      }
    });
    const services = Array.from(servicesMap.values()).sort();

    // Extract unique zoneMatrix values - case-insensitive deduplication, preserve original case
    const zoneMatrixMap = new Map();
    zones.forEach(zone => {
      if (zone.zoneMatrix && zone.zoneMatrix.trim() !== "") {
        const normalized = normalizeString(zone.zoneMatrix);
        if (!zoneMatrixMap.has(normalized)) {
          zoneMatrixMap.set(normalized, zone.zoneMatrix); // Store original case
        }
      }
    });
    const zoneMatrix = Array.from(zoneMatrixMap.values()).sort();

    console.log("📊 Services extracted:", services);
    console.log("📊 Zone Matrices extracted:", zoneMatrix);

    return NextResponse.json(
      { 
        services, 
        zoneMatrix,
        totalZones: zones.length,
        sector: cleanSector
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("❌ Error fetching zones:", error);
    return NextResponse.json(
      { 
        services: [], 
        zoneMatrix: [], 
        error: error.message 
      },
      { status: 500 }
    );
  }
}