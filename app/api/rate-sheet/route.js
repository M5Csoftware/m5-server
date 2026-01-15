import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db"; // Database connection utility
import RateSheet from "@/app/model/RateSheet"; // RateSheet model

// Connect to the database
await connectDB();

// POST - Upload rate sheets
export async function POST(req) {
  try {
    const rateSheetData = await req.json(); // Expects an array of objects
    // console.log(rateSheetData);
    
    // Validate data format
    if (!Array.isArray(rateSheetData)) {
      return NextResponse.json({ error: "Invalid data format. Expected an array." }, { status: 400 });
    }

    // Validate each rate sheet object (ensure the required fields are present)
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
    console.error(error);
    return NextResponse.json({ error: "An error occurred while uploading rate sheets." }, { status: 500 });
  }
}

// GET - Fetch rate sheets based on filters or all if no filters are provided
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    const filters = {};
    searchParams.forEach((value, key) => {
      filters[key] = value;
    });

    // Fetch rate sheets from the database based on filters
    const rateSheets = await RateSheet.find(filters);

    return NextResponse.json(rateSheets, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "An error occurred while fetching rate sheets." }, { status: 500 });
  }
}

// PUT - Update a specific rate sheet by ID
export async function PUT(req, { params }) {
  const { id } = params;

  try {
    const updatedData = await req.json();
    if (!updatedData) {
      return NextResponse.json({ error: "No data provided for update." }, { status: 400 });
    }

    const updatedRateSheet = await RateSheet.findByIdAndUpdate(id, updatedData, { new: true, runValidators: true });

    if (!updatedRateSheet) {
      return NextResponse.json({ error: "Rate sheet not found." }, { status: 404 });
    }

    return NextResponse.json(updatedRateSheet, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "An error occurred while updating the rate sheet." }, { status: 400 });
  }
}

// DELETE - Delete a specific rate sheet by ID
export async function DELETE(req, { params }) {
  const { id } = params;

  try {
    const deletedRateSheet = await RateSheet.findByIdAndDelete(id);

    if (!deletedRateSheet) {
      return NextResponse.json({ error: "Rate sheet not found." }, { status: 404 });
    }

    return NextResponse.json({ message: "Rate sheet deleted successfully." }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "An error occurred while deleting the rate sheet." }, { status: 500 });
  }
}
