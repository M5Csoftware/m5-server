import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const awbNo = searchParams.get("awbNo");

        if (!awbNo) {
            return NextResponse.json(
                { success: false, message: "AWB number is required" },
                { status: 400 }
            );
        }

        // Find complaint by AWB
        const complaint = await Complaint.findOne({ awbNo }).lean(); // use lean() for plain JS object

        // Fetch operationRemark from shipment
        const shipment = await Shipment.findOne(
            { awbNo },
            { operationRemark: 1, _id: 0 }
        );

        if (!complaint) {
            return NextResponse.json(
                {
                    success: false,
                    message: `No complaint found for shipment with AWB No: ${awbNo}`,
                },
                { status: 404 }
            );
        }

        complaint.operationRemark = shipment?.operationRemark || null;

        return NextResponse.json(
            {
                success: true,
                complaint,
            },
            { status: 200 }
        );
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
