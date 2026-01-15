import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";

export async function PUT(req) {
    try {
        await connectDB();

        const body = await req.json();
        const { awbNo, actionUser } = body;

        if (!awbNo || !actionUser) {
            return NextResponse.json(
                { success: false, message: "awbNo and actionUser are required" },
                { status: 400 }
            );
        }

        // Build history entry
        const now = new Date();
        const historyEntry = {
            action: "Complaint Reopened", // ✅ default value
            date: now,
            actionUser,
        };

        // Update complaint
        const complaint = await Complaint.findOneAndUpdate(
            { awbNo },
            {
                $set: { status: "Open", isResolved: false },
                $push: { history: historyEntry },
            },
            { new: true } // return updated doc
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
        console.error("Error reopening complaint:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
