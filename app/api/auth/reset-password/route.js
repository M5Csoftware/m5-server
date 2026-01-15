import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import bcrypt from "bcryptjs";
import otpStore from "@/app/lib/otpStore";

export async function POST(req) {
  try {
    await connectDB();

    const { email, password } = await req.json();

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required" },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase();

    // Check if OTP was verified for this email
    const storedOtpData = otpStore.get(emailLower);

    if (!storedOtpData) {
      return NextResponse.json(
        { success: false, message: "Session expired. Please request a new OTP." },
        { status: 400 }
      );
    }

    if (!storedOtpData.verified) {
      return NextResponse.json(
        { success: false, message: "Please verify OTP first" },
        { status: 400 }
      );
    }

    // Check if verification is still valid (within 15 minutes of OTP verification)
    const verificationAge = Date.now() - (storedOtpData.verifiedAt || 0);
    if (verificationAge > 15 * 60 * 1000) { // 15 minutes
      otpStore.delete(emailLower);
      return NextResponse.json(
        { success: false, message: "Verification expired. Please request a new OTP." },
        { status: 400 }
      );
    }

    // Find employee by email
    const employee = await Employee.findOne({ email: emailLower });

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 }
      );
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update employee password
    employee.password = hashedPassword;
    await employee.save();

    // Clear OTP data from store after successful password reset
    otpStore.delete(emailLower);

    console.log(`Password reset successful for email: ${emailLower}`);

    return NextResponse.json(
      {
        success: true,
        message: "Password reset successfully. You can now login with your new password.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to reset password. Please try again." },
      { status: 500 }
    );
  }
}