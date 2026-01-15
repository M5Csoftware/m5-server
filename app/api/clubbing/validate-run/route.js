import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import RunEntry from "@/app/model/RunEntry"; 

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return NextResponse.json({ 
        error: "Run Number is required" 
      }, { status: 400 });
    }

    // Check if runNo exists in run-entry database
    const runExists = await RunEntry.findOne({
      runNo: runNo.trim()
    });

    if (!runExists) {
      return NextResponse.json({ 
        error: "Run Number not found" 
      }, { status: 404 });
    }

    // Return the run entry data if found
    return NextResponse.json(runExists);

  } catch (error) {
    console.error("Error fetching runNo:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}