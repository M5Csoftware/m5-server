import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import BranchBagging from "@/app/model/BranchBagging";

await connectDB();

// GET - Fetch branch bagging data  
export async function GET(req) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);
        const branch = searchParams.get("branch");

        const baggingData = await BranchBagging.findOne({ hub: branch });

        if (!baggingData) {
            return NextResponse.json(
                { error: "Branch bagging data not found for this run number" },
                { status: 404 }
            );
        }

        return NextResponse.json(baggingData, { status: 200 });

    } catch (error) {
        console.error("Error fetching branch bagging data:", error.message);
        return NextResponse.json(
            {
                error: "Failed to fetch branch bagging data",
                details: error.message,
            },
            { status: 500 }
        );
    }
}
