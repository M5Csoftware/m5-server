// File: server/portal/privacy-security/setting-delete/data/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import User from "@/app/model/portal/User";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";
import AccountLedger from "@/app/model/AccountLedger";

// Configure Next.js runtime
export const dynamic = 'force-dynamic';

// GET endpoint - Fetch all user data for PDF generation on frontend
export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get("accountCode");

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    console.log("Fetching user data for account:", accountCode);

    // Fetch all user data
    const user = await User.findOne({ accountCode }).lean();
    
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const customerAccount = await CustomerAccount.findOne({ accountCode }).lean();
    const shipments = await Shipment.find({ accountCode })
      .select('awbNo date receiverFullName receiverCity service totalAmt totalActualWt status')
      .sort({ date: -1 })
      .lean();
    
    const ledgerEntries = await AccountLedger.find({ accountCode })
      .select('date awbNo payment receiverFullName debitAmount creditAmount leftOverBalance')
      .sort({ date: -1 })
      .lean();

    console.log(`Data fetched successfully: ${shipments.length} shipments, ${ledgerEntries.length} ledger entries`);

    // Sanitize data to remove MongoDB-specific fields and ensure clean JSON
    const sanitizeData = (obj) => {
      if (!obj) return null;
      const sanitized = JSON.parse(JSON.stringify(obj));
      delete sanitized._id;
      delete sanitized.__v;
      return sanitized;
    };

    const responseData = {
      user: sanitizeData(user),
      customerAccount: sanitizeData(customerAccount),
      shipments: shipments.map(sanitizeData),
      ledgerEntries: ledgerEntries.map(sanitizeData),
      accountCode,
    };

    return NextResponse.json({
      success: true,
      data: responseData,
      message: "Data fetched successfully"
    });

  } catch (error) {
    console.error("Error fetching user data:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Failed to fetch user data", 
        error: error.message 
      },
      { status: 500 }
    );
  }
}