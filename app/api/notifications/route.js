import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Notification from "@/app/model/Notification";

//  CONNECT FIRST
async function connect() {
    try {
        await connectDB();
    } catch (err) {
        console.error("DB Connect Error:", err);
    }
}

/* =====================================================
    GET - FETCH ALL NOTIFICATIONS (pagination + filter)
   ===================================================== */
export async function GET(request) {
    await connect();
    try {
        const { searchParams } = new URL(request.url);

        const page = parseInt(searchParams.get("page")) || 1;
        const limit = parseInt(searchParams.get("limit")) || 10;

        const search = searchParams.get("search")?.trim() || "";
        const filterType = searchParams.get("filter") || "All";
        const accountCode =
            searchParams.get("accountCode")?.toUpperCase() || null;

        // Base Query
        const query = { isDeleted: false };

        // Filter by account
        if (accountCode) query.accountCode = accountCode;

        // Filter by type (Manifest, Booked, Hold, etc.)
        if (filterType !== "All") query.type = filterType;

        // Search by AWB, Title, OR Description
        if (search) {
            query.$or = [
                { awb: { $regex: search, $options: "i" } },
                { title: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ];
        }

        // Total count (for pagination)
        const total = await Notification.countDocuments(query);

        // Fetch actual notifications
        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 }) // newest first
            .skip((page - 1) * limit)
            .limit(limit);

        return NextResponse.json(
            {
                notifications,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET Notification Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}


/* =====================================================
    POST - CREATE NOTIFICATION
   ===================================================== */
export async function POST(request) {
    await connect();
    try {
        const data = await request.json();

        if (!data.accountCode) {
            return NextResponse.json(
                { error: "accountCode is required" },
                { status: 400 }
            );
        }

        const notification = await Notification.create({
            accountCode: data.accountCode,
            type: data.type,
            title: data.title,
            description: data.description,
            awb: data.awb,

            pickupCode: data.pickupCode || "",
            address: data.address || "",
            date: data.date || "",

            isHold: data.type === "Shipment Hold",
            holdReason: data.holdReason || "",
        });

        return NextResponse.json(
            { message: "Notification created", notification },
            { status: 201 }
        );
    } catch (error) {
        console.error("POST Notification Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

/* =====================================================
    PUT - UPDATE NOTIFICATION
   ===================================================== */
export async function PUT(request) {
    await connect();
    try {
        const data = await request.json();

        if (!data.id) {
            return NextResponse.json(
                { error: "Notification ID is required" },
                { status: 400 }
            );
        }

        const existing = await Notification.findById(data.id);
        if (!existing) {
            return NextResponse.json(
                { error: "Notification not found" },
                { status: 404 }
            );
        }

        const updateData = {
            type: data.type ?? existing.type,
            title: data.title ?? existing.title,
            description: data.description ?? existing.description,
            awb: data.awb ?? existing.awb,

            pickupCode: data.pickupCode ?? existing.pickupCode,
            address: data.address ?? existing.address,
            date: data.date ?? existing.date,

            isRead: data.isRead ?? existing.isRead,

            isHold: data.isHold ?? existing.isHold,
            holdReason: data.holdReason ?? existing.holdReason,

            updatedAt: new Date(),
        };

        const updated = await Notification.findByIdAndUpdate(
            data.id,
            updateData,
            { new: true }
        );

        return NextResponse.json(
            { message: "Notification updated", notification: updated },
            { status: 200 }
        );
    } catch (error) {
        console.error("PUT Notification Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

/* =====================================================
    DELETE - DELETE ONE OR DELETE ALL BY accountCode
   ===================================================== */
export async function DELETE(request) {
    await connect();
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        const accountCode = searchParams.get("accountCode");

        // DELETE SINGLE NOTIFICATION
        if (id) {
            await Notification.findByIdAndDelete(id);
            return NextResponse.json(
                { message: "Notification deleted successfully" },
                { status: 200 }
            );
        }

        // DELETE ALL NOTIFICATIONS FOR ACCOUNT
        if (accountCode) {
            await Notification.deleteMany({ accountCode });
            return NextResponse.json(
                { message: "All notifications deleted for this accountCode" },
                { status: 200 }
            );
        }

        return NextResponse.json(
            { error: "Provide id OR accountCode for deletion" },
            { status: 400 }
        );
    } catch (error) {
        console.error("DELETE Notification Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
