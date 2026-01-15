// Backend API Route: app/api/kyc-software/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";

// GET - Fetch all accounts with KYC verification data
// GET - Fetch all accounts with KYC verification data
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get("accountCode");

    if (accountCode) {
      // Fetch specific account
      const account = await CustomerAccount.findOne(
        { accountCode },
        {
          accountCode: 1,
          accountType: 1, // ADD THIS
          name: 1,
          contactPerson: 1,
          email: 1,
          telNo: 1,
          kycVerification: 1,
        }
      );

      if (!account) {
        return NextResponse.json(
          { success: false, message: "Account not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: account,
      });
    }

    // Fetch all accounts with KYC data
    const accounts = await CustomerAccount.find(
      {
        "kycVerification.status": { $in: ["under_review", "verified", "rejected"] },
      },
      {
        accountCode: 1,
        accountType: 1, // ADD THIS
        name: 1,
        contactPerson: 1,
        email: 1,
        telNo: 1,
        kycVerification: 1,
      }
    ).sort({ "kycVerification.submittedAt": -1 });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Error fetching KYC data:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch KYC data" },
      { status: 500 }
    );
  }
}

// PUT - Update KYC verification status (Approve/Reject)
export async function PUT(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { accountCode, action, rejectionReason, verifiedBy } = body;

    if (!accountCode || !action) {
      return NextResponse.json(
        { success: false, message: "Account code and action are required" },
        { status: 400 }
      );
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { success: false, message: "Invalid action. Use 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    if (action === "reject" && !rejectionReason) {
      return NextResponse.json(
        { success: false, message: "Rejection reason is required" },
        { status: 400 }
      );
    }

    // Find the account
    const account = await CustomerAccount.findOne({ accountCode });

    if (!account) {
      return NextResponse.json(
        { success: false, message: "Account not found" },
        { status: 404 }
      );
    }

    if (!account.kycVerification) {
      return NextResponse.json(
        { success: false, message: "No KYC verification data found" },
        { status: 400 }
      );
    }

    // Update KYC status based on action
    if (action === "approve") {
      account.kycVerification.status = "verified";
      account.kycVerification.verifiedAt = new Date();
      account.kycVerification.verifiedBy = verifiedBy || "Admin";
      account.kycVerification.rejectedAt = null;
      account.kycVerification.rejectionReason = "";
    } else if (action === "reject") {
      account.kycVerification.status = "rejected";
      account.kycVerification.rejectedAt = new Date();
      account.kycVerification.rejectionReason = rejectionReason;
      account.kycVerification.verifiedAt = null;
      account.kycVerification.verifiedBy = "";
    }

    await account.save();

    return NextResponse.json({
      success: true,
      message: `KYC ${action === "approve" ? "approved" : "rejected"} successfully`,
      data: {
        accountCode: account.accountCode,
        status: account.kycVerification.status,
        verifiedAt: account.kycVerification.verifiedAt,
        rejectedAt: account.kycVerification.rejectedAt,
        rejectionReason: account.kycVerification.rejectionReason,
      },
    });
  } catch (error) {
    console.error("Error updating KYC status:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update KYC status" },
      { status: 500 }
    );
  }
}

// POST - Submit KYC for verification (from portal)
export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { accountCode, method } = body;

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    const account = await CustomerAccount.findOne({ accountCode });

    if (!account) {
      return NextResponse.json(
        { success: false, message: "Account not found" },
        { status: 404 }
      );
    }

    // If DigiLocker verification, mark as verified immediately
    if (method === "digilocker") {
      if (!account.kycVerification) {
        account.kycVerification = {};
      }
      account.kycVerification.status = "verified";
      account.kycVerification.method = "digilocker";
      account.kycVerification.submittedAt = new Date();
      account.kycVerification.verifiedAt = new Date();
      account.kycVerification.verifiedBy = "DigiLocker (Automated)";
    } else {
      // Manual verification - mark as under_review
      if (account.kycVerification && account.kycVerification.documents.length === 2) {
        account.kycVerification.status = "under_review";
        account.kycVerification.submittedAt = new Date();
      } else {
        return NextResponse.json(
          { success: false, message: "Please upload both documents before submission" },
          { status: 400 }
        );
      }
    }

    await account.save();

    return NextResponse.json({
      success: true,
      message: "KYC submitted successfully",
      data: {
        status: account.kycVerification.status,
        method: account.kycVerification.method,
        submittedAt: account.kycVerification.submittedAt,
      },
    });
  } catch (error) {
    console.error("Error submitting KYC:", error);
    return NextResponse.json(
      { success: false, message: "Failed to submit KYC" },
      { status: 500 }
    );
  }
}