// app/api/upload-shipping-bill/download-pdf/route.js

import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import ShippingBill from "@/app/model/ShippingBill";
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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request) {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET /api/upload-shipping-bill/download-pdf
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const awbNo = searchParams.get("awbNo");
    const fileName = searchParams.get("fileName");

    console.log("Download request:", { awbNo, fileName });

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Connect to database and get shipping bill
    await connectDB();
    
    const shippingBill = await ShippingBill.findOne({ awbNo });
    
    if (!shippingBill) {
      console.log("Shipping bill not found for AWB:", awbNo);
      return NextResponse.json(
        { success: false, message: `Shipping bill not found for AWB ${awbNo}` },
        { status: 404, headers: corsHeaders }
      );
    }

    console.log("Found shipping bill:", {
      awbNo: shippingBill.awbNo,
      publicId: shippingBill.pdfFile.publicId,
      fileName: shippingBill.pdfFile.fileName,
      fileUrl: shippingBill.pdfFile.fileUrl,
    });

    const downloadFileName = fileName || shippingBill.pdfFile.fileName || 'document.pdf';

    // Get the public_id and clean it
    let publicId = shippingBill.pdfFile.publicId;
    publicId = publicId.replace(/\.pdf$/i, '').replace(/\.PDF$/i, '');
    
    console.log("Using public_id:", publicId);

    // Generate a public download URL with fl_attachment flag
    const downloadUrl = cloudinary.url(publicId, {
      resource_type: 'raw',
      secure: true,
      flags: 'attachment',
      attachment: downloadFileName,
    });

    console.log("Generated download URL:", downloadUrl);

    // Fetch the file
    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    console.log("Fetch response:", response.status, response.statusText);

    if (!response.ok) {
      console.error("Download failed with status:", response.status);
      
      // Try direct URL from database
      console.log("Trying direct fileUrl:", shippingBill.pdfFile.fileUrl);
      
      const directResponse = await fetch(shippingBill.pdfFile.fileUrl);
      
      if (directResponse.ok) {
        const pdfBuffer = await directResponse.arrayBuffer();
        
        if (pdfBuffer.byteLength > 0) {
          console.log("Success with direct URL, size:", pdfBuffer.byteLength);
          
          return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${downloadFileName}"`,
              "Content-Length": pdfBuffer.byteLength.toString(),
              "Cache-Control": "no-cache",
            },
          });
        }
      }
      
      throw new Error(
        `Failed to download PDF. The file may not exist in Cloudinary or has incorrect permissions. ` +
        `Status: ${response.status}. Please re-upload the file.`
      );
    }

    // Success - get the PDF data
    const pdfBuffer = await response.arrayBuffer();

    if (pdfBuffer.byteLength === 0) {
      throw new Error("Downloaded file is empty (0 bytes)");
    }

    console.log("Successfully downloaded PDF, size:", pdfBuffer.byteLength, "bytes");

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadFileName}"`,
        "Content-Length": pdfBuffer.byteLength.toString(),
        "Cache-Control": "no-cache",
      },
    });

  } catch (error) {
    console.error("Download PDF error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to download PDF",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}