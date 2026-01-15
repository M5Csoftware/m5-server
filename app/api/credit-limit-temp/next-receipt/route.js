// /credit-limit-temp/next-receipt/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CreditLimitTemp from "@/app/model/CreditLimitTemp";

export async function GET() {
  try {
    await connectDB();

    // Find the last record sorted by receiptNo descending
    const lastRecord = await CreditLimitTemp.findOne({})
      .sort({ receiptNo: -1 })
      .select("receiptNo");

    let nextReceipt = 5000; // start from 1000 if no records

    if (lastRecord && lastRecord.receiptNo) {
      nextReceipt = Number(lastRecord.receiptNo) + 1;
    }

    return NextResponse.json({ nextReceipt }, { status: 200 });
  } catch (error) {
    console.error("Error fetching next receipt:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
