import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Address from "@/app/model/portal/Address";
import * as XLSX from "xlsx";

// Connect to MongoDB
connectDB();

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");
        if (!file) throw new Error("No file uploaded");

        const buffer = Buffer.from(await file.arrayBuffer());

        // Parse file using XLSX (works for CSV & Excel)
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (!data.length) throw new Error("No data found in uploaded file");

        // Save valid records
        const savedDocs = [];
        for (const row of data) {
            if (!row.accountCode || !row.fullName || !row.email) continue;
            const existing = await Address.findOne({
                accountCode: row.accountCode,
                email: row.email,
            });
            if (existing) continue; // skip duplicates

            const address = new Address({
                accountCode: row.accountCode,
                fullName: row.fullName,
                kycType: row.kycType,
                kycNumber: row.kycNumber,
                email: row.email,
                phoneNumber: row.phoneNumber,
                addressLine1: row.addressLine1,
                pincode: row.pincode,
                city: row.city,
                state: row.state,
                country: row.country,
                addressType: row.addressType,
            });

            const saved = await address.save();
            savedDocs.push(saved);
        }

        return NextResponse.json(
            { message: "Upload successful", count: savedDocs.length },
            { status: 201 }
        );
    } catch (error) {
        console.error("UPLOAD error:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
