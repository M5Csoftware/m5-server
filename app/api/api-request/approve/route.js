import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import APIRequest from "@/app/model/portal/APIRequest";

await connectDB();

// Generate API Key
function generateApiKey() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 15)
    ).toUpperCase();
}

async function createUniqueApiKey() {
    let key;
    let exists = true;

    while (exists) {
        key = generateApiKey();
        exists = await APIRequest.findOne({ apiKey: key });
    }
    return key;
}

export async function PATCH(req) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "ID is required" },
                { status: 400 }
            );
        }

        // Generate new key
        const newKey = await createUniqueApiKey();

        const updated = await APIRequest.findByIdAndUpdate(
            id,
            {
                Status: "approved",
                apiKey: newKey,
            },
            { new: true }
        );

        if (!updated) {
            return NextResponse.json(
                { error: "Record not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(
            {
                message: "API request approved successfully",
                data: updated,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("APPROVE Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
