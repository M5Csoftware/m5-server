import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import PaymentEntry from "@/app/model/PaymentEntry";
import jwt from "jsonwebtoken";

async function getEntryUser(req) {
  try {
    // Try to read from frontend header first
    const userHeader = req.headers.get("user") || req.headers.get("User");
    if (userHeader) {
      try {
        const parsed = JSON.parse(userHeader);
        return parsed.userId || parsed.userName || "Unknown"; // <-- stores userId from localStorage
      } catch {
        console.warn("Invalid user header JSON, entryUser set as Unknown");
      }
    }

    // Fallback to JWT
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
    
    // Get individual receipt number query (existing functionality)
    const receiptNo = searchParams.get("receiptNo")?.trim();
    
    // If receiptNo is provided, return single payment (existing functionality)
    if (receiptNo) {
      console.log("Searching for receiptNo:", receiptNo);
      const payment = await PaymentEntry.findOne({ receiptNo });
      if (!payment) {
        return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
      }
      return NextResponse.json({ payment }, { status: 200 });
    }

    // Build filter query for multiple payments
    const filterQuery = {};
    
    // Date range filter
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    
    if (fromDate || toDate) {
      filterQuery.date = {};
      if (fromDate) {
        filterQuery.date.$gte = new Date(fromDate);
      }
      if (toDate) {
        // Add 23:59:59 to include the entire end date
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        filterQuery.date.$lte = endDate;
      }
    }

    // Other filters
    const mode = searchParams.get("mode");
    if (mode && mode.trim()) {
      filterQuery.mode = mode.trim();
    }

    const receiptType = searchParams.get("receiptType");
    if (receiptType && receiptType.trim()) {
      filterQuery.receiptType = receiptType.trim();
    }

    const branchCode = searchParams.get("branchCode");
    if (branchCode && branchCode.trim()) {
      filterQuery.branchCode = { $regex: branchCode.trim(), $options: 'i' };
    }

    const customerCode = searchParams.get("customerCode");
    if (customerCode && customerCode.trim()) {
      filterQuery.customerCode = { $regex: customerCode.trim().toUpperCase(), $options: 'i' };
    }

    const state = searchParams.get("state");
    // Note: State filter would need to be joined with customer data
    
    const withHoldAWB = searchParams.get("withHoldAWB");
    if (withHoldAWB === 'true') {
      // Add logic for withHoldAWB if this field exists in your schema
      // filterQuery.withHoldAWB = true;
    }

    console.log("Filter Query:", filterQuery);

    // Fetch payments with filters
    let payments = await PaymentEntry.find(filterQuery)
      .sort({ date: -1, receiptNo: -1 })
      .lean();

    // If state filter is provided, filter by customer state
    if (state && state.trim()) {
      const customerCodes = payments.map(p => p.customerCode);
      const customers = await CustomerAccount.find(
        { 
          accountCode: { $in: customerCodes },
          state: { $regex: state.trim(), $options: 'i' }
        }
      ).lean();
      
      const validCustomerCodes = customers.map(c => c.accountCode);
      payments = payments.filter(p => validCustomerCodes.includes(p.customerCode));
    }

    // Enhance payments with customer information (including sales person)
    const enhancedPayments = await Promise.all(
      payments.map(async (payment) => {
        try {
          const customer = await CustomerAccount.findOne({ 
            accountCode: payment.customerCode 
          }).lean();
          
          return {
            ...payment,
            salesPersonName: customer?.salesPersonName || "",
            customerState: customer?.state || "",
            customerCity: customer?.city || "",
            entryUser: payment.entryUser || "Unknown",
            verifiedBy: payment.verifiedBy || "",
          };
        } catch (error) {
          console.error(`Error fetching customer data for ${payment.customerCode}:`, error);
          return {
            ...payment,
            salesPersonName: "",
            customerState: "",
            customerCity: "",
            entryUser: payment.entryUser || "Unknown",
            verifiedBy: payment.verifiedBy || "",
          };
        }
      })
    );

    // Calculate totals
    const totals = enhancedPayments.reduce((acc, payment) => {
      acc.receiptAmount += Number(payment.amount) || 0;
      acc.debitAmount += Number(payment.debitAmount) || 0;
      acc.creditAmount += Number(payment.creditAmount) || 0;
      acc.count += 1;
      return acc;
    }, { receiptAmount: 0, debitAmount: 0, creditAmount: 0, count: 0 });

    return NextResponse.json({
      payments: enhancedPayments,
      totals,
      filters: {
        fromDate,
        toDate,
        mode,
        receiptType,
        branchCode,
        customerCode,
        state,
        withHoldAWB
      }
    }, { status: 200 });

  } catch (err) {
    console.error("Error fetching payments:", err);
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

    // ✅ Get user from request body
    // const entryUser = body.entryUser || "Unknown";
    // ✅ Get entryUser from body, else fallback to headers/JWT
const entryUser = body.entryUser || (await getEntryUser(req));


    const {
      customerCode,
      customerName,
      branchCode,
      branchName,
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

    if (!customerCode || isNaN(Number(amount)) || !mode) {
      return NextResponse.json(
        { error: "Customer code, valid amount, and mode are required" },
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

    // Find customer
    const customer = await CustomerAccount.findOne({
      accountCode: customerCode.toUpperCase(),
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

    const openingBalance = customer.leftOverBalance;
    const closingBalance = openingBalance + Number(amount);

    // Generate unique receipt number
    const lastPayment = await PaymentEntry.findOne({}, { receiptNo: 1 })
      .sort({ receiptNo: -1 })
      .lean();
    const nextReceiptNo = lastPayment
      ? Number(lastPayment.receiptNo) + 1
      : 1000;

    // Save Payment Entry
    const payment = await PaymentEntry.create({
      customerCode: customerCode.toUpperCase(),
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
      date: date ? new Date(date) : new Date(),
      remarks,
      verifyRemarks,
      openingBalance,
      closingBalance,
      verified: "No",
      entryUser, // ✅ saved from request body
    });

    // Update Customer balance
    customer.leftOverBalance = closingBalance;
    await customer.save();

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

    // Update other fields dynamically
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined) payment[key] = updateData[key];
    });

    // Verification logic
    if (isVerified && verifyRemarks?.trim()) {
      payment.verified = "Yes";
      payment.verifiedBy = entryUser; // ✅ from request body
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