import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import User from "@/app/model/portal/User";

export async function PUT(request) {
  try {
    await connectDB();

    const { email, accountCode, field, value } = await request.json();

    if ((!email && !accountCode) || !field) {
      return NextResponse.json(
        { success: false, message: "Email or accountCode and field are required" },
        { status: 400 }
      );
    }

    // Valid onboarding fields
    const validFields = [
      "passwordSet",
      "companyProfileCompleted",
      "kycCompleted",
      "clientsImported",
      "shipmentCreated",
    ];

    if (!validFields.includes(field)) {
      return NextResponse.json(
        { success: false, message: "Invalid field" },
        { status: 400 }
      );
    }

    // Find user by email or accountCode
    const query = email ? { emailId: email } : { accountCode: accountCode };
    const user = await User.findOne(query);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // Update the specific onboarding field
    user.onboardingProgress[field] = value;
    await user.save();

    return NextResponse.json({
      success: true,
      message: "Onboarding progress updated",
      data: user.onboardingProgress,
    });
  } catch (error) {
    console.error("Error updating onboarding progress:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update onboarding progress" },
      { status: 500 }
    );
  }
}