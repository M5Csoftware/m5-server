import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import User from "@/app/model/portal/User";
import otpStore from "@/app/lib/portalOtpStore";

await connectDB();

/**
 * POST /api/portal/recover-password/reset-password
 * Reset password after OTP verification (No hash - plain text password)
 */
export async function POST(request) {
  try {
    await connectDB();

    const { emailId, newPassword, confirmPassword } = await request.json();

    console.log("🔐 Reset password request for:", emailId);

    // Validate inputs
    if (!emailId || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: "All fields are required" },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Check if OTP was verified
    if (!otpStore.isVerified(emailId)) {
      console.log("❌ OTP not verified for:", emailId);
      return NextResponse.json(
        { success: false, message: "Please verify OTP first" },
        { status: 400 }
      );
    }

    const storedData = otpStore.get(emailId);
    
    // Double-check expiry
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(emailId);
      console.log("❌ OTP expired for:", emailId);
      return NextResponse.json(
        { success: false, message: "OTP expired. Please request a new OTP." },
        { status: 400 }
      );
    }

    // Find user and update password (plain text - NO HASH)
    const user = await User.findOne({ emailId: emailId.toLowerCase() });
    
    if (!user) {
      console.log("❌ User not found:", emailId);
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // Update password - DIRECT PLAIN TEXT (NO HASHING)
    user.password = newPassword;
    user.onboardingProgress = user.onboardingProgress || {};
    user.onboardingProgress.passwordSet = true;
    await user.save();

    console.log("✅ Password updated successfully for:", emailId);

    // Clear OTP from store after successful password reset
    otpStore.delete(emailId);
    console.log("🧹 OTP cleared for:", emailId);

    return NextResponse.json({
      success: true,
      message: "Password reset successful! You can now login with your new password.",
    });

  } catch (error) {
    console.error("❌ Reset password error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error resetting password. Please try again.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}