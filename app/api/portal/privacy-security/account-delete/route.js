// File: server/portal/privacy-security/account-delete/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import User from "@/app/model/portal/User";

// Configure Next.js runtime
export const dynamic = 'force-dynamic';

// POST endpoint - Deactivate account
export async function POST(request) {
  try {
    await connectDB();
    
    const { accountCode } = await request.json();

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    console.log("=== Account Deactivation Request ===");
    console.log("Account Code:", accountCode);

    // Find user
    const user = await User.findOne({ accountCode });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // Check if already deactivated
    if (user.isDeactivated) {
      return NextResponse.json(
        { success: false, message: "Account is already deactivated" },
        { status: 400 }
      );
    }

    // Deactivate account
    user.isDeactivated = true;
    user.deactivatedAt = new Date();
    await user.save();

    console.log("Account deactivated successfully:", accountCode);

    return NextResponse.json({
      success: true,
      message: "Account deactivated successfully",
    });
  } catch (error) {
    console.error("Error deactivating account:", error);
    return NextResponse.json(
      { success: false, message: "Failed to deactivate account" },
      { status: 500 }
    );
  }
}