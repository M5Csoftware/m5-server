export const dynamic = "force-dynamic";
import connectDB from "@/app/lib/db";
import AccountLedger from "@/app/model/AccountLedger";
import { NextResponse } from "next/server";

const parseDDMMYYYY = (str) => {
  if (!str) return null;
  const [d, m, y] = str.split("/");
  if (!d || !m || !y) return null;
  return new Date(`${y}-${m}-${d}`);
};

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

const getSaleType = (payment) => {
  if (payment === "Credit" || payment === "" || !payment) return "Sale";
  if (RCPT_PAYMENTS.includes(payment)) return "RCPT";
  return payment; // show as-is (including "RTO")
};

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");
    const openingBalance = parseFloat(searchParams.get("openingBalance") || 0);

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Missing accountCode" },
        { status: 400 },
      );
    }

    // Build base query - fetch ALL shipments (including hold and RTO)
    const baseQuery = {
      accountCode,
      $or: [
        { payment: { $in: RCPT_PAYMENTS } },
        { payment: "Credit" },
        { payment: "RTO" },
        { payment: "" },
        { payment: { $exists: false } },
      ],
    };

    // Use aggregation to join with Shipments
    const entries = await AccountLedger.aggregate([
      {
        $match: baseQuery,
      },
      {
        $lookup: {
          from: "shipments",
          localField: "awbNo",
          foreignField: "awbNo",
          as: "shipmentDetails",
        },
      },
      {
        $addFields: {
          shipmentDetail: { $arrayElemAt: ["$shipmentDetails", 0] },
        },
      },
      {
        $sort: { date: 1 },
      },
    ]);

    let runningBalance = openingBalance;

    const mappedEntries = entries.map((e, idx) => {
      const RcvAmount =
        e.debitAmount > 0 || e.creditAmount > 0 ? 0 : e.receivedAmount;

      const SaleType = getSaleType(e.payment);

      const grandTotal = Number(e.totalAmt) || 0;
      const received = Number(RcvAmount) || 0;
      const credit = Number(e.creditAmount) || 0;
      const debit = Number(e.debitAmount) || 0;

      runningBalance += grandTotal + debit;
      runningBalance -= received + credit;

      return {
        SrNo: idx + 1,
        AwbNo: e.awbNo,
        SaleType,
        Date: e.date,
        code: e.accountCode,
        Consignee: e.receiverFullName || e.customer,
        Forwarder: e.forwarder,
        ForwarderNo: e.forwardingNo,
        RunNo: e.runNo,
        Sector: e.sector,
        Destination: e.destination,
        City: e.receiverCity,
        ZipCode: e.receiverPincode,
        Service: e.service,
        Pcs: e.pcs,
        ActualWeight: e.totalActualWt,
        VolWeight: e.totalVolWt,
        ChgWeight: e.shipmentDetail?.chargeableWt || e.chargeableWt || 0,
        SaleAmount: e.basicAmt,
        DiscountPerKg: e.discount,
        DiscountAmount: e.discountAmount,
        DiscountTotal: e.discountAmount,
        RateHike: e.hikeAmt,
        SGST: e.sgst,
        CGST: e.cgst,
        IGST: e.igst,
        Mischg: e.miscChg,
        Fuel: e.fuelAmt,
        NonTaxable: e.nonTaxable,
        GrandTotal: e.totalAmt,
        RcvAmount,
        DebitAmount: e.debitAmount,
        CreditAmount: e.creditAmount,
        Balance: e.totalAmt,
        Remark: e.operationRemark,
        ReferenceNo: e.reference,
        isHold: e.isHold || false,
        originalDate: e.date,
        RemainingBalance: runningBalance.toFixed(2),
        type: "ledger",
      };
    });

    return NextResponse.json({
      success: true,
      entries: mappedEntries,
      totalBalance: runningBalance.toFixed(2),
    });
  } catch (error) {
    console.error("Account ledger error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch account ledger" },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();

    if (body.date) {
      body.date = parseDDMMYYYY(body.date);
    }

    const newLedger = new AccountLedger(body);
    await newLedger.save();

    return NextResponse.json(
      {
        success: true,
        message: "Account Ledger entry created successfully",
        data: newLedger,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating AccountLedger:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create Account Ledger entry",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
