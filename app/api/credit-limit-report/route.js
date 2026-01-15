// app/api/reports/credit-limit-report/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// Import existing schemas
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import PaymentEntry from "@/app/model/PaymentEntry";

export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get('accountCode');
    const customerName = searchParams.get('customerName');

    // Build filter for customers
    let customerFilter = {};
    if (accountCode && accountCode.trim() !== '') {
      customerFilter.accountCode = { $regex: accountCode.trim(), $options: 'i' };
    }
    if (customerName && customerName.trim() !== '') {
      customerFilter.name = { $regex: customerName.trim(), $options: 'i' };
    }

    // Get all customer accounts with proper field selection
    const customers = await CustomerAccount.find(customerFilter).lean();

    if (!customers || customers.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        totalRecords: 0,
        grandTotal: "0.00"
      });
    }

    // Get aggregated data for each customer
    const reportData = await Promise.all(
      customers.map(async (customer) => {
        try {
          // Get total sales from shipments - sum of all totalAmt for this accountCode
          const shipmentAgg = await Shipment.aggregate([
            { $match: { accountCode: customer.accountCode } },
            {
              $group: {
                _id: null,
                totalSale: { $sum: "$totalAmt" }
              }
            }
          ]);
          
          const totalSale = shipmentAgg.length > 0 ? (shipmentAgg[0].totalSale || 0) : 0;

          // Get payment entry aggregations
          const paymentAgg = await PaymentEntry.aggregate([
            { $match: { customerCode: customer.accountCode } },
            {
              $group: {
                _id: null,
                totalReceipt: { $sum: "$amount" },
                totalDebit: { $sum: "$debitAmount" },
                totalCredit: { $sum: "$creditAmount" }
              }
            }
          ]);

          const paymentData = paymentAgg.length > 0 ? paymentAgg[0] : {
            totalReceipt: 0,
            totalDebit: 0,
            totalCredit: 0
          };

          // Convert strings to numbers safely - all from customer account
          const creditLimit = parseFloat(customer.creditLimit || "0") || 0;
          const leftOverBalance = parseFloat(customer.leftOverBalance || "0") || 0;
          const openingBalance = parseFloat(customer.openingBalance || "0") || 0;
          
          // Calculate credit balance (creditLimit - leftOverBalance)
          const creditBalance = creditLimit - leftOverBalance;

          return {
            // All these fields are fetched from CustomerAccount
            accountCode: customer.accountCode || "",
            name: customer.name || "",
            companyCode: customer.companyCode || "",
            branch: customer.branch || "",
            salesPersonName: customer.salesPersonName || "",
            referenceBy: customer.referenceBy || "",
            collectionBy: customer.collectionBy || "",
            accountManager: customer.accountManager || "",
            reportPerson: customer.reportPerson || "",
            paymentTerms: customer.paymentTerms || "",
            billingCycle: "", // Leave empty as requested
            openingBalance: openingBalance.toFixed(2),
            creditLimit: creditLimit.toFixed(2),
            
            // This is fetched from Shipment - sum of all totalAmt for same accountCode
            totalAmt: totalSale || 0,
            
            // These are fetched from PaymentEntry
            amount: paymentData.totalReceipt || 0, // Total receipt from payment entries
            debitAmount: paymentData.totalDebit || 0,
            creditAmount: paymentData.totalCredit || 0,
            
            // These are calculated
            leftOverBalance: leftOverBalance, // Total Outstanding from customer account
            creditBalance: creditBalance.toFixed(2), // Calculated: creditLimit - leftOverBalance
            
            // These are from CustomerAccount
            groupCode: customer.groupCode || "", // Using groupCode from customer account (not parentCode)
            currency: customer.currency || "",
          };
        } catch (customerError) {
          console.error(`Error processing customer ${customer.accountCode}:`, customerError);
          
          // Return customer data with zero values if aggregation fails
          const creditLimit = parseFloat(customer.creditLimit || "0") || 0;
          const leftOverBalance = parseFloat(customer.leftOverBalance || "0") || 0;
          const openingBalance = parseFloat(customer.openingBalance || "0") || 0;
          const creditBalance = creditLimit - leftOverBalance;

          return {
            // All from CustomerAccount
            accountCode: customer.accountCode || "",
            name: customer.name || "",
            companyCode: customer.companyCode || "",
            branch: customer.branch || "",
            salesPersonName: customer.salesPersonName || "",
            referenceBy: customer.referenceBy || "",
            collectionBy: customer.collectionBy || "",
            accountManager: customer.accountManager || "",
            reportPerson: customer.reportPerson || "",
            paymentTerms: customer.paymentTerms || "",
            billingCycle: "",
            openingBalance: openingBalance.toFixed(2),
            creditLimit: creditLimit.toFixed(2),
            
            // Default values when aggregation fails
            totalAmt: 0,
            amount: 0,
            debitAmount: 0,
            creditAmount: 0,
            leftOverBalance: leftOverBalance,
            creditBalance: creditBalance.toFixed(2),
            groupCode: customer.groupCode || "",
            currency: customer.currency || "",
          };
        }
      })
    );

    // Calculate totals
    const totalRecords = reportData.length;
    
    // Grand total is sum of all totalAmt (total sales)
    const grandTotal = reportData.reduce((sum, record) => {
      return sum + (parseFloat(record.totalAmt) || 0);
    }, 0);

    return NextResponse.json({
      success: true,
      data: reportData,
      totalRecords,
      grandTotal: grandTotal.toFixed(2)
    });

  } catch (error) {
    console.error("Error fetching credit limit report:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch credit limit report",
        message: error.message 
      },
      { status: 500 }
    );
  }
}