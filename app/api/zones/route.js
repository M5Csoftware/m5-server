import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db"; // Database connection utility
import Zone from "@/app/model/Zone"; // Zone model

// Connect to the database
await connectDB();

// POST: Create new zones
export async function POST(req) {
  try {
    const payload = await req.json();
    console.log("Received payload:", payload);

    // Check if it's the new format with zones array and metadata
    if (payload.zones && Array.isArray(payload.zones)) {
      const {
        zones,
        zoneTariff,
        sector,
        effectiveDateFrom,
        effectiveDateTo,
        remoteZones = [],
        unserviceableZones = []
      } = payload;

      // Validate required fields
      if (!zoneTariff || !sector) {
        return NextResponse.json(
          { error: "Zone Tariff and Sector are required." },
          { status: 400 }
        );
      }

      // Prepare zones with metadata
      const zonesToInsert = zones.map(zone => ({
        ...zone,
        zoneMatrix: zone.zoneMatrix || zoneTariff, // Use zoneTariff if not present
        effectiveDateFrom: effectiveDateFrom ? new Date(effectiveDateFrom) : null,
        effectiveDateTo: effectiveDateTo ? new Date(effectiveDateTo) : null,
        remoteZones: remoteZones.length > 0 ? remoteZones : [],
        unserviceableZones: unserviceableZones.length > 0 ? unserviceableZones : []
      }));

      console.log("Zones to insert:", zonesToInsert);

      // Insert zones into the database
      const createdZones = await Zone.insertMany(zonesToInsert);

      return NextResponse.json(
        {
          message: "Zones uploaded successfully",
          data: createdZones,
          count: createdZones.length,
          remoteZonesCount: remoteZones.length,
          unserviceableZonesCount: unserviceableZones.length
        },
        { status: 201 }
      );
    }
    // Fallback for old format (direct array)
    else if (Array.isArray(payload)) {
      const createdZones = await Zone.insertMany(payload);
      return NextResponse.json(
        { message: "Zones uploaded successfully", data: createdZones },
        { status: 201 }
      );
    }
    // Invalid format
    else {
      return NextResponse.json(
        { error: "Invalid data format. Expected zones array with metadata." },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error creating zones:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create zones" },
      { status: 500 }
    );
  }
}

// GET: Fetch zones (with filters if provided)
export async function GET(req) {
  try {
    // Extract query parameters from the request URL
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    // Create a filters object from query parameters
    const filters = {};
    searchParams.forEach((value, key) => {
      filters[key] = value;
    });

    // Fetch zones based on the filters or fetch all if no filters
    const zones = await Zone.find(filters).sort({ createdAt: -1 });
    
    return NextResponse.json(
      {
        zones,
        count: zones.length,
        filters: Object.keys(filters).length > 0 ? filters : null
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching zones:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Update a zone by ID
export async function PUT(req, { params }) {
  const { id } = params;
  try {
    const updateData = await req.json();
    
    // Handle date conversions if present
    if (updateData.effectiveDateFrom) {
      updateData.effectiveDateFrom = new Date(updateData.effectiveDateFrom);
    }
    if (updateData.effectiveDateTo) {
      updateData.effectiveDateTo = new Date(updateData.effectiveDateTo);
    }

    const updatedZone = await Zone.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedZone) {
      return NextResponse.json({ error: "Zone not found." }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Zone updated successfully", data: updatedZone },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating zone:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// DELETE: Delete a zone by ID
export async function DELETE(req, { params }) {
  const { id } = params;
  try {
    const deletedZone = await Zone.findByIdAndDelete(id);

    if (!deletedZone) {
      return NextResponse.json({ error: "Zone not found." }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Zone deleted successfully.", data: deletedZone },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting zone:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}