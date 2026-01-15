import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import { getServerSession } from "next-auth";

// GET - Fetch customer profile data
export async function GET(req) {
  try {
    await connectDB();
    
    // Get accountCode from query params
    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get('accountCode');
    
    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    const customerAccount = await CustomerAccount.findOne({ accountCode });

    if (!customerAccount) {
      return NextResponse.json(
        { success: false, message: "Customer account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: customerAccount,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update customer profile data
export async function PUT(req) {
  try {
    await connectDB();
    
    const body = await req.json();
    
    const { accountCode, ...updateFields } = body;
    
    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    // Fields that are allowed to be updated
    const allowedFields = [
      "name",
      "email",
      "telNo",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "pinCode",
      "country",
      "contactPerson",
      "panNo",
      "gstNo",
      "kycNo"
    ];

    // Filter only allowed fields
    const updateData = {};
    Object.keys(updateFields).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = updateFields[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, message: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updatedAccount = await CustomerAccount.findOneAndUpdate(
      { accountCode },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedAccount) {
      return NextResponse.json(
        { success: false, message: "Customer account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedAccount,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}