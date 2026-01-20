import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db"; // Database connection utility
import RateSheet from "@/app/model/RateSheet"; // RateSheet model
import mongoose from "mongoose";

// Connect to the database
await connectDB();

// GET - Fetch rate sheets for rate hike based on filters
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    // Get query parameters
    const shipper = searchParams.get("shipper");
    const service = searchParams.get("service");
    const network = searchParams.get("network");

    console.log("Rate Hike API - Received params:", {
      shipper,
      service,
      network,
    });

    // Validate required parameter
    if (!shipper) {
      return NextResponse.json(
        { error: "Shipper (rate tariff) is required" },
        { status: 400 },
      );
    }

    // Build the query
    const query = { shipper };

    // Add optional filters
    if (service && service !== "undefined" && service !== "null") {
      query.service = service;
    }

    if (network && network !== "undefined" && network !== "null") {
      query.network = network;
    }

    console.log("Rate Hike API - Database query:", query);

    // Fetch rate sheets from the database
    const rateSheets = await RateSheet.find(query);

    console.log(`Rate Hike API - Found ${rateSheets.length} rate sheets`);

    // Transform data to match frontend table format
    const transformedData = rateSheets.map((sheet) => {
      const row = {
        _id: sheet._id,
        minWeight: sheet.minWeight,
        maxWeight: sheet.maxWeight,
        shipper: sheet.shipper,
        service: sheet.service,
        network: sheet.network,
        type: sheet.type,
      };

      // Add zone columns (1-35)
      for (let i = 1; i <= 35; i++) {
        const zoneKey = `${i}`;
        // Check if zones exist as an object or if zone values are at root level
        if (sheet.zones && typeof sheet.zones === "object") {
          row[zoneKey] =
            sheet.zones[zoneKey] || sheet.zones[`zone${i}`] || null;
        } else {
          // If zones are at root level
          row[zoneKey] = sheet[zoneKey] || sheet[`zone${i}`] || null;
        }
      }

      return row;
    });

    // Sort by minWeight ascending
    transformedData.sort((a, b) => a.minWeight - b.minWeight);

    return NextResponse.json(transformedData, { status: 200 });
  } catch (error) {
    console.error("Rate Hike API Error:", error);
    return NextResponse.json(
      {
        error: `An error occurred while fetching rate sheets: ${error.message}`,
      },
      { status: 500 },
    );
  }
}

// PUT - Bulk update multiple rate sheets (for rate hike application)
export async function PUT(req) {
  try {
    const updates = await req.json();

    if (!Array.isArray(updates)) {
      return NextResponse.json(
        { error: "Expected an array of rate sheet updates" },
        { status: 400 },
      );
    }

    console.log(`Rate Hike API - Bulk updating ${updates.length} rate sheets`);

    // Validate all updates have _id
    for (const update of updates) {
      if (!update._id) {
        return NextResponse.json(
          { error: "Missing _id in update data" },
          { status: 400 },
        );
      }
    }

    // Prepare bulk operations - Using bulkWrite for better performance
    const bulkOperations = updates.map((update) => {
      const { _id, ...updateData } = update;

      // Create the update document
      const updateDoc = { $set: updateData };

      return {
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(_id) },
          update: updateDoc,
        },
      };
    });

    console.log(`Executing bulkWrite with ${bulkOperations.length} operations`);

    // Execute bulk write
    const result = await RateSheet.bulkWrite(bulkOperations, {
      ordered: false,
    });

    console.log("Bulk write result:", {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
    });

    // Fetch the updated documents to return
    const updatedIds = updates.map((update) => update._id);
    const updatedRateSheets = await RateSheet.find({
      _id: { $in: updatedIds.map((id) => new mongoose.Types.ObjectId(id)) },
    });

    return NextResponse.json(
      {
        message: "Rate sheets updated successfully",
        count: updatedRateSheets.length,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        data: updatedRateSheets,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Rate Hike API Bulk Update Error:", error);

    // Check if it's a validation error
    if (error.name === "ValidationError") {
      return NextResponse.json(
        {
          error: `Validation error: ${error.message}`,
          details: error.errors,
        },
        { status: 400 },
      );
    }

    // Check if it's a MongoDB duplicate error
    if (error.code === 11000) {
      return NextResponse.json(
        {
          error: "Duplicate key error",
          keyValue: error.keyValue,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error: `An error occurred while updating rate sheets: ${error.message}`,
      },
      { status: 500 },
    );
  }
}
