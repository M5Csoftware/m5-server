import connectDB from "@/app/lib/db";
import ServiceMaster from "@/app/model/ServiceMaster";
import { NextResponse } from "next/server";

await connectDB();

export async function GET(req) {
    try {
        const serviceName = req.nextUrl.searchParams.get("serviceName");
        const code = req.nextUrl.searchParams.get("code");

        let query = {};
        
        // 1) Get by Service Name
        if (serviceName) {
            query = { serviceName: new RegExp(`^${serviceName}$`, 'i') }; // Case-insensitive exact match
        }
        
        // 2) Get by Code (priority if both provided)
        if (code) {
            query = { code: code.trim() };
        }

        // If no params, return empty
        if (!serviceName && !code) {
            return NextResponse.json(
                { found: false }, 
                { status: 200 }
            );
        }

        const doc = await ServiceMaster.findOne(query);

        if (!doc) {
            // CRITICAL FIX: Return 200 status with found: false instead of 404
            return NextResponse.json(
                { 
                    found: false, 
                    message: "Service not found" 
                }, 
                { status: 200 } // Changed from 404 to 200
            );
        }

        // CRITICAL FIX: Ensure boolean fields are properly returned
        const serviceData = doc.toObject();
        
        return NextResponse.json(
            { 
                found: true,
                ...serviceData,
                // Explicitly ensure boolean values are proper booleans
                multiplePcsAllow: Boolean(serviceData.multiplePcsAllow),
                averageWeightAllow: Boolean(serviceData.averageWeightAllow)
            }, 
            { status: 200 }
        );

    } catch (err) {
        console.error("GET /service-master/getService error:", err);
        return NextResponse.json(
            { 
                found: false,
                error: "Server error", 
                details: err.message 
            },
            { status: 200 } // Changed from 500 to 200 for consistent handling
        );
    }
}