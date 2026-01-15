import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Manifest from "@/app/model/portal/Manifest";

await connectDB();

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const manifestNumber = searchParams.get("manifestNumber");

        // If manifestNumber is provided → fetch specific
        if (manifestNumber) {
            const manifest = await Manifest.findOne({ manifestNumber });

            if (!manifest) {
                return NextResponse.json(
                    { error: "Manifest not found." },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                {
                    success: true,
                    manifest,
                },
                { status: 200 }
            );
        }

        // If no manifestNumber → fetch all manifests
        const manifests = await Manifest.find().sort({ createdAt: -1 });

        return NextResponse.json(
            {
                success: true,
                manifests,
            },
            { status: 200 }
        );

    } catch (error) {
        console.error("Error fetching manifests:", error);
        return NextResponse.json(
            { error: "Failed to fetch manifests", details: error.message },
            { status: 500 }
        );
    }
}
