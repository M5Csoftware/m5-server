// app/api/portal/label-preferences/route.js
import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// GET - Fetch logo for account
export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({ accountCode });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 }
      );
    }

    const data = {
      logoUrl: customer.labelLogo?.logoUrl || null,
      uploadedAt: customer.labelLogo?.uploadedAt || null,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching logo:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Upload logo
export async function POST(req) {
  try {
    await connectDB();
    const formData = await req.formData();
    const accountCode = formData.get("accountCode");
    const logo = formData.get("logo");

    if (!accountCode || !logo) {
      return NextResponse.json(
        { success: false, message: "Account code and logo are required" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({ accountCode });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 }
      );
    }

    // Delete old logo from Cloudinary if exists
    if (customer.labelLogo?.logoUrl) {
      try {
        const publicId = customer.labelLogo.logoUrl
          .split("/")
          .slice(-2)
          .join("/")
          .split(".")[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (error) {
        console.error("Error deleting old logo:", error);
      }
    }

    // Convert file to buffer
    const bytes = await logo.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `label-logos/${accountCode}`,
            public_id: `logo_${Date.now()}`,
            resource_type: "image",
            transformation: [
              { width: 540, height: 100, crop: "fit" },
              { quality: "auto" },
            ],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(buffer);
    });

    // Update customer record
    customer.labelLogo = {
      logoUrl: uploadResult.secure_url,
      uploadedAt: new Date(),
    };

    await customer.save();

    return NextResponse.json(
      { success: true, data: customer.labelLogo },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error uploading logo:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete logo
export async function DELETE(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({ accountCode });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 404 }
      );
    }

    // Delete logo from Cloudinary
    if (customer.labelLogo?.logoUrl) {
      try {
        const publicId = customer.labelLogo.logoUrl
          .split("/")
          .slice(-2)
          .join("/")
          .split(".")[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (error) {
        console.error("Error deleting logo from Cloudinary:", error);
      }
    }

    customer.labelLogo = {
      logoUrl: "",
      uploadedAt: null,
    };

    await customer.save();

    return NextResponse.json({
      success: true,
      message: "Logo deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting logo:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}