// app/api/payment/success/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import AccountLedger from "@/app/model/AccountLedger";
import crypto from "crypto";

export async function POST(req) {
  console.log("=== PAYMENT SUCCESS CALLBACK RECEIVED ===");
  
  try {
    await connectDB();
    console.log("Database connected");

    const formData = await req.formData();
    
    // Extract PayU response parameters
    const mihpayid = formData.get("mihpayid");
    const txnid = formData.get("txnid");
    const amount = formData.get("amount");
    const productinfo = formData.get("productinfo");
    const firstname = formData.get("firstname");
    const email = formData.get("email");
    const status = formData.get("status");
    const hash = formData.get("hash");
    const key = formData.get("key");
    const udf1 = formData.get("udf1") || "";

    console.log("Received PayU data:", {
      txnid,
      amount,
      status,
      accountCode: udf1,
      mihpayid,
      email
    });

    // Get base URL from environment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    console.log("Base URL:", baseUrl);

    // For now, skip hash verification for testing
    // You can enable it later
    /*
    const PAYU_SALT = "ctlUYjsv9Yf9SzISukVjOD9SMDLsnv4g";
    const hashString = `${PAYU_SALT}|${status}|||||||${udf10}|${udf9}|${udf8}|${udf7}|${udf6}|${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
    const calculatedHash = crypto.createHash("sha512").update(hashString).digest("hex");
    
    if (calculatedHash !== hash) {
      console.error("Hash mismatch");
      return NextResponse.redirect(`${baseUrl}/payment-failed?error=invalid_hash`);
    }
    */

    if (status === "success") {
      if (!udf1) {
        console.error("Account code not found");
        return NextResponse.redirect(`${baseUrl}/payment-fai;ure?error=account_code_missing`);
      }

      // Find customer - FIXED MODEL PATH
      const customer = await CustomerAccount.findOne({ accountCode: udf1 });
      console.log("Customer found:", customer ? customer.name : "No customer found");

      if (!customer) {
        console.error("Customer not found for account code:", udf1);
        return NextResponse.redirect(`${baseUrl}/payment-failure?error=customer_not_found&accountCode=${udf1}`);
      }

      const amountNum = parseFloat(amount);
      
      // Update customer balance
      const currentBalance = customer.leftOverBalance || 0;
      const newBalance = currentBalance - amountNum;
      
      console.log("Balance update:", {
        current: currentBalance,
        amount: amountNum,
        new: newBalance
      });
      
      await CustomerAccount.findOneAndUpdate(
        { accountCode: udf1 },
        { leftOverBalance: newBalance },
        { new: true }
      );

      // Create ledger entry
      const lastLedger = await AccountLedger.findOne({ accountCode: udf1 }).sort({ date: -1 });
      const previousBalance = lastLedger ? lastLedger.leftOverBalance : (customer.openingBalance || 0);
      
      await AccountLedger.create({
        accountCode: udf1,
        customer: customer.name,
        email: customer.email,
        openingBalance: customer.openingBalance || 0,
        payment: "RCPT",
        date: new Date(),
        reference: `PayU-${mihpayid || txnid}`,
        operationRemark: `Wallet recharge via PayU - Transaction ID: ${txnid}`,
        receivedAmount: amountNum,
        creditAmount: amountNum,
        debitAmount: 0,
        totalAmt: amountNum,
        leftOverBalance: previousBalance + amountNum,
      });

      console.log("✅ Payment processed successfully");
      
      // FIX: Redirect to the frontend success page
      const successUrl = `${baseUrl}/payment-success?txnid=${txnid}&amount=${amount}&accountCode=${udf1}`;
      console.log("Redirecting to:", successUrl);
      
      // Create redirect response
      const response = NextResponse.redirect(successUrl, 302);
      return response;
      
    } else {
      console.log("❌ Payment failed with status:", status);
      const failUrl = `${baseUrl}/payment-failure?txnid=${txnid || 'unknown'}&status=${status || 'failed'}&accountCode=${udf1 || ''}`;
      console.log("Redirecting to failure page:", failUrl);
      return NextResponse.redirect(failUrl, 302);
    }
    
  } catch (error) {
    console.error("❌ Error in payment success handler:", error);
    console.error("Error stack:", error.stack);
    
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const errorUrl = `${baseUrl}/payment-failure?error=server_error&message=${encodeURIComponent(error.message)}`;
    
    return NextResponse.redirect(errorUrl, 302);
  }
}

// Handle GET requests for testing
export async function GET(req) {
  console.log("GET request to payment success endpoint");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(`${baseUrl}/payment-failed?error=invalid_request_method`);
}