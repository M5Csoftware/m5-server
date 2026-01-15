// app/api/portal/kyc/upload-document/route.js

import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to upload to Cloudinary
async function uploadToCloudinary(fileBuffer, folder) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "auto",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
}

export async function POST(request) {
  try {
    await connectDB();

    const formData = await request.formData();
    const accountCode = formData.get("accountCode");
    const businessType = formData.get("businessType");
    const documentType = formData.get("documentType");
    const documentNumber = formData.get("documentNumber"); // "1" or "2"
    const documentFront = formData.get("documentFront");
    const documentBack = formData.get("documentBack");

    // Validate inputs
    if (!accountCode || !businessType || !documentType || !documentNumber) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!documentFront || !documentBack) {
      return NextResponse.json(
        { success: false, message: "Both front and back images are required" },
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

    // Convert files to buffers
    const frontBuffer = Buffer.from(await documentFront.arrayBuffer());
    const backBuffer = Buffer.from(await documentBack.arrayBuffer());

    // Upload to Cloudinary
    const frontUpload = await uploadToCloudinary(
      frontBuffer,
      `kyc/${accountCode}/doc${documentNumber}`
    );
    const backUpload = await uploadToCloudinary(
      backBuffer,
      `kyc/${accountCode}/doc${documentNumber}`
    );

    // Initialize kycVerification if it doesn't exist
    if (!account.kycVerification) {
      account.kycVerification = {
        status: "pending",
        method: "manual", // Set to manual for document upload
        businessType: businessType,
        aadharNumber: "",
        selfieImageUrl: "",
        documents: [],
        submittedAt: new Date(),
        verifiedAt: null,
        rejectedAt: null,
        rejectionReason: "",
        verifiedBy: "",
      };
    } else {
      // Update businessType and ensure method is manual for document uploads
      account.kycVerification.businessType = businessType;
      // Only update method if it's not already set or if it's not digilocker
      if (!account.kycVerification.method || account.kycVerification.method !== "digilocker") {
        account.kycVerification.method = "manual";
      }
    }

    // Add or update document in the array
    const documentData = {
      documentNumber: parseInt(documentNumber),
      documentType: documentType,
      frontImageUrl: frontUpload.secure_url,
      backImageUrl: backUpload.secure_url,
      uploadedAt: new Date(),
    };

    // Check if document already exists and update it, otherwise add new
    const existingDocIndex = account.kycVerification.documents.findIndex(
      (doc) => doc.documentNumber === parseInt(documentNumber)
    );

    if (existingDocIndex !== -1) {
      account.kycVerification.documents[existingDocIndex] = documentData;
    } else {
      account.kycVerification.documents.push(documentData);
    }

    // If both documents are uploaded, update status to "under_review"
    if (account.kycVerification.documents.length === 2) {
      account.kycVerification.status = "under_review";
      account.kycVerification.submittedAt = new Date();
    }

    await account.save();

    return NextResponse.json({
      success: true,
      message: `Document ${documentNumber} uploaded successfully`,
      data: {
        documentNumber: parseInt(documentNumber),
        frontImageUrl: frontUpload.secure_url,
        backImageUrl: backUpload.secure_url,
        status: account.kycVerification.status,
        method: account.kycVerification.method,
        businessType: account.kycVerification.businessType,
        totalDocuments: account.kycVerification.documents.length,
      },
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { success: false, message: "Failed to upload document" },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint to retrieve KYC status
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

    const account = await CustomerAccount.findOne(
      { accountCode },
      { kycVerification: 1, accountType: 1, name: 1, accountCode: 1 }
    );

    if (!account) {
      return NextResponse.json(
        { success: false, message: "Account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: account.kycVerification || { status: "not_started" },
      accountInfo: {
        accountCode: account.accountCode,
        accountType: account.accountType,
        name: account.name,
      },
    });
  } catch (error) {
    console.error("Error fetching KYC status:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch KYC status" },
      { status: 500 }
    );
  }
}