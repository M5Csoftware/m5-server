import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function PUT(req) {
    try {
        await connectDB();

        const body = await req.json();
        const { accountCode, salesPersonName } = body;

        console.log("Received data:", { accountCode, salesPersonName });

        if (!accountCode || !salesPersonName) {
            return NextResponse.json(
                { error: "Both accountCode and salesPersonName are required." },
                { status: 400 }
            );
        }

        const updatedCustomer = await CustomerAccount.findOneAndUpdate(
            { accountCode },
            { $set: { salesPersonName } },
            { new: true }
        );

        if (!updatedCustomer) {
            return NextResponse.json(
                { error: "Customer account not found." },
                { status: 404 }
            );
        }

        console.log("Updated Customer:", updatedCustomer);

        return NextResponse.json(updatedCustomer, { status: 200 });
    } catch (error) {
        console.error("Error updating customer:", error.message, error.stack);
        return NextResponse.json(
            { error: "Failed to update customer", details: error.message },
            { status: 500 }
        );
    }
}
