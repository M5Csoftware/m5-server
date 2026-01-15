// app/api/portal/setting-billing/route.js
import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import { v2 as cloudinary } from "cloudinary";
import path from "path";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// ============================================================================
// GET - Fetch data based on type
// ============================================================================
export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");
    const type = searchParams.get("type");

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    if (!type) {
      return NextResponse.json(
        { success: false, message: "Type parameter is required" },
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

    let data;

    switch (type) {
      case "viewInvoicing":
        data = customer.viewInvoicing || [];
        break;

      case "csbSettings":
        data = customer.csbSettings || [];
        break;

      case "form16":
        data = customer.form16 || {};
        
        // Always return the data as stored in database
        // The fileUrl from Cloudinary is already a direct download link
        console.log('Form-16 data retrieved:', {
          accountCode,
          fileName: data.fileName,
          fileUrl: data.fileUrl,
          publicId: data.publicId,
          fileSize: data.fileSize
        });
        break;

      default:
        return NextResponse.json(
          { success: false, message: "Invalid type parameter" },
          { status: 400 }
        );
    }

    return NextResponse.json({ 
      success: true, 
      data 
    });

  } catch (error) {
    console.error("Error fetching data:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Internal server error",
        error: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Create new entry or upload file
// ============================================================================
export async function POST(req) {
  try {
    await connectDB();
    const contentType = req.headers.get("content-type");

    // ========================================================================
    // Handle file upload for Form-16 (multipart/form-data)
    // ========================================================================
    if (contentType?.includes("multipart/form-data")) {
      const formData = await req.formData();
      const accountCode = formData.get("accountCode");
      const file = formData.get("file");

      if (!accountCode || !file) {
        return NextResponse.json(
          { success: false, message: "Account code and file are required" },
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

      // Delete old file from Cloudinary if exists
      if (customer.form16?.publicId) {
        try {
          await cloudinary.uploader.destroy(customer.form16.publicId, { 
            resource_type: "raw",
            invalidate: true
          });
          console.log('Old Form-16 deleted from Cloudinary:', customer.form16.publicId);
        } catch (error) {
          console.error("Error deleting old file from Cloudinary:", error);
        }
      }

      // Convert file to buffer
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Extract file information
      const originalFileName = file.name;
      const fileExtension = path.extname(originalFileName).toLowerCase() || '.pdf';
      const baseName = path.basename(originalFileName, fileExtension);
      
      // Clean the filename
      const cleanName = baseName
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_')
        .trim();
      
      const timestamp = Date.now();
      
      // Create public_id with folder structure
      const publicId = `form16/${accountCode}/${cleanName}_${timestamp}`;

      console.log('Uploading Form-16 to Cloudinary:', {
        accountCode,
        originalFileName,
        publicId,
        fileSize: file.size
      });

      // Upload to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              resource_type: "raw",
              public_id: publicId,
              access_mode: 'public',
              type: 'upload',
              overwrite: true,
            },
            (error, result) => {
              if (error) {
                console.error('Cloudinary upload error:', error);
                reject(error);
              } else {
                console.log('Cloudinary upload successful:', {
                  public_id: result.public_id,
                  secure_url: result.secure_url,
                  bytes: result.bytes
                });
                resolve(result);
              }
            }
          )
          .end(buffer);
      });

      // Store the secure URL from Cloudinary
      const fileUrl = uploadResult.secure_url;

      console.log('Form-16 uploaded successfully:', {
        accountCode,
        fileUrl,
        publicId: uploadResult.public_id
      });

      // Update customer record with Form-16 data
      customer.form16 = {
        fileName: originalFileName,
        fileUrl: fileUrl,
        publicId: uploadResult.public_id,
        fileSize: file.size,
        uploadedAt: new Date(),
      };

      await customer.save();

      return NextResponse.json(
        { 
          success: true, 
          data: customer.form16,
          message: "Form-16 uploaded successfully"
        },
        { status: 201 }
      );
    }

    // ========================================================================
    // Handle JSON data for viewInvoicing and csbSettings
    // ========================================================================
    const body = await req.json();
    const { accountCode, type, data } = body;

    if (!accountCode || !type) {
      return NextResponse.json(
        { success: false, message: "Account code and type are required" },
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

    let savedData;

    if (type === "viewInvoicing") {
      if (!customer.viewInvoicing) {
        customer.viewInvoicing = [];
      }
      customer.viewInvoicing.push({
        ...data,
        createdAt: new Date(),
      });
      await customer.save();
      savedData = customer.viewInvoicing[customer.viewInvoicing.length - 1];
    } 
    else if (type === "csbSettings") {
      if (!customer.csbSettings) {
        customer.csbSettings = [];
      }
      customer.csbSettings.push({
        ...data,
        createdAt: new Date(),
      });
      await customer.save();
      savedData = customer.csbSettings[customer.csbSettings.length - 1];
    } 
    else {
      return NextResponse.json(
        { success: false, message: "Invalid type parameter" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, data: savedData },
      { status: 201 }
    );

  } catch (error) {
    console.error("Error creating data:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Internal server error", 
        error: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT - Update existing entry
// ============================================================================
export async function PUT(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { accountCode, type, id, data } = body;

    if (!accountCode || !type) {
      return NextResponse.json(
        { success: false, message: "Account code and type are required" },
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

    let updatedData;

    if (type === "viewInvoicing") {
      if (!customer.viewInvoicing || customer.viewInvoicing.length === 0) {
        return NextResponse.json(
          { success: false, message: "No view invoicing entries found" },
          { status: 404 }
        );
      }

      const index = customer.viewInvoicing.findIndex(
        (item) => item._id.toString() === id
      );

      if (index === -1) {
        return NextResponse.json(
          { success: false, message: "Entry not found" },
          { status: 404 }
        );
      }

      customer.viewInvoicing[index] = {
        ...customer.viewInvoicing[index].toObject(),
        ...data,
        updatedAt: new Date(),
      };

      await customer.save();
      updatedData = customer.viewInvoicing[index];
    } 
    else if (type === "csbSettings") {
      if (!customer.csbSettings || customer.csbSettings.length === 0) {
        return NextResponse.json(
          { success: false, message: "No CSB settings entries found" },
          { status: 404 }
        );
      }

      const index = customer.csbSettings.findIndex(
        (item) => item._id.toString() === id
      );

      if (index === -1) {
        return NextResponse.json(
          { success: false, message: "Entry not found" },
          { status: 404 }
        );
      }

      customer.csbSettings[index] = {
        ...customer.csbSettings[index].toObject(),
        ...data,
        updatedAt: new Date(),
      };

      await customer.save();
      updatedData = customer.csbSettings[index];
    } 
    else {
      return NextResponse.json(
        { success: false, message: "Invalid type for update operation" },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: updatedData,
      message: "Entry updated successfully"
    });

  } catch (error) {
    console.error("Error updating data:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Internal server error",
        error: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete entry or file
// ============================================================================
export async function DELETE(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    if (!accountCode || !type) {
      return NextResponse.json(
        { success: false, message: "Account code and type are required" },
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

    if (type === "viewInvoicing") {
      if (!id) {
        return NextResponse.json(
          { success: false, message: "Entry ID is required for deletion" },
          { status: 400 }
        );
      }

      if (!customer.viewInvoicing) {
        customer.viewInvoicing = [];
      }

      const originalLength = customer.viewInvoicing.length;
      customer.viewInvoicing = customer.viewInvoicing.filter(
        (item) => item._id.toString() !== id
      );

      if (customer.viewInvoicing.length === originalLength) {
        return NextResponse.json(
          { success: false, message: "Entry not found" },
          { status: 404 }
        );
      }

      await customer.save();
    } 
    else if (type === "csbSettings") {
      if (!id) {
        return NextResponse.json(
          { success: false, message: "Entry ID is required for deletion" },
          { status: 400 }
        );
      }

      if (!customer.csbSettings) {
        customer.csbSettings = [];
      }

      const originalLength = customer.csbSettings.length;
      customer.csbSettings = customer.csbSettings.filter(
        (item) => item._id.toString() !== id
      );

      if (customer.csbSettings.length === originalLength) {
        return NextResponse.json(
          { success: false, message: "Entry not found" },
          { status: 404 }
        );
      }

      await customer.save();
    } 
    else if (type === "form16") {
      // Delete Form-16 file from Cloudinary
      if (customer.form16?.publicId) {
        try {
          const deleteResult = await cloudinary.uploader.destroy(
            customer.form16.publicId, 
            { 
              resource_type: "raw",
              invalidate: true
            }
          );
          
          console.log('Form-16 deleted from Cloudinary:', {
            publicId: customer.form16.publicId,
            result: deleteResult
          });
        } catch (error) {
          console.error("Error deleting file from Cloudinary:", error);
        }
      }

      // Clear Form-16 data from database
      customer.form16 = {
        fileName: "",
        fileUrl: "",
        publicId: "",
        fileSize: 0,
        uploadedAt: null,
      };

      await customer.save();
    } 
    else {
      return NextResponse.json(
        { success: false, message: "Invalid type parameter" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Entry deleted successfully",
    });

  } catch (error) {
    console.error("Error deleting data:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Internal server error",
        error: error.message 
      },
      { status: 500 }
    );
  }
}