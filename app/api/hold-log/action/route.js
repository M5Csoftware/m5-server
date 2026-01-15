// app/api/hold-log/action/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import HoldLog from "@/app/model/HoldLog";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

connectDB();

function errorResponse(message, status) {
    return NextResponse.json({ error: message }, { status });
}

export async function POST(req) {
    try {
        const {
            awbNo,
            action = "Hold Action",
            actionUser = "System",
            accountCode = "",
            customer = "",
            departmentName = "General",
            holdReason = "",
            actionSystemName,
        } = await req.json();

        if (!awbNo) return errorResponse("awbNo is required", 400);

        // fallback IP
        const detectedIp =
            req.headers.get("x-forwarded-for") ||
            req.headers.get("x-real-ip") ||
            req.headers.get("remote_addr") ||
            "unknown";

        // Create a hold log entry
        const holdLog = await HoldLog.create({
            awbNo,
            action,
            actionUser,
            accountCode,
            customer,
            departmentName,
            holdReason,
            actionSystemName: actionSystemName || "System",
            actionSystemIp: detectedIp,
            actionLogDate: new Date(),
        });

        // Optional: auto-populate shipment info if needed
        const shipment = await Shipment.findOne({ awbNo }).lean();
        if (shipment) {
            try {
                const customerData = await CustomerAccount.findOne({
                    accountCode: shipment.accountCode,
                }).lean();

                // Auto-backfill missing customer name if empty
                if (!holdLog.customer && customerData) {
                    holdLog.customer = customerData?.name || "";
                    await holdLog.save();
                }
            } catch (err) {
                console.error("Error fetching customer:", err);
            }
        }

        return NextResponse.json(holdLog, { status: 201 });
    } catch (error) {
        console.error("Error saving Hold Log:", error);
        return errorResponse("Internal server error", 500);
    }
}

// GET: Fetch Hold Logs by awbNo or list all
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const awbNo = searchParams.get("awbNo");

        if (awbNo) {
            const doc = await HoldLog.find({ awbNo }).sort({ createdAt: -1 }).lean();
            if (!doc.length) {
                return errorResponse(`No hold logs found for awbNo: ${awbNo}`, 404);
            }
            return NextResponse.json(doc, { status: 200 });
        }

        const docs = await HoldLog.find().sort({ createdAt: -1 }).lean();
        return NextResponse.json(docs, { status: 200 });
    } catch (error) {
        console.error("Error fetching Hold Logs:", error);
        return errorResponse("Internal server error", 500);
    }
}
