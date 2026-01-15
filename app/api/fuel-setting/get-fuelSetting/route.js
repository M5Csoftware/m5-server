import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import FuelSetting from "@/app/model/FuelSetting";

await connectDB();

export async function GET(req) {
    try {
        const record = await FuelSetting.find();

        if (!record) {
            return NextResponse.json({ error: "Record not found" }, { status: 404 });
        }

        return NextResponse.json(record, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}