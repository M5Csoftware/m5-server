import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Run from "@/app/model/RunEntry";

export async function GET(req) {
  await connectDB();
  try {
    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo") || searchParams.get("runNO");

    console.log("Received runNo parameter:", runNo);

    if (runNo) {
      // Search by runNo field with case-insensitive regex
      const runEntry = await Run.findOne({
        runNo: { $regex: new RegExp(`^${runNo}$`, "i") },
        accountType: { $in: ["branchHub", "hubHub"] }
      });

      console.log("Found run entry:", runEntry);
      
      if (!runEntry) {
        // Debug info when not found
        const sample = await Run.findOne();
        const allAccountTypes = await Run.distinct("accountType");
        const allRunNumbers = await Run.find({}, { runNo: 1, accountType: 1 }).limit(5);
        
        console.log("Sample run structure:", sample);
        console.log("All account types in DB:", allAccountTypes);
        console.log("Sample run numbers:", allRunNumbers);
        
        return NextResponse.json({ 
          error: "Run number not found",
          debug: {
            searchedFor: runNo,
            sampleRun: sample,
            allAccountTypes: allAccountTypes,
            sampleRunNumbers: allRunNumbers
          }
        }, { status: 404 });
      }
      
      return NextResponse.json([runEntry], { status: 200 });
    }

    // Return all eligible runs
    const runEntries = await Run.find({
      accountType: { $in: ["branchHub", "hubHub"] }
    });

    console.log("All eligible run entries:", runEntries.length);

    return NextResponse.json(runEntries, { status: 200 });
  } catch (error) {
    console.error("Error fetching run entries:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}