// app/api/address/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Address from "@/app/model/portal/Address";

// Connect to MongoDB
connectDB();

/**
 * CREATE: Add new address
 */
export async function POST(req) {
  try {
    const body = await req.json();

    // Validate required fields
    const {
      accountCode,
      fullName,
      kycType,
      kycNumber,
      email,
      phoneNumber,
      addressLine1,
      pincode,
      city,
      state,
      country,
      addressType,
    } = body;

    if (
      !accountCode ||
      !fullName ||
      !kycType ||
      !kycNumber ||
      !email ||
      !phoneNumber ||
      !addressLine1 ||
      !pincode ||
      !city ||
      !state ||
      !country ||
      !addressType
    ) {
      throw new Error("Missing required fields");
    }

    const newAddress = new Address(body);
    const saved = await newAddress.save();

    return NextResponse.json(
      { message: "Created", data: saved },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

/**
 * READ: Get all addresses
 */
export async function GET() {
  try {
    const addresses = await Address.find();
    return NextResponse.json(addresses, { status: 200 });
  } catch (error) {
    console.error("GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

/**
 * UPDATE: Update an address by ID
 */
export async function PUT(req) {
  try {
    const body = await req.json();
    const { _id, ...updates } = body;

    if (!_id) throw new Error("Missing _id for update");

    const updated = await Address.findByIdAndUpdate(_id, updates, { new: true });

    if (!updated) throw new Error("Address not found");

    return NextResponse.json(
      { message: "Updated", data: updated },
      { status: 200 }
    );
  } catch (error) {
    console.error("PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

/**
 * DELETE: Delete addresses by IDs
 */
export async function DELETE(req) {
  try {
    const body = await req.json();
    let { ids } = body;

    if (!ids) {
      throw new Error("Missing ids for deletion");
    }

    // If single id is passed, wrap it in an array
    if (!Array.isArray(ids)) {
      ids = [ids];
    }

    const deleted = await Address.deleteMany({ _id: { $in: ids } });

    return NextResponse.json(
      { message: "Deleted", data: deleted },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

