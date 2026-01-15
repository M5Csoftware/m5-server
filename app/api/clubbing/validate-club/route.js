import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Clubbing from "@/app/model/Clubbing";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const clubNo = searchParams.get("clubNo");

    if (!clubNo) {
      return NextResponse.json({ 
        isValid: false, 
        message: "Club Number is required" 
      }, { status: 400 });
    }

    // Check if clubNo already exists
    const existingClub = await Clubbing.findOne({
      clubNo: clubNo.trim()
    });

    if (existingClub) {
      return NextResponse.json({
        isValid: false,
        message: "Club Number already exists",
        existingClub: existingClub
      });
    }

    return NextResponse.json({ 
      isValid: true,
      message: "Club Number is available"
    });

  } catch (error) {
    console.error("Error validating clubNo:", error);
    return NextResponse.json({ 
      isValid: false, 
      error: error.message,
      message: "Error validating Club Number"
    }, { status: 500 });
  }
}