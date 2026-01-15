import Branch from "@/app/model/Branch";
import { NextResponse } from "next/server";

// Ensure DB connection
import connectDB from "@/app/lib/db";
connectDB();


export async function GET() {
    try {
        // Fetch all customer accounts with selected fields (accountCode, name, state)
        const branches = await Branch.find({}, "code companyName city state managerName telephone");

        // If no accounts found, return an empty array
        if (branches.length === 0) {
            return NextResponse.json([], { status: 200 }); // No accounts found, return empty array
        }

        // Return the list of customer accounts
        return NextResponse.json(branches, { status: 200 }); // 200 OK
    } catch (error) {
        console.error("Error in fetching branches:", error.message, error.stack);
        return NextResponse.json(
            { error: "Failed to fetch Customer Accounts", details: error.message },
            { status: 400 }
        );
    }
}
