import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import AWBLog from "@/app/model/AWBLog";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import LogDetail from "@/app/model/LogDetail";

connectDB();

function errorResponse(message, status) {
    return NextResponse.json({ error: message }, { status });
}

export async function POST(req) {
    try {
        const {
            awbNo,
            action = "",
            actionUser = "",
            accountCode = "",
            customer = "",
            actionSystemName, // ✅ may be undefined
            department,
        } = await req.json();

        if (!awbNo) return errorResponse("awbNo is required", 400);

        // fallback IP
        const detectedIp =
            req.headers.get("x-forwarded-for") ||
            req.headers.get("x-real-ip") ||
            req.headers.get("remote_addr") ||
            "unknown";

        const logEntry = {
            action,
            actionUser,
            actionSystemIp: detectedIp,
            actionSystemName: actionSystemName || "System", // ✅ default here
            actionLogDate: new Date(),
            department,
        };

        // Push AWB log
        const updatedLog = await AWBLog.findOneAndUpdate(
            { awbNo },
            {
                $push: { logs: logEntry },
                $set: { accountCode, customer },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();

        // Create LogDetail if it doesn't exist
        const existingDetail = await LogDetail.findOne({ awbNo }).lean();
        if (!existingDetail) {
            const shipment = await Shipment.findOne({ awbNo }).lean();
            let customerName = "";
            if (shipment) {
                try {
                    const customerData = await CustomerAccount.findOne({
                        accountCode: shipment.accountCode,
                    }).lean();
                    customerName = customerData?.name || "";
                } catch (err) {
                    console.error("Error fetching customer:", err);
                }

                await LogDetail.create({
                    awbNo: shipment.awbNo,
                    accountCode: shipment.accountCode,
                    customerName,
                    shipmentDate: shipment.date || undefined,
                    originCode: shipment.origin,
                    sector: shipment.sector,
                    destination: shipment.destination,
                });
            }
        }

        return NextResponse.json(updatedLog, { status: 201 });
    } catch (error) {
        console.error("Error saving AWB log:", error);
        return errorResponse("Internal server error", 500);
    }
}



//  GET: Fetch AWB documents or logs by awbNo
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const awbNo = searchParams.get("awbNo");

        if (awbNo) {
            const doc = await AWBLog.findOne({ awbNo }).lean();
            if (!doc) {
                return errorResponse(`No logs found for awbNo: ${awbNo}`, 404);
            }
            return NextResponse.json(doc, { status: 200 });
        }

        const docs = await AWBLog.find().sort({ updatedAt: -1 }).lean();
        return NextResponse.json(docs, { status: 200 });
    } catch (error) {
        console.error("Error fetching AWB Logs:", error);
        return errorResponse("Internal server error", 500);
    }
}
