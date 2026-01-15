import Branch from "@/app/model/Branch";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// Ensure DB connection
connectDB();

/**
 * Handle POST: Create a new branch
 */
export async function POST(req) {
  console.log('API route with method', req.method); 
  try {
    const body = await req.json(); // Parse JSON body
    console.log("Request body:", body); // Log incoming body for debugging
    const branch = new Branch(body);
    const savedBranch = await branch.save();
    console.log("Branch saved:", savedBranch); // Log saved branch
    return NextResponse.json(savedBranch, { status: 201 }); // 201 Created
  } catch (error) {
    console.error("Error branch-master:", error.message, error.stack); // Log error details
    return NextResponse.json(
      { error: "Failed to add branch", details: error.message },
      { status: 400 }
    );
  }
}


/**
 * Handle GET: Fetch branches
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id"); // Optional ID for fetching a specific branch

    if (id) {
      const branch = await Branch.findById(id);
      if (!branch) {
        return NextResponse.json({ error: "Branch not found" }, { status: 404 });
      }
      return NextResponse.json(branch, { status: 200 });
    }

    const branches = await Branch.find();
    return NextResponse.json(branches, { status: 200 }); // Return all branches
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch branches", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handle PUT: Update an existing branch
 */
export async function PUT(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id"); // Expect branch ID in query params
    const body = await req.json(); // Parse JSON body

    if (!id) {
      return NextResponse.json(
        { error: "ID is required to update a branch" },
        { status: 400 }
      );
    }

    const updatedBranch = await Branch.findByIdAndUpdate(id, body, {
      new: true, // Return the updated document
      runValidators: true, // Validate input fields
    }); 

    if (!updatedBranch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    return NextResponse.json(updatedBranch, { status: 200 }); // Return updated branch
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update branch", details: error.message },
      { status: 400 }
    );
  }
}

/**
 * Handle DELETE: Remove a branch
 */
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code"); // expect "code" instead of "id"

    if (!code) {
      return NextResponse.json(
        { error: "Code is required to delete a branch" },
        { status: 400 }
      );
    }

    const deletedBranch = await Branch.findOneAndDelete({ code }); // search by code

    if (!deletedBranch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Branch deleted successfully", branch: deletedBranch },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete branch", details: error.message },
      { status: 400 }
    );
  }
}

