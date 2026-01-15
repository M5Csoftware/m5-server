// app/api/credit-limit-temp/route.js (UPDATED GET METHOD)
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import CreditLimitTemp from "@/app/model/CreditLimitTemp";
import AccountLedger from "@/app/model/AccountLedger";
import Shipment from "@/app/model/portal/Shipment";
import jwt from "jsonwebtoken";

async function getEntryUser(req) {
  try {
    const userHeader = req.headers.get("user") || req.headers.get("User");
    if (userHeader) {
      try {
        const parsed = JSON.parse(userHeader);
        return parsed.userId || parsed.userName || "Unknown";
      } catch {
        console.warn("Invalid user header JSON, entryUser set as Unknown");
      }
    }

    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.split(" ")[1];
    if (!token) return "Unknown";

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.username || decoded.userId || "Unknown";
  } catch (err) {
    console.warn("Invalid token, entryUser set as Unknown");
    return "Unknown";
  }
}

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const receiptNo = searchParams.get("receiptNo")?.trim();
    const customerCode = searchParams.get("customerCode")?.trim();

    // ✅ Case 1: Fetch totals by customerCode only (when entering customer code)
    if (customerCode && !receiptNo) {
      console.log("🔍 Fetching totals for customerCode:", customerCode);

      // Get customer account for leftOverBalance
      const customer = await CustomerAccount.findOne({
        accountCode: customerCode.toUpperCase(),
      });

      if (!customer) {
        return NextResponse.json(
          { error: "Customer not found" },
          { status: 404 }
        );
      }

      // TOTAL SALES: from Shipment (SAME AS PAYMENT ENTRY)
      const totalSalesResult = await Shipment.aggregate([
        { $match: { accountCode: customerCode } },
        { $group: { _id: null, total: { $sum: "$totalAmt" } } },
      ]);

      // TOTAL RECEIPT: from CreditLimitTemp (NOT PaymentEntry)
      const totalReceiptResult = await CreditLimitTemp.aggregate([
        { $match: { customerCode } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      // TOTAL DEBIT: from CreditLimitTemp (NOT AccountLedger)
      const totalDebitResult = await CreditLimitTemp.aggregate([
        { $match: { customerCode } },
        { $group: { _id: null, total: { $sum: "$debitAmount" } } },
      ]);

      // TOTAL CREDIT: from CreditLimitTemp (NOT AccountLedger)
      const totalCreditResult = await CreditLimitTemp.aggregate([
        { $match: { customerCode } },
        { $group: { _id: null, total: { $sum: "$creditAmount" } } },
      ]);

      // ✅ TOTAL BALANCE: Fetch from CustomerAccount.leftOverBalance
      const totalBalance = customer.leftOverBalance || 0;

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
    }

    // ✅ Case 2: Fetch record by receiptNo (when searching receipt)
    if (!receiptNo) {
      return NextResponse.json(
        { error: "receiptNo or customerCode query param required" },
        { status: 400 }
      );
    }

    const record = await CreditLimitTemp.findOne({ receiptNo }).lean();

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const acct = record.customerCode;

    console.log("🔍 Searching for customerCode:", acct);

    // Get customer account for leftOverBalance
    const customer = await CustomerAccount.findOne({
      accountCode: acct.toUpperCase(),
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // TOTAL SALES: from Shipment (SAME AS PAYMENT ENTRY)
    const totalSalesResult = await Shipment.aggregate([
      { $match: { accountCode: acct } },
      { $group: { _id: null, total: { $sum: "$totalAmt" } } },
    ]);

    // TOTAL RECEIPT: from CreditLimitTemp (NOT PaymentEntry)
    const totalReceiptResult = await CreditLimitTemp.aggregate([
      { $match: { customerCode: acct } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // TOTAL DEBIT: from CreditLimitTemp (NOT AccountLedger)
    const totalDebitResult = await CreditLimitTemp.aggregate([
      { $match: { customerCode: acct } },
      { $group: { _id: null, total: { $sum: "$debitAmount" } } },
    ]);

    // TOTAL CREDIT: from CreditLimitTemp (NOT AccountLedger)
    const totalCreditResult = await CreditLimitTemp.aggregate([
      { $match: { customerCode: acct } },
      { $group: { _id: null, total: { $sum: "$creditAmount" } } },
    ]);

    // ✅ TOTAL BALANCE: Fetch from CustomerAccount.leftOverBalance
    const totalBalance = customer.leftOverBalance || 0;

    return NextResponse.json(
      {
        record,
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
    console.error("GET CreditLimitTemp Error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();

    // ✅ Get entryUser from request body (sent by frontend)
    const entryUser = body.entryUser || "Unknown";

    const {
      customerCode,
      customerName,
      branchCode,
      branchName,
      amount,
      mode,
      bankName,
      receiptType,
      debitAmount,
      creditAmount,
      debitNo,
      creditNo,
      date,
      remarks,
      verifyRemarks,
    } = body;

    console.log("📝 POST entryUser:", entryUser); // Debug log

    if (!customerCode || isNaN(Number(amount)) || !mode) {
      return NextResponse.json(
        { error: "Customer code, valid amount, and mode are required" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({
      accountCode: customerCode.toUpperCase(),
    });
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }
    if ((customer.modeType || "").trim().toLowerCase() !== "temp") {
      return NextResponse.json(
        { error: "Only TEMP customers can have Credit Limit Temp entries." },
        { status: 400 }
      );
    }

    // ✅ Store opening balance BEFORE any changes
    const openingBalance = customer.leftOverBalance || 0;

    // ✅ Update customer leftover balance (SAME LOGIC AS PAYMENT ENTRY)
    let updatedBalance = customer.leftOverBalance || 0;

    if (Number(debitAmount) > 0) {
      updatedBalance += Number(debitAmount);
    } else if (Number(creditAmount) > 0) {
      updatedBalance -= Number(creditAmount);
    } else {
      switch (receiptType?.toUpperCase().trim()) {
        case "RETURN":
        case "GENERAL ENTRY":
        case "TDS":
        case "OTHER":
          updatedBalance += Number(amount);
          break;
        case "BAD DEBTS":

        default:
          updatedBalance -= Number(amount);
          break;
      }
    }

    // ✅ Save updated balance to customer account
    customer.leftOverBalance = updatedBalance;
    await customer.save();

    const closingBalance = updatedBalance;

    // Generate receiptNo starting from 5000
    const lastRecord = await CreditLimitTemp.findOne({}, { receiptNo: 1 })
      .sort({ receiptNo: -1 })
      .lean();
    const nextReceiptNo = lastRecord ? Number(lastRecord.receiptNo) + 1 : 5000;

    // ✅ Create Credit Limit Temp record
    const record = await CreditLimitTemp.create({
      customerCode: customerCode.toUpperCase(),
      customerName,
      branchCode,
      branchName,
      amount: Number(amount),
      mode,
      bankName,
      receiptType,
      debitAmount: Number(debitAmount) || 0,
      creditAmount: Number(creditAmount) || 0,
      debitNo,
      creditNo,
      receiptNo: nextReceiptNo.toString(),
      date: date ? new Date(date) : new Date(),
      remarks: remarks || "",
      verifyRemarks: verifyRemarks || "",
      openingBalance,
      closingBalance,
      entryUser, // ✅ Set from request body
      verified: "No", // ✅ Default to No
      verifiedBy: null, // ✅ Default to null
    });

    console.log("✅ Created record with entryUser:", record.entryUser); // Debug log

    // ✅ Create AccountLedger entry (SAME AS PAYMENT ENTRY)
    const ledgerPayload = {
      accountCode: customerCode.toUpperCase(),
      customer: customerName,
      openingBalance,
      date: date ? new Date(date) : new Date(),
      payment: mode,
      receivedAmount: Number(amount),
      debitAmount: Number(debitAmount) || 0,
      creditAmount: Number(creditAmount) || 0,
      operationRemark: remarks || "",
      awbNo: nextReceiptNo.toString(),
      leftOverBalance: closingBalance,
      entryUser,
    };

    await AccountLedger.create(ledgerPayload);

    return NextResponse.json(
      { message: "Record saved successfully", record, customer },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error saving CreditLimitTemp record:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    await connectDB();
    const entryUser = await getEntryUser(req);

    const body = await req.json();
    const { receiptNo, isVerified, verifyRemarks, ...updateData } = body;

    if (!receiptNo) {
      return NextResponse.json(
        { error: "receiptNo is required to update record" },
        { status: 400 }
      );
    }

    const record = await CreditLimitTemp.findOne({ receiptNo });
    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const customer = await CustomerAccount.findOne({
      accountCode: record.customerCode,
    });
    if (
      !customer ||
      (customer.modeType || "").trim().toLowerCase() !== "temp"
    ) {
      return NextResponse.json(
        {
          error:
            "Only TEMP customers can have Credit Limit Temp modifications.",
        },
        { status: 400 }
      );
    }

    // Apply updates to record fields only (no balance adjustment on modify)
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined) record[key] = updateData[key];
    });

    // Verification handling
    if (isVerified && verifyRemarks?.trim()) {
      record.verified = "Yes";
      record.verifiedBy = entryUser;
      record.verifyRemarks = verifyRemarks;
    } else {
      record.verified = "No";
      record.verifiedBy = null;
      if (verifyRemarks !== undefined) record.verifyRemarks = verifyRemarks;
    }

    // Ensure verifyRemarks not lost
    if (updateData.verifyRemarks === undefined && !record.verifyRemarks) {
      record.verifyRemarks = "";
    }

    await record.save();

    return NextResponse.json(
      { message: "Record updated successfully", record },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating CreditLimitTemp record:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
