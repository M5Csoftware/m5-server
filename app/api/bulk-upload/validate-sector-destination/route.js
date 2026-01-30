// File: app/api/bulk-upload/validate-sector-destination/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Zone from "@/app/model/Zone";

/**
 * POST /api/bulk-upload/validate-sector-destination
 * Validate that sector-destination-service combinations exist in zones
 */
export async function POST(request) {
  try {
    await connectDB();

    const { shipments } = await request.json();

    console.log("Sector-Destination-Service validation request received:", {
      totalShipments: shipments?.length,
      sampleShipment: shipments[0] || "No data",
    });

    // Validate input
    if (!shipments || !Array.isArray(shipments) || shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments data provided" },
        { status: 400 },
      );
    }

    // First, let's see what's in the database for debugging
    console.log("Checking database for USA -> NJ -> EX DEL US PR GR FEDEX...");

    // Debug: Check if the specific combination exists
    const testQuery = await Zone.findOne({
      sector: "USA",
      destination: "NJ",
      service: "EX DEL US PR GR FEDEX",
    });

    console.log("Test query result:", testQuery ? "FOUND!" : "NOT FOUND");
    if (testQuery) {
      console.log("Found document:", {
        _id: testQuery._id,
        sector: testQuery.sector,
        destination: testQuery.destination,
        service: testQuery.service,
        isActive: testQuery.isActive,
      });
    }

    // Extract unique sector-destination-service combinations
    const sectorDestinationServiceTriplets = new Map();

    shipments.forEach((shipment, index) => {
      // Trim and convert to uppercase for consistent comparison
      const sector = shipment.Sector?.toString().trim().toUpperCase() || "";
      const destination =
        shipment.Destination?.toString().trim().toUpperCase() || "";
      const service =
        shipment.ServiceName?.toString().trim().toUpperCase() || "";

      console.log(
        `Row ${index + 2}: Sector="${sector}", Destination="${destination}", Service="${service}"`,
      );

      if (!sector || !destination || !service) {
        console.log(
          `Row ${index + 2}: Skipping - missing sector, destination, or service`,
        );
        return;
      }

      const key = `${sector}|${destination}|${service}`;

      if (!sectorDestinationServiceTriplets.has(key)) {
        sectorDestinationServiceTriplets.set(key, {
          sector,
          destination,
          service,
          rowIndices: [index + 2], // +2 because Excel rows start at 1 and header is row 1
        });
      } else {
        sectorDestinationServiceTriplets.get(key).rowIndices.push(index + 2);
      }
    });

    console.log(
      "Unique triplets to validate:",
      Array.from(sectorDestinationServiceTriplets.values()),
    );

    // Validate each triplet against zones collection
    const validationErrors = [];

    for (const [
      key,
      { sector, destination, service, rowIndices },
    ] of sectorDestinationServiceTriplets) {
      try {
        console.log(`\nValidating: ${sector} → ${destination} → ${service}`);

        // SIMPLE EXACT MATCH QUERY - NO REGEX, NO CASE SENSITIVITY ISSUES
        const zoneExists = await Zone.findOne({
          sector: sector,
          destination: destination,
          service: service,
          // REMOVED isActive filter for now - check if field exists
        });

        console.log("Query result:", zoneExists ? "FOUND" : "NOT FOUND");

        if (zoneExists) {
          console.log("Found zone:", {
            id: zoneExists._id,
            dbSector: zoneExists.sector,
            dbDestination: zoneExists.destination,
            dbService: zoneExists.service,
            isActive: zoneExists.isActive,
            hasIsActiveField: "isActive" in zoneExists,
          });
        }

        if (!zoneExists) {
          // Let's see what similar records exist
          const similarRecords = await Zone.find({
            $or: [
              { sector: sector },
              { destination: destination },
              { service: service },
            ],
          }).limit(3);

          console.log(
            "Similar records in DB:",
            similarRecords.map((r) => ({
              sector: r.sector,
              destination: r.destination,
              service: r.service,
            })),
          );

          validationErrors.push({
            sector,
            destination,
            service,
            rowIndices,
            message: `❌ Invalid combination: "${sector}" → "${destination}" → "${service}" not found in zones`,
            type: "sector-destination-service-mismatch",
          });
        } else {
          console.log(`✅ VALID: ${sector} → ${destination} → ${service}`);
        }
      } catch (queryError) {
        console.error(`Error querying zone:`, queryError);
        validationErrors.push({
          sector,
          destination,
          service,
          rowIndices,
          message: `⚠️ Error validating combination: ${queryError.message}`,
          type: "validation-error",
        });
      }
    }

    // Return results
    if (validationErrors.length > 0) {
      console.log(`\n🚫 Validation failed: ${validationErrors.length} errors`);
      return NextResponse.json({
        success: false,
        message: "Sector-destination-service validation failed",
        validationErrors,
        totalTriplets: sectorDestinationServiceTriplets.size,
        invalidTriplets: validationErrors.length,
        validTriplets:
          sectorDestinationServiceTriplets.size - validationErrors.length,
      });
    }

    console.log(
      `\n✅ All ${sectorDestinationServiceTriplets.size} combinations are valid`,
    );
    return NextResponse.json({
      success: true,
      message: "All sector-destination-service combinations are valid",
      totalTriplets: sectorDestinationServiceTriplets.size,
      validTriplets: sectorDestinationServiceTriplets.size,
    });
  } catch (error) {
    console.error("Sector-Destination-Service validation error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error validating sector-destination-service combinations",
        error: error.message,
        errorName: error.name,
      },
      { status: 500 },
    );
  }
}
