import { v2 as cloudinary } from 'cloudinary';
import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/db';
import Vendor from '@/app/model/Vendor';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dhlrogvj1",
  api_key: process.env.CLOUDINARY_API_KEY || "642583471231691",
  api_secret: process.env.CLOUDINARY_API_SECRET || "mEhp5rJDSOkffyh2gTYVxkwlYUU"
});

export async function POST(request) {
  try {
    await connectDB();

    const formData = await request.formData();
    const file = formData.get('logo');
    const vendorCode = formData.get('vendorCode');

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    if (!vendorCode) {
      return NextResponse.json(
        { success: false, error: 'Vendor code is required' },
        { status: 400 }
      );
    }

    // Find vendor by code
    const vendor = await Vendor.findOne({ code: vendorCode });

    if (!vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found. Please save vendor details first.' },
        { status: 404 }
      );
    }

    // Delete old logo from Cloudinary if exists
    if (vendor.logo?.publicId) {
      try {
        await cloudinary.uploader.destroy(vendor.logo.publicId);
        console.log('Old logo deleted:', vendor.logo.publicId);
      } catch (deleteError) {
        console.error('Error deleting old logo:', deleteError);
        // Continue even if delete fails
      }
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64File = `data:${file.type};base64,${buffer.toString('base64')}`;

    // Upload to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(base64File, {
      folder: 'vendor-logos',
      public_id: `vendor_${vendorCode}_${Date.now()}`,
      resource_type: 'auto',
      transformation: [
        { width: 500, height: 500, crop: 'limit' },
        { quality: 'auto' }
      ]
    });

    // Update vendor document with logo information
    vendor.logo = {
      url: uploadResponse.secure_url,
      publicId: uploadResponse.public_id,
      uploadedAt: new Date()
    };

    await vendor.save();

    return NextResponse.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: {
        url: uploadResponse.secure_url,
        publicId: uploadResponse.public_id,
        vendorCode: vendorCode,
        uploadedAt: vendor.logo.uploadedAt
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to upload logo',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// DELETE endpoint to remove logo
export async function DELETE(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const vendorCode = searchParams.get('code');
    const publicId = searchParams.get('publicId');

    if (!vendorCode && !publicId) {
      return NextResponse.json(
        { success: false, error: 'Vendor code or Public ID is required' },
        { status: 400 }
      );
    }

    let vendor;
    
    // Find vendor by code or publicId
    if (vendorCode) {
      vendor = await Vendor.findOne({ code: vendorCode });
    } else if (publicId) {
      vendor = await Vendor.findOne({ 'logo.publicId': publicId });
    }

    if (!vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      );
    }

    // Delete from Cloudinary
    if (vendor.logo?.publicId) {
      await cloudinary.uploader.destroy(vendor.logo.publicId);
    }

    // Remove logo data from database
    vendor.logo = {
      url: null,
      publicId: null,
      uploadedAt: null
    };

    await vendor.save();

    return NextResponse.json({
      success: true,
      message: 'Logo deleted successfully'
    }, { status: 200 });

  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to delete logo',
        details: error.message 
      },
      { status: 500 }
    );
  }
}