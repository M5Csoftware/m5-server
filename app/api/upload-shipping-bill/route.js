import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import ShippingBill from "@/app/model/ShippingBill";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request) {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Helper function to upload file to Cloudinary
async function uploadToCloudinary(fileBuffer, fileName) {
  return new Promise((resolve, reject) => {
    // Remove .pdf extension and spaces from fileName for public_id
    const fileNameWithoutExt = fileName.replace(/\.pdf$/i, '').replace(/\s+/g, '_');
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "shipping-bills",
        resource_type: "raw",
        type: "upload", // Changed from default to explicit 'upload'
        access_mode: "public", // IMPORTANT: Make files publicly accessible
        public_id: `${Date.now()}_${fileNameWithoutExt}`,
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          reject(error);
        } else {
          console.log("Cloudinary upload result:", {
            public_id: result.public_id,
            secure_url: result.secure_url,
            url: result.url,
            format: result.format,
            resource_type: result.resource_type,
            access_mode: result.access_mode,
          });
          resolve(result);
        }
      }
    );
    uploadStream.end(fileBuffer);
  });
}

// POST /api/upload-shipping-bill
export async function POST(request) {
  try {
    console.log("=== Upload Shipping Bill API Called ===");
    
    await connectDB();
    console.log("Database connected");

    const formData = await request.formData();
    const awbNo = formData.get("awbNo");
    const pdfFile = formData.get("pdf");
    const uploadType = formData.get("uploadType") || "single";
    const uploadedBy = formData.get("uploadedBy") || "";

    console.log("Received data:", {
      awbNo,
      pdfFileName: pdfFile?.name,
      pdfFileSize: pdfFile?.size,
      pdfFileType: pdfFile?.type,
      uploadType,
      uploadedBy,
    });

    // Validation
    if (!awbNo) {
      console.log("Validation failed: AWB Number missing");
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!pdfFile) {
      console.log("Validation failed: PDF file missing");
      return NextResponse.json(
        { success: false, message: "PDF file is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate file type
    if (pdfFile.type !== "application/pdf") {
      console.log("Validation failed: Invalid file type -", pdfFile.type);
      return NextResponse.json(
        { success: false, message: "Only PDF files are allowed" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if AWB exists in Shipment
    console.log("Searching for shipment with AWB:", awbNo);
    const shipment = await Shipment.findOne({ awbNo });
    
    if (!shipment) {
      console.log("Shipment not found for AWB:", awbNo);
      return NextResponse.json(
        { success: false, message: `AWB Number ${awbNo} not found in shipments` },
        { status: 404, headers: corsHeaders }
      );
    }

    console.log("Shipment found:", {
      awbNo: shipment.awbNo,
      accountCode: shipment.accountCode,
    });

    // Get customer details
    console.log("Searching for customer with account code:", shipment.accountCode);
    const customer = await CustomerAccount.findOne({
      accountCode: shipment.accountCode,
    });

    if (!customer) {
      console.log("Customer not found for account code:", shipment.accountCode);
      return NextResponse.json(
        { 
          success: false, 
          message: `Customer account ${shipment.accountCode} not found` 
        },
        { status: 404, headers: corsHeaders }
      );
    }

    console.log("Customer found:", {
      accountCode: customer.accountCode,
      name: customer.name,
    });

    // Check if shipping bill already exists - if yes, delete old file first
    const existingBill = await ShippingBill.findOne({ awbNo });
    if (existingBill) {
      console.log("Shipping bill already exists, deleting old file from Cloudinary...");
      
      try {
        // Delete old file from Cloudinary
        const oldPublicId = existingBill.pdfFile.publicId.replace(/\.pdf$/i, '');
        await cloudinary.uploader.destroy(oldPublicId, { resource_type: 'raw' });
        console.log("Old file deleted from Cloudinary");
        
        // Delete from database
        await ShippingBill.deleteOne({ awbNo });
        console.log("Old record deleted from database");
      } catch (deleteError) {
        console.error("Error deleting old file:", deleteError.message);
        // Continue anyway
      }
    }

    // Convert file to buffer
    console.log("Converting file to buffer...");
    const bytes = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log("Buffer created, size:", buffer.length);

    // Upload to Cloudinary
    console.log("Uploading to Cloudinary...");
    const cloudinaryResult = await uploadToCloudinary(buffer, pdfFile.name);
    console.log("Cloudinary upload successful:", {
      secure_url: cloudinaryResult.secure_url,
      public_id: cloudinaryResult.public_id,
      format: cloudinaryResult.format,
    });

    // Create shipping bill record with correct public_id
    console.log("Creating shipping bill record in database...");
    const shippingBill = await ShippingBill.create({
      awbNo: shipment.awbNo,
      accountCode: shipment.accountCode,
      customerName: customer.name,
      pdfFile: {
        fileName: pdfFile.name,
        fileUrl: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id, // This is correct from Cloudinary
        fileSize: pdfFile.size,
        uploadedAt: new Date(),
      },
      uploadType,
      uploadedBy,
      status: "uploaded",
    });

    console.log("Shipping bill created successfully:", {
      id: shippingBill._id,
      publicId: shippingBill.pdfFile.publicId,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Shipping bill uploaded successfully",
        data: {
          id: shippingBill._id,
          awbNo: shippingBill.awbNo,
          accountCode: shippingBill.accountCode,
          customerName: shippingBill.customerName,
          fileName: shippingBill.pdfFile.fileName,
          fileUrl: shippingBill.pdfFile.fileUrl,
          publicId: shippingBill.pdfFile.publicId,
          uploadedAt: shippingBill.pdfFile.uploadedAt,
        },
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("=== Upload Shipping Bill Error ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to upload shipping bill",
        error: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

// GET /api/upload-shipping-bill (Optional - to list uploaded bills)
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const awbNo = searchParams.get("awbNo");
    const accountCode = searchParams.get("accountCode");

    let query = {};
    if (awbNo) query.awbNo = awbNo;
    if (accountCode) query.accountCode = accountCode;

    const shippingBills = await ShippingBill.find(query)
      .sort({ createdAt: -1 })
      .limit(100);

    return NextResponse.json(
      {
        success: true,
        count: shippingBills.length,
        data: shippingBills,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Get shipping bills error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to fetch shipping bills",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}