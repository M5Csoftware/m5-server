import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CANWeightValue from "@/app/model/CANWeightValue";

export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const weight = parseFloat(searchParams.get("weight"));
    
    if (isNaN(weight)) {
      return NextResponse.json(
        { success: false, message: "Invalid weight parameter" },
        { status: 400 }
      );
    }

    // Find exact match first
    let weightValue = await CANWeightValue.findOne({ weight });
    
    // If not found, find the closest lower weight
    if (!weightValue) {
      weightValue = await CANWeightValue.findOne({
        weight: { $lte: weight }
      }).sort({ weight: -1 }).limit(1);
    }
    
    // If still not found, use default
    if (!weightValue) {
      return NextResponse.json({
        success: true,
        weight,
        valuePerKg: 1.0,
        isDefault: true,
        message: "Using default value",
      });
    }

    return NextResponse.json({
      success: true,
      weight: weightValue.weight,
      valuePerKg: weightValue.valuePerKg,
      isExactMatch: weightValue.weight === weight,
    });

  } catch (error) {
    console.error("Error getting weight value:", error);
    return NextResponse.json(
      { success: false, message: "Error getting weight value" },
      { status: 500 }
    );
  }
}