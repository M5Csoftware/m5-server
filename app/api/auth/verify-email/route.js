import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { email } = body;

    console.log(`🔍 Email verification request for: ${email}`);

    // Validate email is provided
    if (!email) {
      console.log(`✗ Email not provided`);
      return NextResponse.json(
        { success: false, message: "Email is required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log(`✗ Invalid email format: ${email}`);
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase().trim();

    // Escape special regex characters
    const escapedEmail = emailLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Check if employee exists with this email (case-insensitive search)
    const employee = await Employee.findOne({ 
      email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') }
    });

    if (!employee) {
      console.log(`✗ Email not found in database: ${emailLower}`);
      
      // Additional debugging - count total employees
      const totalEmployees = await Employee.countDocuments();
      console.log(`📊 Total employees in database: ${totalEmployees}`);
      
      return NextResponse.json(
        { success: false, message: "Email not found in our records" },
        { status: 404 }
      );
    }

    console.log(`✓ Email verified successfully: ${emailLower} (User: ${employee.userName}, Stored as: ${employee.email})`);

    return NextResponse.json(
      {
        success: true,
        message: "Email verified successfully",
        data: {
          userName: employee.userName,
          userId: employee.userId,
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Email verification error:", error);
    return NextResponse.json(
      { success: false, message: "Server error during email verification" },
      { status: 500 }
    );
  }
}