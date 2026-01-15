import { NextResponse } from "next/server";
import User from "@/app/model/portal/User";
import CustomerAccount from "@/app/model/CustomerAccount";
import connectDB from "@/app/lib/db";

// POST: Register a new user
export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { emailId, password, accountType, fullName } = body;
    console.log(body);

    if (!emailId || !password || !accountType || !fullName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const existingUser = await User.findOne({ emailId }).lean();
    if (existingUser) {
      return NextResponse.json(
        { error: "Email already registered!" },
        { status: 409 }
      );
    }

    const newUser = new User(body);
    await newUser.save();

    return NextResponse.json(
      { message: "User registered successfully!", user: newUser },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration Error:", error);
    return NextResponse.json(
      { error: "Registration failed!", details: error.message },
      { status: 500 }
    );
  }
}


// GET: Fetch all users OR a specific user by ID
export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      // Fetch a single user by ID
      const user = await User.findById(id).lean();
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json(user, { status: 200 });
    }

    // If no ID provided, fetch all users
    const users = await User.find({}).lean();
    return NextResponse.json(users, { status: 200 });
  } catch (error) {
    console.error("GET user error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user(s)", details: error.message },
      { status: 500 }
    );
  }
}


// PUT: Update user by ID (used for status update, account code assignment, etc.)
export async function PUT(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "User ID is required!" },
        { status: 400 }
      );
    }

    const updatedData = await req.json();
    console.log("Updating user:", id, updatedData);

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updatedData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log("Updated user:", updatedUser);

    // ✅ FIX: Only update CustomerAccount if accountCode exists
    if (updatedUser.accountCode) {
      const updatedCustomer = await CustomerAccount.findOneAndUpdate(
        { accountCode: updatedUser.accountCode },
        { $set: { portalPasswordSector: updatedUser.password } },
        { new: true }
      );

      if (!updatedCustomer) {
        console.warn(`No customer found with accountCode: ${updatedUser.accountCode}`);
        // Don't return error here - user was updated successfully
        // Customer might not exist yet if they haven't been assigned a code
      } else {
        console.log("Updated customer account:", updatedCustomer);
      }
    } else {
      console.log("No accountCode assigned yet - skipping CustomerAccount update");
    }

    return NextResponse.json(
      { message: "User updated successfully", user: updatedUser },
      { status: 200 }
    );
  } catch (error) {
    console.error("Update error:", error);

    // Handle duplicate accountCode error
    if (error.code === 11000 && error.keyPattern?.accountCode) {
      return NextResponse.json(
        { error: "Account code already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update user", details: error.message },
      { status: 500 }
    );
  }
}


// DELETE: Delete user by ID
export async function DELETE(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "User ID is required!" },
        { status: 400 }
      );
    }

    const deletedUser = await User.findByIdAndDelete(id).lean();
    if (!deletedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "User deleted successfully!" },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete user", details: error.message },
      { status: 500 }
    );
  }
}