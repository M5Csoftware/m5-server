import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import otpStore from "@/app/lib/portalOtpStore";

await connectDB();

/**
 * POST /api/portal/recover-password/verify-otp
 * Verify OTP
 */
export async function POST(request) {
  try {
    await connectDB();

    const { emailId, otp } = await request.json();

    console.log("🔐 Verify OTP request for:", emailId, "OTP:", otp);

    if (!emailId || !otp) {
      return NextResponse.json(
        { success: false, message: "Email and OTP are required" },
        { status: 400 }
      );
    }

    // Get OTP data from store
    const storedData = otpStore.get(emailId);

    if (!storedData) {
      console.log("❌ No OTP found for:", emailId);
      console.log("📊 Available emails:", otpStore.getAllEmails());
      return NextResponse.json(
        { success: false, message: "OTP expired or not requested. Please request a new OTP." },
        { status: 400 }
      );
    }

    // Check if already verified
    if (storedData.verified) {
      console.log("⚠️ OTP already verified for:", emailId);
      return NextResponse.json({
        success: true,
        message: "OTP already verified",
      });
    }

    // Increment attempts
    const attempts = otpStore.incrementAttempts(emailId);

    // Check max attempts
    if (attempts > 5) {
      otpStore.delete(emailId);
      console.log("❌ Too many failed attempts for:", emailId);
      return NextResponse.json(
        { success: false, message: "Too many failed attempts. Please request a new OTP." },
        { status: 400 }
      );
    }

    // Check expiry
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(emailId);
      console.log("❌ OTP expired for:", emailId);
      return NextResponse.json(
        { success: false, message: "OTP expired. Please request a new OTP." },
        { status: 400 }
      );
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      console.log(`❌ Invalid OTP for ${emailId}. Expected: ${storedData.otp}, Received: ${otp}`);
      console.log(`⚠️ Attempt ${attempts}/5`);
      return NextResponse.json(
        { success: false, message: `Invalid OTP. ${5 - attempts} attempts remaining.` },
        { status: 400 }
      );
    }

    // Mark as verified
    storedData.verified = true;
    otpStore.set(emailId, storedData);
    console.log("✅ OTP verified successfully for:", emailId);

    return NextResponse.json({
      success: true,
      message: "OTP verified successfully",
    });

  } catch (error) {
    console.error("❌ Verify OTP error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error verifying OTP. Please try again.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}