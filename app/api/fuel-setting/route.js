import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import FuelSetting from "@/app/model/FuelSetting";

await connectDB();

// CREATE new fuel setting
export async function POST(req) {
  try {
    const data = await req.json();
    const { customer, service, taxAmount, effectiveDate } = data;

    if (!customer || !service || !taxAmount || !effectiveDate) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const newFuelSetting = new FuelSetting(data);
    const savedFuelSetting = await newFuelSetting.save();

    return NextResponse.json(savedFuelSetting, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


// GET existing fuel setting by customer & service
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const customer = searchParams.get("customer");
    const service = searchParams.get("service");

    if (!customer || !service) {
      return NextResponse.json({ error: "Missing query parameters" }, { status: 400 });
    }

    const record = await FuelSetting.findOne({ customer, service });

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json(record, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


// UPDATE fuel setting by ID (PUT)
export async function PUT(req) {
  try {
    const data = await req.json();
    const { _id, customer, service, taxAmount, effectiveDate } = data;

    if (!_id || !customer || !service || !taxAmount || !effectiveDate) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const updated = await FuelSetting.findByIdAndUpdate(
      _id,
      { customer, service, taxAmount, effectiveDate },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


// DELETE fuel setting by ID
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const deleted = await FuelSetting.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Deleted successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
