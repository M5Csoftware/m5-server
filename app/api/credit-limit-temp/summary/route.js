// app/api/credit-limit-temp/summary/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CreditLimitTemp from "@/app/model/CreditLimitTemp";
import AccountLedger from "@/app/model/AccountLedger";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const customerCode = searchParams.get("customerCode")?.trim();

    if (!customerCode) {
      return NextResponse.json(
        { error: "customerCode query param required" },
        { status: 400 }
      );
    }

    // ✅ TOTAL SALES: sum of totalAmt from Shipment (SAME AS PAYMENT ENTRY)
    const totalSalesResult = await Shipment.aggregate([
      { $match: { accountCode: customerCode } },
      { $group: { _id: null, total: { $sum: "$totalAmt" } } },
    ]);

    // ✅ TOTAL RECEIPT: sum of amount from CreditLimitTemp (NOT PaymentEntry)
    const totalReceiptResult = await CreditLimitTemp.aggregate([
      { $match: { customerCode } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // ✅ TOTAL DEBIT: sum of debitAmount from CreditLimitTemp (NOT AccountLedger)
    const totalDebitResult = await CreditLimitTemp.aggregate([
      { $match: { customerCode } },
      { $group: { _id: null, total: { $sum: "$debitAmount" } } },
    ]);

    // ✅ TOTAL CREDIT: sum of creditAmount from CreditLimitTemp (NOT AccountLedger)
    const totalCreditResult = await CreditLimitTemp.aggregate([
      { $match: { customerCode } },
      { $group: { _id: null, total: { $sum: "$creditAmount" } } },
    ]);

    // ✅ TOTAL BALANCE calculation (SAME LOGIC AS PAYMENT ENTRY)
    // Total Balance = Total Sales - Total Receipt + Total Debit - Total Credit
    const totalBalance =
      (totalSalesResult[0]?.total || 0) -
      (totalReceiptResult[0]?.total || 0) +
      (totalDebitResult[0]?.total || 0) -
      (totalCreditResult[0]?.total || 0);

    return NextResponse.json(
      {
        summary: {
          totalSales: totalSalesResult[0]?.total || 0,
          totalReceipt: totalReceiptResult[0]?.total || 0,
          totalDebit: totalDebitResult[0]?.total || 0,
          totalCredit: totalCreditResult[0]?.total || 0,
          totalBalance,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Summary error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    );
  }
}