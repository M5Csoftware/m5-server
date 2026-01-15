import connectDB from "@/app/lib/db";
import ServiceMaster from "@/app/model/ServiceMaster";
import { NextResponse } from "next/server";

connectDB();

/* -----------------------------------------------------
   GET /api/service-master
   - If id provided: return single service
   - Otherwise return all
----------------------------------------------------- */
export async function GET(req) {
    try {
        const id = req.nextUrl.searchParams.get("id");

        if (id) {
            const doc = await ServiceMaster.findById(id);
            return NextResponse.json(doc || {}, { status: 200 });
        }

        const list = await ServiceMaster.find().sort({ createdAt: -1 });
        return NextResponse.json(list, { status: 200 });

    } catch (err) {
        console.error("GET /service-master error:", err);
        return NextResponse.json(
            { error: "Server error", details: err.message },
            { status: 500 }
        );
    }
}

/* -----------------------------------------------------
   Helper: Normalize request body
----------------------------------------------------- */
function mapBody(data) {
    return {
        softwareStatus: data.softwareStatus,
        portalStatus: data.portalStatus,

        code: data.code?.trim(),
        serviceName: data.serviceName?.trim(),

        // NEW: Multiple Pcs fields
        multiplePcsAllow: Boolean(data.multiplePcsAllow),
        noOfPcs: Number(data.noOfPcs ?? 0),

        // NEW: Average Weight fields
        averageWeightAllow: Boolean(data.averageWeightAllow),
        averageLimit: Number(data.averageLimit ?? 0),
        boxLimit: Number(data.boxLimit ?? 0),
        volDiscountPercent: Number(data.volDiscountPercent ?? 0),

        perPcs: {
            minActualWeight: Number(data?.perPcs?.minActualWeight ?? 0),
            maxActualWeight: Number(data?.perPcs?.maxActualWeight ?? 0),
            minVolumeWeight: Number(data?.perPcs?.minVolumeWeight ?? 0),
            maxVolumeWeight: Number(data?.perPcs?.maxVolumeWeight ?? 0),
        },

        perAWB: {
            minActualWeight: Number(data?.perAWB?.minActualWeight ?? 0),
            maxActualWeight: Number(data?.perAWB?.maxActualWeight ?? 0),
            minVolumeWeight: Number(data?.perAWB?.minVolumeWeight ?? 0),
            maxVolumeWeight: Number(data?.perAWB?.maxVolumeWeight ?? 0),
            minChargeableWeight: Number(data?.perAWB?.minChargeableWeight ?? 0),
            maxChargeableWeight: Number(data?.perAWB?.maxChargeableWeight ?? 0),
        },

        maxShipmentValue: Number(data.maxShipmentValue ?? 0),
        maxPcsPerAWB: Number(data.maxPcsPerAWB ?? 0),
    };
}

/* -----------------------------------------------------
   POST /api/service-master
   Create New Service
----------------------------------------------------- */
export async function POST(req) {
    try {
        const body = await req.json();

        if (!body.code || !body.serviceName) {
            return NextResponse.json(
                { error: "Code and serviceName are required" },
                { status: 400 }
            );
        }

        const exists = await ServiceMaster.findOne({ code: body.code.trim() });
        if (exists) {
            return NextResponse.json(
                { error: "Service with this code already exists" },
                { status: 409 }
            );
        }

        const newDoc = new ServiceMaster(mapBody(body));
        await newDoc.save();

        return NextResponse.json(
            { message: "Service created successfully", data: newDoc },
            { status: 201 }
        );
    } catch (err) {
        console.error("POST /service-master error:", err);
        return NextResponse.json(
            { error: "Failed to create service", details: err.message },
            { status: 500 }
        );
    }
}

/* -----------------------------------------------------
   PUT /api/service-master?id=xxxxx
   Update Service
----------------------------------------------------- */
export async function PUT(req) {
    try {
        const id = req.nextUrl.searchParams.get("id");
        if (!id) {
            return NextResponse.json(
                { error: "ID is required" },
                { status: 400 }
            );
        }

        const body = await req.json();
        const updatedDoc = await ServiceMaster.findByIdAndUpdate(
            id,
            mapBody(body),
            { new: true }
        );

        if (!updatedDoc) {
            return NextResponse.json({ error: "Service not found" }, { status: 404 });
        }

        return NextResponse.json(
            { message: "Service updated successfully", data: updatedDoc },
            { status: 200 }
        );

    } catch (err) {
        console.error("PUT /service-master error:", err);
        return NextResponse.json(
            { error: "Update failed", details: err.message },
            { status: 500 }
        );
    }
}

/* -----------------------------------------------------
   DELETE /api/service-master?id=xxxxx
----------------------------------------------------- */
export async function DELETE(req) {
    try {
        const id = req.nextUrl.searchParams.get("id");
        if (!id) {
            return NextResponse.json(
                { error: "ID is required" },
                { status: 400 }
            );
        }

        const deleted = await ServiceMaster.findByIdAndDelete(id);

        if (!deleted) {
            return NextResponse.json({ error: "Service not found" }, { status: 404 });
        }

        return NextResponse.json(
            { message: "Service deleted successfully", deleted },
            { status: 200 }
        );

    } catch (err) {
        console.error("DELETE /service-master error:", err);
        return NextResponse.json(
            { error: "Failed to delete service", details: err.message },
            { status: 500 }
        );
    }
}