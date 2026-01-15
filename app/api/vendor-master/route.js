import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Vendor from "@/app/model/Vendor";

connectDB();

export async function POST(req) {
  try {
    const data = await req.json();
    const newVendor = new Vendor(data);
    const savedVendor = await newVendor.save();
    return NextResponse.json(savedVendor, { status: 201 });
  } catch (error) {
    console.error("Error saving vendor:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const vendors = await Vendor.find({});
    return NextResponse.json(vendors, { status: 200 });
  } catch (error) {
    console.error("Error fetching vendors:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const data = await req.json();
    const updatedVendor = await Vendor.findOneAndUpdate(
      { code },
      { $set: data },
      { new: true }
    );

    if (!updatedVendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    return NextResponse.json(updatedVendor, { status: 200 });
  } catch (error) {
    console.error("Error updating vendor:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const deletedVendor = await Vendor.findOneAndDelete({ code });
    if (!deletedVendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Vendor deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting vendor:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
