export const dynamic = "force-dynamic";
import connectDB from "@/app/lib/db";
import AccountLedger from "@/app/model/AccountLedger";
import { NextResponse } from "next/server";

const RCPT_PAYMENTS = [
  "Cash",
  "Cheque",
  "DD",
  "RTGS",
  "NEFT",
  "IMPS",
  "Bank",
  "Demand Draft",
  "Overseas (COD)",
  "Others",
];

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");
    const includeHold = searchParams.get("includeHold") === "true";

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Missing accountCode" },
        { status: 400 }
      );
    }

    console.log("=== Ledger Summary Request ===");
    console.log("Account Code:", accountCode);
    console.log("Include Hold:", includeHold);

    // Build base query
    const baseQuery = {
      accountCode,
      $or: [
        // Include RCPT payments
        { payment: { $in: RCPT_PAYMENTS } },
        // Include Sales (Credit, empty string, or non-existent payment field)
        { payment: "Credit" },
        { payment: "" },
        { payment: { $exists: false } },
      ],
    };

    // Apply hold filter only if checkbox is NOT checked
    if (!includeHold) {
      baseQuery.$and = [
        {
          $or: [{ isHold: false }, { isHold: { $exists: false } }],
        },
      ];
    }

    // Fetch all ledger entries for this account
    const entries = await AccountLedger.find(baseQuery);

    console.log("=== Ledger Entries Found:", entries.length);

    // Calculate totals
    let totalSales = 0;
    let totalPayment = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    let outstanding = 0;

    entries.forEach((entry) => {
      // Sum of GrandTotal (totalAmt)
      totalSales += parseFloat(entry.totalAmt || 0);

      // Sum of Received Amount
      // Only count receivedAmount if there's no debit/credit
      const rcvAmount = 
        entry.debitAmount > 0 || entry.creditAmount > 0 
          ? 0 
          : parseFloat(entry.receivedAmount || 0);
      totalPayment += rcvAmount;

      // Sum of Debit Amount
      totalDebit += parseFloat(entry.debitAmount || 0);

      // Sum of Credit Amount
      totalCredit += parseFloat(entry.creditAmount || 0);

      // Sum of Balance (this is the outstanding per entry)
      outstanding += parseFloat(entry.totalAmt || 0);
    });

    // Calculate final outstanding: (Sales + Debit) - (Payment + Credit)
    const calculatedOutstanding = (totalSales + totalDebit) - (totalPayment + totalCredit);

    console.log("=== Calculated Summary ===");
    console.log("Total Sales (GrandTotal):", totalSales.toFixed(2));
    console.log("Total Payment (RcvAmount):", totalPayment.toFixed(2));
    console.log("Total Debit:", totalDebit.toFixed(2));
    console.log("Total Credit:", totalCredit.toFixed(2));
    console.log("Outstanding:", calculatedOutstanding.toFixed(2));

    return NextResponse.json({
      success: true,
      summary: {
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalPayment: parseFloat(totalPayment.toFixed(2)),
        totalDebit: parseFloat(totalDebit.toFixed(2)),
        totalCredit: parseFloat(totalCredit.toFixed(2)),
        outstanding: parseFloat(calculatedOutstanding.toFixed(2)),
      },
      entryCount: entries.length,
    });
  } catch (error) {
    console.error("Ledger Summary error:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Failed to fetch ledger summary",
        error: error.message 
      },
      { status: 500 }
    );
  }
}