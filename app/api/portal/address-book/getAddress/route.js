// app/api/address/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Address from "@/app/model/portal/Address";

// Connect to MongoDB
connectDB();



/**
 * READ: Get addresses by accountCode or all
 */
export async function GET(req) {
    try {
        const accountCode = req.nextUrl.searchParams.get("accountCode");

        let addresses;

        if (accountCode) {
            addresses = await Address.find({ accountCode });
        } else {
            addresses = await Address.find();
        }

        return NextResponse.json(addresses, { status: 200 });
    } catch (error) {
        console.error("GET error:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
