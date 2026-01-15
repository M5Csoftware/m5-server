import { NextResponse } from "next/server";
import PickupAddress from "@/app/model/portal/PickupAddress"; // Import Mongoose Model
import connectDB from "@/app/lib/db";

await connectDB();



// Handle GET Request (Fetch All Addresses by accountCode)
export async function GET(req) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);
        const accountCode = searchParams.get("accountCode");

        if (!accountCode) {
            return NextResponse.json(
                { error: "Missing accountCode" },
                { status: 400 }
            );
        }

        const addresses = await PickupAddress.find({ accountCode });

        return NextResponse.json({ data: addresses }, { status: 200 });
    } catch (error) {
        console.error("Error fetching addresses:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
