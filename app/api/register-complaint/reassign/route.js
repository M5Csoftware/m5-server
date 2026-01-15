import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";
import Shipment from "@/app/model/portal/Shipment";

export async function PUT(req) {
    try {
        await connectDB();

        const body = await req.json();
        const { awbNo, assignTo, actionUser } = body;

        if (!awbNo || !assignTo || !actionUser) {
            return NextResponse.json(
                { success: false, message: "awbNo, assignTo, and actionUser are required" },
                { status: 400 }
            );
        }

        // Build history entry
        const now = new Date();
        const historyEntry = {
            action: `Complaint reassigned to ${assignTo}`,
            date: now,
            actionUser,
        };

        // Update complaint
        const complaint = await Complaint.findOneAndUpdate(
            { awbNo },
            {
                $set: { assignTo },
                $push: { history: historyEntry },
            },
            { new: true }
        );

        if (!complaint) {
            return NextResponse.json(
                { success: false, message: "Complaint not found" },
                { status: 404 }
            );
        }

        // Fetch operationRemark from Shipment for consistency
        const shipment = await Shipment.findOne(
            { awbNo },
            { operationRemark: 1, _id: 0 }
        );

        const complaintObj = complaint.toObject();
        complaintObj.operationRemark = shipment?.operationRemark || null;

        return NextResponse.json(
            { success: true, complaint: complaintObj },
            { status: 200 }
        );
    } catch (error) {
        console.error("Error reassigning complaint:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
