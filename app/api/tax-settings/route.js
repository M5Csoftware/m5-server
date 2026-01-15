import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import TaxSetting from "@/app/model/TexSetting";

// CREATE Tax Setting (POST)
export async function POST(req) {
  await connectDB();

  try {
    const data = await req.json();
    console.log("Received Tax Data:", data);

    if (!data.tax || !data.taxAmount || !data.effectiveDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if tax setting already exists for this tax type
    const existingSetting = await TaxSetting.findOne({ tax: data.tax });

    if (existingSetting) {
      // Update existing setting
      existingSetting.taxAmount = data.taxAmount;
      existingSetting.effectiveDate = data.effectiveDate;
      const updatedTaxSetting = await existingSetting.save();

      return NextResponse.json(
        { message: "Tax setting updated", data: updatedTaxSetting },
        { status: 200 }
      );
    } else {
      // Create new setting
      const newTaxSetting = new TaxSetting(data);
      const savedTaxSetting = await newTaxSetting.save();

      return NextResponse.json(
        { message: "Tax setting created", data: savedTaxSetting },
        { status: 201 }
      );
    }
  } catch (error) {
    console.error("Error saving tax setting:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// READ Tax Setting(s) (GET)
export async function GET(req) {
  await connectDB();

  try {
    const { searchParams } = new URL(req.url);
    const taxType = searchParams.get("tax");

    let query = {};
    if (taxType) {
      query = { tax: taxType };
    }

    const taxSettings = await TaxSetting.find(query).sort({ createdAt: -1 });

    if (!taxSettings || taxSettings.length === 0) {
      return NextResponse.json(
        { message: "No tax settings found" },
        { status: 404 }
      );
    }

    return NextResponse.json(taxSettings, { status: 200 });
  } catch (error) {
    console.error("Error fetching tax settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE Tax Setting (DELETE)
export async function DELETE(req) {
  await connectDB();

  try {
    const { searchParams } = new URL(req.url);
    const taxType = searchParams.get("tax");

    if (!taxType) {
      return NextResponse.json(
        { error: "Tax type is required" },
        { status: 400 }
      );
    }

    const deletedSetting = await TaxSetting.findOneAndDelete({ tax: taxType });

    if (!deletedSetting) {
      return NextResponse.json(
        { message: "Tax setting not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "Tax setting deleted successfully", data: deletedSetting },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting tax setting:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
