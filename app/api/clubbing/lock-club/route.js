import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Clubbing from "@/app/model/Clubbing";

export async function PUT(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const clubNo = searchParams.get("clubNo");

    if (!clubNo) {
      return NextResponse.json(
        { error: "clubNo is required to lock club" },
        { status: 400 }
      );
    }

    const updatedClub = await Clubbing.findOneAndUpdate(
      { clubNo },
      { isLocked: true },
      { new: true }
    );

    if (!updatedClub) {
      return NextResponse.json(
        { error: "Club not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "Club locked successfully", club: updatedClub },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error locking club:", error);
    return NextResponse.json(
      { error: "Failed to lock club", details: error.message },
      { status: 500 }
    );
  }
}
