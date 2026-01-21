// FILE: app/api/rate-sheet/route.js
// Single route handling all CRUD operations for rate sheets

import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import RateSheet from "@/app/model/RateSheet";

// Connect to the database
await connectDB();

// POST - Upload rate sheets (bulk) OR Create/Update/Delete based on action
export async function POST(req) {
  try {
    const body = await req.json();
    
    // Check if this is an action-based request (update/delete)
    if (body.action) {
      const { action, id, ids, data } = body;
      
      // UPDATE single rate sheet
      if (action === "update" && id) {
        if (!data || Object.keys(data).length === 0) {
          return NextResponse.json({ error: "No data provided for update." }, { status: 400 });
        }

        const updatedRateSheet = await RateSheet.findByIdAndUpdate(
          id,
          data,
          { new: true, runValidators: true }
        );

        if (!updatedRateSheet) {
          return NextResponse.json({ error: "Rate sheet not found." }, { status: 404 });
        }

        return NextResponse.json(
          { message: "Rate sheet updated successfully", data: updatedRateSheet },
          { status: 200 }
        );
      }
      
      // DELETE single rate sheet
      if (action === "delete" && id) {
        const deletedRateSheet = await RateSheet.findByIdAndDelete(id);

        if (!deletedRateSheet) {
          return NextResponse.json({ error: "Rate sheet not found." }, { status: 404 });
        }

        return NextResponse.json(
          { message: "Rate sheet deleted successfully", data: deletedRateSheet },
          { status: 200 }
        );
      }
      
      // BATCH DELETE multiple rate sheets
      if (action === "batchDelete" && ids && Array.isArray(ids)) {
        const result = await RateSheet.deleteMany({ _id: { $in: ids } });

        return NextResponse.json(
          { 
            message: `Successfully deleted ${result.deletedCount} rate sheet(s)`,
            deletedCount: result.deletedCount
          },
          { status: 200 }
        );
      }
      
      // BATCH UPDATE multiple rate sheets
      if (action === "batchUpdate" && ids && Array.isArray(ids) && data) {
        const result = await RateSheet.updateMany(
          { _id: { $in: ids } },
          { $set: data }
        );

        return NextResponse.json(
          {
            message: `Successfully updated ${result.modifiedCount} rate sheet(s)`,
            modifiedCount: result.modifiedCount
          },
          { status: 200 }
        );
      }

      return NextResponse.json({ error: "Invalid action or missing parameters." }, { status: 400 });
    }
    
    // Default: BULK UPLOAD rate sheets
    const rateSheetData = body;
    
    // Validate data format
    if (!Array.isArray(rateSheetData)) {
      return NextResponse.json({ error: "Invalid data format. Expected an array." }, { status: 400 });
    }

    // Validate each rate sheet object
    for (let sheet of rateSheetData) {
      const { shipper, network, service, type, minWeight, maxWeight } = sheet;
      if (!shipper || !network || !service || !type || minWeight === undefined || maxWeight === undefined) {
        return NextResponse.json({ error: "Missing required fields in rate sheet." }, { status: 400 });
      }
    }

    // Insert many rate sheets into the database
    const createdRateSheets = await RateSheet.insertMany(rateSheetData);

    return NextResponse.json(
      { message: "Rate sheets uploaded successfully", data: createdRateSheets },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST handler:", error);
    return NextResponse.json(
      { error: error.message || "An error occurred while processing rate sheets." },
      { status: 500 }
    );
  }
}

// GET - Fetch rate sheets based on filters or all if no filters are provided
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    // Check if fetching a single rate sheet by ID
    const id = searchParams.get("id");
    
    if (id) {
      const rateSheet = await RateSheet.findById(id);
      
      if (!rateSheet) {
        return NextResponse.json({ error: "Rate sheet not found." }, { status: 404 });
      }
      
      return NextResponse.json(rateSheet, { status: 200 });
    }

    // Build filters from query parameters
    const filters = {};
    searchParams.forEach((value, key) => {
      if (key !== "id") {
        filters[key] = value;
      }
    });

    // Fetch rate sheets from the database based on filters
    const rateSheets = await RateSheet.find(filters).sort({ createdAt: -1 });

    return NextResponse.json(rateSheets, { status: 200 });
  } catch (error) {
    console.error("Error in GET handler:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching rate sheets." },
      { status: 500 }
    );
  }
}

// PUT - Update a specific rate sheet by ID (alternative method)
export async function PUT(req) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "Rate sheet ID is required." }, { status: 400 });
    }

    const updatedData = await req.json();
    
    if (!updatedData || Object.keys(updatedData).length === 0) {
      return NextResponse.json({ error: "No data provided for update." }, { status: 400 });
    }

    const updatedRateSheet = await RateSheet.findByIdAndUpdate(
      id,
      updatedData,
      { new: true, runValidators: true }
    );

    if (!updatedRateSheet) {
      return NextResponse.json({ error: "Rate sheet not found." }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Rate sheet updated successfully", data: updatedRateSheet },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in PUT handler:", error);
    return NextResponse.json(
      { error: "An error occurred while updating the rate sheet." },
      { status: 400 }
    );
  }
}

// DELETE - Delete a specific rate sheet by ID (alternative method)
export async function DELETE(req) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "Rate sheet ID is required." }, { status: 400 });
    }

    const deletedRateSheet = await RateSheet.findByIdAndDelete(id);

    if (!deletedRateSheet) {
      return NextResponse.json({ error: "Rate sheet not found." }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Rate sheet deleted successfully", data: deletedRateSheet },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in DELETE handler:", error);
    return NextResponse.json(
      { error: "An error occurred while deleting the rate sheet." },
      { status: 500 }
    );
  }
}