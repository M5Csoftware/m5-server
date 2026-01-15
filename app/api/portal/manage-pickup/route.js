import { NextResponse } from "next/server";
import PickupAddress from "@/app/model/portal/PickupAddress"; // Import Mongoose Model
import connectDB from "@/app/lib/db";


await connectDB();
// Handle POST Request
export async function POST(req) {
  try {

    const body = await req.json();
    console.log(body);

    // Validate Required Fields
    if (!body.name || !body.addressName || !body.contact || !body.accountCode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Save to Database
    const newAddress = await PickupAddress.create(body);

    return NextResponse.json({ message: "Pickup address saved successfully", data: newAddress }, { status: 201 });
  } catch (error) {
    console.error("Error saving address:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Handle GET Request (Fetch All Addresses)
export async function GET() {
  try {
    await connectDB();
    const addresses = await PickupAddress.find();
    return NextResponse.json({ data: addresses }, { status: 200 });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE: Delete a pickup address by ID
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing address ID" }, { status: 400 });
    }

    const deletedAddress = await PickupAddress.findByIdAndDelete(id);

    if (!deletedAddress) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Pickup address deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error("Error deleting address:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PUT: Update a pickup address by ID
export async function PUT(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const body = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Missing address ID" }, { status: 400 });
    }

    const updatedAddress = await PickupAddress.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });

    if (!updatedAddress) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Pickup address updated successfully", data: updatedAddress }, { status: 200 });
  } catch (error) {
    console.error("Error updating address:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

