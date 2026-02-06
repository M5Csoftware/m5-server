import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Zone from "@/app/model/Zone";

/**
 * GET /api/zones/destinations
 * Fetch available destinations for a given sector + service + zoneMatrix
 * Used by Rate Calculator cascading dropdowns
 *
 * Query params:
 * - sector: e.g., "UK"
 * - service: e.g., "EX DEL PREMIUM LHR DPD-UK"
 * - zoneMatrix: e.g., "SELF 2026"
 */
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const sector = searchParams.get("sector");
    const service = searchParams.get("service");
    const zoneMatrix = searchParams.get("zoneMatrix");

    console.log("Fetching destinations for:", { sector, service, zoneMatrix });

    // Validate required params
    if (!sector || !service) {
      return NextResponse.json(
        {
          success: false,
          message: "Sector and service are required",
        },
        { status: 400 },
      );
    }

    // Build query
    const query = {
      sector: { $regex: new RegExp(`^${sector.trim()}$`, "i") },
      service: { $regex: new RegExp(`^${service.trim()}$`, "i") },
    };

    // Add zoneMatrix if provided
    if (zoneMatrix && zoneMatrix.trim() !== "") {
      query.zoneMatrix = zoneMatrix.trim();
    }

    // Add date filter for currently active zones
    const currentDate = new Date();
    query.effectiveDateFrom = { $lte: currentDate };
    query.effectiveDateTo = { $gte: currentDate };

    console.log("Zone query:", JSON.stringify(query, null, 2));

    // Find zones matching the criteria
    const zones = await Zone.find(query)
      .select("destination zone zoneMatrix")
      .lean();

    console.log(`Found ${zones.length} zones`);

    if (zones.length === 0) {
      // Try without zoneMatrix to help debug
      const zonesWithoutMatrix = await Zone.find({
        sector: { $regex: new RegExp(`^${sector.trim()}$`, "i") },
        service: { $regex: new RegExp(`^${service.trim()}$`, "i") },
        effectiveDateFrom: { $lte: currentDate },
        effectiveDateTo: { $gte: currentDate },
      })
        .select("destination zone zoneMatrix")
        .limit(5)
        .lean();

      console.log("Available zone matrices for this sector/service:", [
        ...new Set(zonesWithoutMatrix.map((z) => z.zoneMatrix)),
      ]);

      return NextResponse.json(
        {
          success: false,
          message: "No destinations found for this service",
          debug: {
            sector,
            service,
            zoneMatrix,
            availableMatrices: [
              ...new Set(zonesWithoutMatrix.map((z) => z.zoneMatrix)),
            ],
          },
        },
        { status: 404 },
      );
    }

    // Return zones (frontend will extract unique destinations)
    return NextResponse.json(zones);
  } catch (error) {
    console.error("Error fetching destinations:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error fetching destinations",
        error: error.message,
      },
      { status: 500 },
    );
  }
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
