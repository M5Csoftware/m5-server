import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import otpStore from "@/app/lib/otpStore";

export async function POST(req) {
  try {
    await connectDB();

    const { email, otp } = await req.json();

    // Validate required fields
    if (!email || !otp) {
      return NextResponse.json(
        { success: false, message: "Email and OTP are required" },
        { status: 400 }
      );
    }

    // Validate OTP format (must be 6 digits)
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { success: false, message: "OTP must be exactly 6 digits" },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase();

    // Verify employee exists
    const employee = await Employee.findOne({ email: emailLower });

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 }
      );
    }

    // Check if OTP exists for this email
    const storedOtpData = otpStore.get(emailLower);

    if (!storedOtpData) {
      return NextResponse.json(
        { 
          success: false, 
          message: "OTP expired or not found. Please request a new one." 
        },
        { status: 400 }
      );
    }

    // Check if OTP has expired
    if (Date.now() > storedOtpData.expiresAt) {
      otpStore.delete(emailLower);
      return NextResponse.json(
        { 
          success: false, 
          message: "OTP has expired. Please request a new one." 
        },
        { status: 400 }
      );
    }

    // Check maximum attempts (prevent brute force)
    if (storedOtpData.attempts >= 5) {
      otpStore.delete(emailLower);
      return NextResponse.json(
        { 
          success: false, 
          message: "Maximum attempts exceeded. Please request a new OTP." 
        },
        { status: 400 }
      );
    }

    // Verify OTP
    if (storedOtpData.otp !== otp.trim()) {
      // Increment attempt count
      storedOtpData.attempts = (storedOtpData.attempts || 0) + 1;
      otpStore.set(emailLower, storedOtpData);
      
      const remainingAttempts = 5 - storedOtpData.attempts;
      
      return NextResponse.json(
        {
          success: false,
          message: `Invalid OTP. ${remainingAttempts} ${remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining.`,
        },
        { status: 400 }
      );
    }

    // OTP is valid - mark as verified but keep in store for password reset
    storedOtpData.verified = true;
    storedOtpData.verifiedAt = Date.now();
    otpStore.set(emailLower, storedOtpData);

    return NextResponse.json(
      {
        success: true,
        message: "OTP verified successfully. You can now reset your password.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json(
      { success: false, message: "Server error during OTP verification" },
      { status: 500 }
    );
  }
}