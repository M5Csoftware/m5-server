// app/api/portal/kyc/send-otp/route.js

import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";

// In-memory OTP storage (in production, use Redis or database)
const otpStore = new Map();

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request) {
  try {
    await connectDB();

    const { accountCode, aadharNumber, businessType } = await request.json();

    // Validate inputs
    if (!accountCode || !aadharNumber || !businessType) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate Aadhar number format
    if (!/^\d{12}$/.test(aadharNumber)) {
      return NextResponse.json(
        { success: false, message: "Invalid Aadhar number format" },
        { status: 400 }
      );
    }

    // Find customer account
    const account = await CustomerAccount.findOne({ accountCode });
    if (!account) {
      return NextResponse.json(
        { success: false, message: "Account not found" },
        { status: 404 }
      );
    }

    // Initialize or update kycVerification with digilocker method
    if (!account.kycVerification) {
      account.kycVerification = {
        status: "pending",
        method: "digilocker", // Set method to digilocker
        businessType: businessType,
        aadharNumber: aadharNumber,
        selfieImageUrl: "",
        documents: [],
        submittedAt: null,
        verifiedAt: null,
        rejectedAt: null,
        rejectionReason: "",
        verifiedBy: "",
      };
    } else {
      // Update for digilocker verification
      account.kycVerification.method = "digilocker";
      account.kycVerification.businessType = businessType;
      account.kycVerification.aadharNumber = aadharNumber;
      account.kycVerification.status = "pending";
    }

    await account.save();

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with expiry (5 minutes)
    const otpData = {
      otp,
      aadharNumber,
      accountCode,
      businessType,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
    otpStore.set(accountCode, otpData);

    // In production, integrate with DigiLocker API or SMS gateway
    // For now, we'll just log the OTP (in production, send via SMS/Email)
    console.log(`OTP for ${accountCode}: ${otp}`);

    // TODO: Integrate with DigiLocker API
    // const digilockerResponse = await fetch('https://api.digitallocker.gov.in/public/oauth2/1/authorize', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     client_id: process.env.DIGILOCKER_CLIENT_ID,
    //     redirect_uri: process.env.DIGILOCKER_REDIRECT_URI,
    //     response_type: 'code',
    //     state: accountCode
    //   })
    // });

    // TODO: Send OTP via SMS/Email service (Twilio, SendGrid, etc.)
    // await sendOTPviaSMS(account.telNo, otp);
    // await sendOTPviaEmail(account.email, otp);

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
      data: {
        method: "digilocker",
        businessType: businessType,
      },
      // In development, return OTP (remove in production)
      devOTP: process.env.NODE_ENV === "development" ? otp : undefined,
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send OTP" },
      { status: 500 }
    );
  }
}