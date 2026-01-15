import Branch from "@/app/model/Branch";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// Ensure DB connection
connectDB();

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const code = searchParams.get("code"); // Optional ID for fetching a specific branch

        if (code) {
            const branch = await Branch.findOne({ code });
            if (!branch) {
                return NextResponse.json({ error: "Branch not found" }, { status: 404 });
            }
            return NextResponse.json(branch, { status: 200 });
        }

        const branches = await Branch.find();
        return NextResponse.json(branches, { status: 200 }); // Return all branches
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to fetch branches", details: error.message },
            { status: 500 }
        );
    }
}