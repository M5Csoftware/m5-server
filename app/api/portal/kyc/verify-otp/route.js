// app/api/portal/kyc/verify-otp/route.js

import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";

// Access the same OTP store (in production, use Redis or database)
// You should import this from a shared location
const otpStore = new Map();

export async function POST(request) {
  try {
    await connectDB();

    const { accountCode, aadharNumber, otp, businessType } = await request.json();

    // Validate inputs
    if (!accountCode || !aadharNumber || !otp || !businessType) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Retrieve stored OTP data
    const storedOTPData = otpStore.get(accountCode);

    if (!storedOTPData) {
      return NextResponse.json(
        { success: false, message: "OTP not found or expired" },
        { status: 400 }
      );
    }

    // Check if OTP is expired
    if (Date.now() > storedOTPData.expiresAt) {
      otpStore.delete(accountCode);
      return NextResponse.json(
        { success: false, message: "OTP has expired" },
        { status: 400 }
      );
    }

    // Verify OTP
    if (storedOTPData.otp !== otp) {
      return NextResponse.json(
        { success: false, message: "Invalid OTP" },
        { status: 400 }
      );
    }

    // Verify Aadhar number matches
    if (storedOTPData.aadharNumber !== aadharNumber) {
      return NextResponse.json(
        { success: false, message: "Aadhar number mismatch" },
        { status: 400 }
      );
    }

    // OTP verified successfully - Update customer account
    const account = await CustomerAccount.findOne({ accountCode });
    if (!account) {
      return NextResponse.json(
        { success: false, message: "Account not found" },
        { status: 404 }
      );
    }

    // Update KYC information with digilocker method
    account.kycVerification = {
      status: "verified",
      method: "digilocker", // Explicitly set method to digilocker
      aadharNumber: aadharNumber,
      businessType: businessType,
      selfieImageUrl: "",
      documents: [],
      submittedAt: new Date(),
      verifiedAt: new Date(),
      rejectedAt: null,
      rejectionReason: "",
      verifiedBy: "DigiLocker (Automated)",
    };

    await account.save();

    // Clear OTP from store
    otpStore.delete(accountCode);

    // TODO: In production, fetch actual Aadhar details from DigiLocker API
    // const digilockerData = await fetchFromDigiLocker(aadharNumber);
    // account.name = digilockerData.name;
    // account.addressLine1 = digilockerData.address;
    // etc.

    return NextResponse.json({
      success: true,
      message: "KYC verification completed successfully via DigiLocker",
      data: {
        status: "verified",
        method: "digilocker",
        businessType: businessType,
        verifiedAt: new Date(),
        verifiedBy: "DigiLocker (Automated)",
      },
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return NextResponse.json(
      { success: false, message: "Failed to verify OTP" },
      { status: 500 }
    );
  }
}