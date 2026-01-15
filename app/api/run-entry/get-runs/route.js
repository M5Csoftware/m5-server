import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Run from "@/app/model/RunEntry";



// GET: fetch all run entries
export async function GET(req) {
  try {
    await connectDB();

    const runData = await Run.find();
    return NextResponse.json(runData, { status: 200 });
  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
