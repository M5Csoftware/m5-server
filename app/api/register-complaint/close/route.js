import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";

export async function PUT(req) {
    try {
        await connectDB();

        const body = await req.json();
        const { awbNo, closeRemark, actionUser } = body;

        if (!awbNo || !closeRemark || !actionUser) {
            return NextResponse.json(
                { success: false, message: "awbNo, closeRemark, and actionUser are required" },
                { status: 400 }
            );
        }

        // Build history entry
        const now = new Date();
        const historyEntry = {
            action: closeRemark,
            date: now,
            actionUser,
        };

        // Update complaint
        const complaint = await Complaint.findOneAndUpdate(
            { awbNo },
            {
                $set: { status: "Close", isResolved: true },
                $push: { history: historyEntry },
            },
            { new: true } // return updated document
        );

        if (!complaint) {
            return NextResponse.json(
                { success: false, message: "Complaint not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { success: true, complaint },
            { status: 200 }
        );
    } catch (error) {
        console.error("Error updating complaint:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
