import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import PaymentEntry from "@/app/model/PaymentEntry";
import jwt from "jsonwebtoken";
import AccountLedger from "@/app/model/AccountLedger";
import Shipment from "@/app/model/portal/Shipment";

const parseDDMMYYYY = (str) => {
  if (!str) return null;
  const [d, m, y] = str.split("/");
  if (!d || !m || !y) return null;
  return new Date(`${y}-${m}-${d}`);
};

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
    const accountCode = searchParams.get("accountCode")?.trim();

    // ✅ Case 1: Fetch totals by accountCode only (when entering customer code)
    if (accountCode && !receiptNo) {
      console.log("🔍 Fetching totals for accountCode:", accountCode);

      const totalSalesResult = await Shipment.aggregate([
        { $match: { accountCode } },
        { $group: { _id: null, total: { $sum: "$totalAmt" } } },
      ]);

      const totalReceiptResult = await PaymentEntry.aggregate([
        { $match: { accountCode } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const totalDebitResult = await AccountLedger.aggregate([
        { $match: { accountCode } },
        { $group: { _id: null, total: { $sum: "$debitAmount" } } },
      ]);

      const totalCreditResult = await AccountLedger.aggregate([
        { $match: { accountCode } },
        { $group: { _id: null, total: { $sum: "$creditAmount" } } },
      ]);

      return NextResponse.json(
        {
          summary: {
            totalSales: totalSalesResult[0]?.total || 0,
            totalReceipt: totalReceiptResult[0]?.total || 0,
            totalDebit: totalDebitResult[0]?.total || 0,
            totalCredit: totalCreditResult[0]?.total || 0,
          },
        },
        { status: 200 }
      );
    }

    // ✅ Case 2: Fetch payment by receiptNo (when searching receipt)
    if (!receiptNo) {
      return NextResponse.json(
        { error: "receiptNo or accountCode query param required" },
        { status: 400 }
      );
    }

    const payment = await PaymentEntry.findOne({ receiptNo });

    if (!payment) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    const paymentAccountCode = payment.accountCode;

    console.log("🔍 Searching for accountCode:", paymentAccountCode);

    // ✅ Total sales = sum of totalAmt from Shipment (using accountCode field)
    const totalSalesResult = await Shipment.aggregate([
      { $match: { accountCode: paymentAccountCode } },
      { $group: { _id: null, total: { $sum: "$totalAmt" } } },
    ]);

    // ✅ Total receipt = sum of amount from PaymentEntry
    const totalReceiptResult = await PaymentEntry.aggregate([
      { $match: { accountCode: paymentAccountCode } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // ✅ Total debit = sum of debitAmount from AccountLedger (using accountCode field)
    const totalDebitResult = await AccountLedger.aggregate([
      { $match: { accountCode: paymentAccountCode } },
      { $group: { _id: null, total: { $sum: "$debitAmount" } } },
    ]);

    // ✅ Total credit = sum of creditAmount from AccountLedger (using accountCode field)
    const totalCreditResult = await AccountLedger.aggregate([
      { $match: { accountCode: paymentAccountCode } },
      { $group: { _id: null, total: { $sum: "$creditAmount" } } },
    ]);

    return NextResponse.json(
      {
        payment,
        summary: {
          totalSales: totalSalesResult[0]?.total || 0,
          totalReceipt: totalReceiptResult[0]?.total || 0,
          totalDebit: totalDebitResult[0]?.total || 0,
          totalCredit: totalCreditResult[0]?.total || 0,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("GET Payment Entry Error:", err);
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
    const entryUser = body.entryUser || "Unknown";

    const {
      accountCode,
      customerName,
      branchCode,
      amount,
      mode,
      chequeNo,
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

    if (!accountCode || isNaN(Number(amount)) || !mode) {
      return NextResponse.json(
        { error: "Account code, valid amount, and mode are required" },
        { status: 400 }
      );
    }

    const allowedModes = [
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
    if (!allowedModes.includes(mode)) {
      return NextResponse.json(
        { error: `Invalid mode. Allowed values: ${allowedModes.join(", ")}` },
        { status: 400 }
      );
    }

    const allowedReceiptTypes = [
      "General Entry",
      "Debit Note",
      "Credit Note",
      "TDS",
      "Return",
      "Bad Debts",
      "Other",
    ];
    if (receiptType && !allowedReceiptTypes.includes(receiptType)) {
      return NextResponse.json(
        {
          error: `Invalid receiptType. Allowed values: ${allowedReceiptTypes.join(
            ", "
          )}`,
        },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({
      accountCode: accountCode.toUpperCase(),
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    if ((customer.modeType || "").trim().toLowerCase() !== "normal") {
      return NextResponse.json(
        { error: "Payment entry is only allowed for normal customers." },
        { status: 400 }
      );
    }

    const branchName = customer.companyName;
    let updatedBalance = customer.leftOverBalance || 0;

    if (Number(debitAmount) > 0) {
      updatedBalance += Number(debitAmount);
    } else if (Number(creditAmount) > 0) {
      updatedBalance -= Number(creditAmount);
    } else {
      switch (receiptType?.toUpperCase().trim()) {
        case "RETURN":
        case "GENERAL ENTRY":
        case "OTHER":
        case "TDS":
          updatedBalance -= Number(amount);
          break;
        case "BAD DEBTS":
        default:
          updatedBalance += Number(amount);
          break;
      }
    }

    customer.leftOverBalance = updatedBalance;
    await customer.save();

    const openingBalance = customer.leftOverBalance;
    const closingBalance = updatedBalance;

    const lastPayment = await PaymentEntry.findOne({}, { receiptNo: 1 })
      .sort({ receiptNo: -1 })
      .lean();
    const nextReceiptNo = lastPayment
      ? Number(lastPayment.receiptNo) + 1
      : 1000;

    const payment = await PaymentEntry.create({
      accountCode: accountCode.toUpperCase(),
      customerName,
      branchCode,
      branchName,
      amount: Number(amount),
      mode,
      chequeNo,
      bankName,
      receiptType,
      debitAmount: Number(debitAmount) || 0,
      creditAmount: Number(creditAmount) || 0,
      debitNo,
      creditNo,
      receiptNo: nextReceiptNo.toString(),
      date: parseDDMMYYYY(date) || new Date(),
      remarks,
      verifyRemarks,
      openingBalance,
      closingBalance,
      verified: "No",
      entryUser,
    });

    return NextResponse.json(
      { message: "Payment saved successfully", payment, customer },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error saving payment:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { receiptNo, isVerified, verifyRemarks, entryUser, ...updateData } =
      body;

    if (!receiptNo) {
      return NextResponse.json(
        { error: "receiptNo is required to update payment" },
        { status: 400 }
      );
    }

    const payment = await PaymentEntry.findOne({ receiptNo });
    if (!payment)
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    if (updateData.date) {
      updateData.date = parseDDMMYYYY(updateData.date);
    }

    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined) payment[key] = updateData[key];
    });

    if (isVerified && verifyRemarks?.trim()) {
      payment.verified = "Yes";
      payment.verifiedBy = entryUser;
      payment.verifyRemarks = verifyRemarks;
    } else {
      payment.verified = "No";
      payment.verifiedBy = null;
    }

    await payment.save();

    return NextResponse.json(
      { message: "Payment updated successfully", payment },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating payment:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
