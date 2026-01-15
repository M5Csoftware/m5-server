// app/api/customer/balance/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");

    console.log("Fetching balance for accountCode:", accountCode);

    if (!accountCode) {
      return NextResponse.json(
        { error: "Account code is required" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({ accountCode });

    if (!customer) {
      console.log("Customer not found:", accountCode);
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    console.log("Balance fetched:", {
      accountCode: customer.accountCode,
      leftOverBalance: customer.leftOverBalance,
      customerName: customer.name
    });

    return NextResponse.json({
      success: true,
      balance: customer.leftOverBalance || 0,
      accountCode: customer.accountCode,
      customerName: customer.name,
    });
  } catch (error) {
    console.error("Get balance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance", details: error.message },
      { status: 500 }
    );
  }
}