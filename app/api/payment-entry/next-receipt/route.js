import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import PaymentEntry from "@/app/model/PaymentEntry";

export async function GET() {
  try {
    await connectDB();

    // Find the last payment entry sorted by receiptNo
    const lastPayment = await PaymentEntry.findOne({})
      .sort({ receiptNo: -1 }) // descending
      .select("receiptNo");

    let nextReceipt = 1000; // start from 1000

    if (lastPayment && lastPayment.receiptNo) {
      nextReceipt = Number(lastPayment.receiptNo) + 1;
    }

    return NextResponse.json({ nextReceipt }, { status: 200 });
  } catch (error) {
    console.error("Error fetching next receipt:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
