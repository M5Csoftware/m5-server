// app/api/account-ledger/customer/route.js
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const url = new URL(req.url);
    const accountCode = url.searchParams.get("accountCode"); // must match frontend

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Missing accountCode" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({ accountCode }).lean();

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      customerName: customer.name || "",
      email: customer.email || "",
      openingBalance: customer.openingBalance || 0,
    });
  } catch (error) {
    console.error("Error fetching customer info:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch customer info", error: error.message },
      { status: 500 }
    );
  }
}
