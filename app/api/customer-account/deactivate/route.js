import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// Ensure DB connection
connectDB();

export async function PUT(req) {
  try {
    const body = await req.json();
    console.log("Deactivate/Activate request body:", body);

    const { accountCode, deactivateStatus, deactivateReasonModal } = body;

    // Validate required fields
    if (!accountCode) {
      return NextResponse.json(
        { error: "accountCode is required" },
        { status: 400 }
      );
    }

    if (typeof deactivateStatus !== "boolean") {
      return NextResponse.json(
        { error: "deactivateStatus must be a boolean value" },
        { status: 400 }
      );
    }

    // Find existing customer account
    const existing = await CustomerAccount.findOne({ accountCode });
    if (!existing) {
      return NextResponse.json(
        { error: "Customer account not found" },
        { status: 404 }
      );
    }

    const updatePayload = {};

    if (deactivateStatus === true) {
      // DEACTIVATING ACCOUNT
      console.log("Deactivating account:", accountCode);
      
      // Validate deactivation reason
      if (!deactivateReasonModal || deactivateReasonModal.trim() === "") {
        return NextResponse.json(
          { error: "Deactivation reason is required" },
          { status: 400 }
        );
      }

      updatePayload.deactivateStatus = true;
      updatePayload.deactivateReason = deactivateReasonModal.trim();
      
    } else if (deactivateStatus === false) {
      // ACTIVATING ACCOUNT
      console.log("Activating account:", accountCode);
      
      updatePayload.deactivateStatus = false;
      updatePayload.deactivateReason = ""; // Clear the reason
    }

    // Update the customer account
    const updatedAccount = await CustomerAccount.findOneAndUpdate(
      { accountCode },
      { $set: updatePayload },
      { new: true, runValidators: true }
    );

    if (!updatedAccount) {
      return NextResponse.json(
        { error: "Failed to update customer account" },
        { status: 500 }
      );
    }

    const statusMessage = deactivateStatus ? "deactivated" : "activated";
    console.log(`Account ${accountCode} ${statusMessage} successfully`);

    return NextResponse.json(
      {
        success: true,
        message: `Account ${statusMessage} successfully`,
        data: {
          accountCode: updatedAccount.accountCode,
          deactivateStatus: updatedAccount.deactivateStatus,
          deactivateReason: updatedAccount.deactivateReason,
          name: updatedAccount.name,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in deactivate/activate route:", error.message, error.stack);
    return NextResponse.json(
      { 
        error: "Failed to update account status", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}