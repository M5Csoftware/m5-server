import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Zone from "@/app/model/Zone";

export async function GET() {
    try {
        // Connect to the database
        await connectDB();

        // Fetch all zones
        const zones = await Zone.find();

        // Extract unique services and zoneMatrix values
        const services = [...new Set(zones.map((z) => z.service))];
        const zoneMatrix = [...new Set(zones.map((z) => z.zoneMatrix))];

        // Return response
        return NextResponse.json({ services, zoneMatrix }, { status: 200 });

    } catch (error) {
        console.error("Error fetching zones:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
