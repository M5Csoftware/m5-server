import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function POST(req) {
  try {
    await connectDB();

    const { userId, password } = await req.json();

    console.log(`🔐 Login attempt for userId: ${userId}`);

    // Validate required fields
    if (!userId || !password) {
      return NextResponse.json(
        { success: false, message: "User ID and password are required" },
        { status: 400 }
      );
    }

    // Find employee by userId
    const employee = await Employee.findOne({ userId: userId.trim() });

    if (!employee) {
      console.log(`✗ Employee not found with userId: ${user.Id}`);
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    // After finding the employee
    if (employee.deactivated) {
      console.log(`✗ Login attempt for deactivated account: ${userId}`);
      return NextResponse.json(
        {
          success: false,
          message: "Account is deactivated. Contact admin.",
        },
        { status: 403 } // Forbidden
      );
    }

    console.log(`✓ Employee found: ${employee.userName} (${employee.email})`);

    // Compare password with bcrypt
    // const isPasswordValid = await bcrypt.compare(password, employee.password);
    const isPasswordValid = password === employee.password;

    if (!isPasswordValid) {
      console.log(`✗ Invalid password for userId: ${userId}`);
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    console.log(`✓ Password verified for userId: ${userId}`);

    // Generate JWT token (if you're using JWT)
    const token = jwt.sign(
      {
        userId: employee.userId,
        email: employee.email,
        role: employee.role,
      },
      process.env.JWT_SECRET || "your-secret-key-change-in-production",
      { expiresIn: "7d" }
    );

    // Return user data (exclude password)
    const userData = {
      userId: employee.userId,
      userName: employee.userName,
      email: employee.email,
      role: employee.role,
      branch: employee.branch,
      hub: employee.hub,
      department: employee.department,
      permissions: employee.permissions,
      dashboardAccess: employee.dashboardAccess || [],
      stateAssigned: employee.stateAssigned,
      cityAssigned: employee.cityAssigned,
      sector: employee.sector,
    };

    console.log(`✓ Login successful for userId: ${userId}`);

    return NextResponse.json(
      {
        success: true,
        message: "Login successful",
        user: userData,
        token: token,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Login error:", error);
    return NextResponse.json(
      { success: false, message: "Server error during login" },
      { status: 500 }
    );
  }
}
