import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

// Ensure DB connection
connectDB();

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get("query");

        if (!query) {
            return NextResponse.json(
                { message: "Query parameter is required" },
                { status: 400 }
            );
        }

        const searchValue = query.trim();
        const regex = new RegExp(`^${searchValue}$`, "i");

        // Step 1: Try matching AWB directly (indexed, fast)
        let shipments = await Shipment.find({ awbNo: regex }).sort({ date: -1 });

        // Step 2: If no AWB match, filter in Node for nested childNo matches
        if (shipments.length === 0) {
            const allShipments = await Shipment.find().sort({ date: -1 });

            shipments = allShipments.filter((shipment) => {
                if (!shipment.shipmentAndPackageDetails) return false;

                for (const key in shipment.shipmentAndPackageDetails) {
                    const items = shipment.shipmentAndPackageDetails[key];
                    if (Array.isArray(items)) {
                        for (const item of items) {
                            if (item.childNo && regex.test(item.childNo)) {
                                return true;
                            }
                        }
                    }
                }

                return false;
            });
        }

        if (shipments.length === 0) {
            return NextResponse.json(
                { message: "No shipments found matching the query" },
                { status: 404 }
            );
        }

        return NextResponse.json({ shipments });
    } catch (error) {
        console.error("Error fetching shipments:", error);
        return NextResponse.json(
            { message: "Error fetching shipments", error: error.message },
            { status: 500 }
        );
    }
}
