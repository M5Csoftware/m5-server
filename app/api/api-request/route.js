import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import APIRequest from "@/app/model/portal/APIRequest";

await connectDB();

// -----------------------------
// CREATE
// -----------------------------
export async function POST(req) {
    try {
        const body = await req.json();

        const required = [
            "customerCode",
            "customerName",
            "email",
            "phone",
            "apiUseCase",
        ];

        for (let field of required) {
            if (!body[field]) {
                return NextResponse.json(
                    { error: `${field} is required` },
                    { status: 400 }
                );
            }
        }

        // Duplicate customerCode or email
        const exists = await APIRequest.findOne({
            $or: [{ customerCode: body.customerCode }, { email: body.email }],
        });

        if (exists) {
            return NextResponse.json(
                { error: "CustomerCode or Email already exists" },
                { status: 409 }
            );
        }

        const created = await APIRequest.create(body);

        return NextResponse.json(
            { message: "API request created successfully", data: created },
            { status: 201 }
        );
    } catch (error) {
        console.error("POST Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// -----------------------------
// READ
// -----------------------------
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const customerCode = searchParams.get("customerCode");

        let data;

        if (customerCode) {
            data = await APIRequest.findOne({ customerCode });

            if (!data) {
                return NextResponse.json(
                    { error: "No data found for this customerCode" },
                    { status: 404 }
                );
            }
        } else {
            data = await APIRequest.find().sort({ createdAt: -1 });
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error("GET Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// -----------------------------
// UPDATE
// -----------------------------
export async function PUT(req) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID is required" }, { status: 400 });
        }

        const body = await req.json();

        const updated = await APIRequest.findByIdAndUpdate(id, body, {
            new: true,
            runValidators: true,
        });

        if (!updated) {
            return NextResponse.json(
                { error: "Record not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { message: "API request updated successfully", data: updated },
            { status: 200 }
        );
    } catch (error) {
        console.error("PUT Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// -----------------------------
// DELETE
// -----------------------------
export async function DELETE(req) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID is required" }, { status: 400 });
        }

        const deleted = await APIRequest.findByIdAndDelete(id);

        if (!deleted) {
            return NextResponse.json(
                { error: "Record not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { message: "API request deleted successfully", data: deleted },
            { status: 200 }
        );
    } catch (error) {
        console.error("DELETE Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
