// server/portal/setting-shipment-notif/route.js

import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// GET - Fetch notification preferences
export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get("accountCode");

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({ accountCode });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: customer.notificationPreferences || {},
    });
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

// POST/PUT - Save notification preferences
export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { accountCode, notifications } = body;

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    if (!notifications || typeof notifications !== "object") {
      return NextResponse.json(
        { success: false, message: "Invalid notifications data" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({ accountCode });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 }
      );
    }

    // Update notification preferences
    customer.notificationPreferences = {
      ...customer.notificationPreferences,
      ...notifications,
    };

    await customer.save();

    return NextResponse.json({
      success: true,
      message: "Notification preferences saved successfully",
      data: customer.notificationPreferences,
    });
  } catch (error) {
    console.error("Error saving notification preferences:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}