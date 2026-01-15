// app/api/payment-receipt/route.js (Next.js App Router)
import PaymentEntry from "@/app/model/PaymentEntry";
import connectDB from "@/app/lib/db";
import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const branchCode = searchParams.get('branch');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');

    if (!branchCode) {
      return NextResponse.json({ 
        success: false, 
        error: 'Branch code is required' 
      }, { status: 400 });
    }

    // Build query object
    let query = { branchCode };

    // If date range is provided, filter by that range
    if (fromDate && toDate) {
      const startDate = new Date(fromDate);
      const endDate = new Date(toDate);
      endDate.setDate(endDate.getDate() + 1); // Include the end date
      
      query.date = {
        $gte: startDate,
        $lt: endDate
      };
    } else if (fromDate) {
      // If only fromDate is provided
      const startDate = new Date(fromDate);
      query.date = { $gte: startDate };
    } else if (toDate) {
      // If only toDate is provided
      const endDate = new Date(toDate);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $lt: endDate };
    }

    // Fetch payment entries
    const paymentEntries = await PaymentEntry.find(query)
      .select('branchCode mode amount bankName receiptType debitAmount creditAmount date customerName receiptNo')
      .sort({ date: -1 })
      .lean();

    // Group data by mode and calculate totals for summary
    const summaryData = {};
    let totalAmount = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    paymentEntries.forEach(entry => {
      const key = `${entry.branchCode}_${entry.mode}_${entry.receiptType}`;
      
      if (!summaryData[key]) {
        summaryData[key] = {
          branchCode: entry.branchCode,
          mode: entry.mode,
          receiptType: entry.receiptType || '-',
          cash: 0,
          debitAmount: 0,
          creditAmount: 0,
          return: 0,
          count: 0
        };
      }

      // Add amounts based on mode
      if (entry.mode === 'Cash') {
        summaryData[key].cash += entry.amount || 0;
      }
      
      summaryData[key].debitAmount += entry.debitAmount || 0;
      summaryData[key].creditAmount += entry.creditAmount || 0;
      summaryData[key].count += 1;

      // Add to totals
      totalAmount += entry.amount || 0;
      totalDebit += entry.debitAmount || 0;
      totalCredit += entry.creditAmount || 0;
    });

    // Convert summary data to array
    const summaryArray = Object.values(summaryData);

    return NextResponse.json({
      success: true,
      data: summaryArray,
      rawData: paymentEntries,
      totals: {
        totalAmount,
        totalDebit,
        totalCredit,
        totalRecords: paymentEntries.length
      },
      count: summaryArray.length
    });

  } catch (error) {
    console.error('Payment Receipt API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}