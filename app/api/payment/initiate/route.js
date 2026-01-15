// // app/api/payment/initiate/route.js
// import { NextResponse } from "next/server";
// import connectDB from "@/app/lib/db";
// import CustomerAccount from "@/app/model/CustomerAccount";
// import crypto from "crypto";

// export async function POST(req) {
//   try {
//     await connectDB();

//     const body = await req.json();
//     console.log("Received payment initiation request:", body);

//     const { amount, accountCode } = body;

//     // Validate input
//     if (!amount) {
//       console.error("Amount is missing");
//       return NextResponse.json(
//         { error: "Amount is required" },
//         { status: 400 }
//       );
//     }

//     if (!accountCode) {
//       console.error("Account code is missing");
//       return NextResponse.json(
//         { error: "Account code is required" },
//         { status: 400 }
//       );
//     }

//     // Validate amount
//     const numAmount = parseFloat(amount);
//     if (isNaN(numAmount) || numAmount <= 0) {
//       return NextResponse.json(
//         { error: "Invalid amount" },
//         { status: 400 }
//       );
//     }

//     // Fetch customer details
//     console.log("Fetching customer with accountCode:", accountCode);
//     const customer = await CustomerAccount.findOne({ accountCode });

//     if (!customer) {
//       console.error("Customer not found with accountCode:", accountCode);
//       return NextResponse.json(
//         { error: "Customer not found" },
//         { status: 404 }
//       );
//     }

//     console.log("Customer found:", customer.name, customer.accountCode);

//     // PayU credentials
//     const PAYU_MERCHANT_KEY = "WyLolx";
//     const PAYU_SALT = "ctlUYjsv9Yf9SzISukVjOD9SMDLsnv4g";

//     // Generate transaction ID
//     const txnid = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

//     // Prepare PayU parameters
//     const productinfo = "Wallet Recharge";
//     const firstname = customer.name || customer.contactPerson || "Customer";
//     const email = customer.email || customer.billingEmailId || "customer@example.com";
//     const phone = customer.telNo || "9999999999";
    
//     // Get the base URL from environment or construct it
//     const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
//                     (req.headers.get('host') ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host')}` : 'http://localhost:3000');
    
//     const surl = `${baseUrl}/api/payment/success`;
//     const furl = `${baseUrl}/api/payment/failure`;

//     console.log("Payment URLs:", { surl, furl });

//     // Generate hash
//     // Hash formula: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
//     const hashString = `${PAYU_MERCHANT_KEY}|${txnid}|${numAmount}|${productinfo}|${firstname}|${email}|${accountCode}||||||||||${PAYU_SALT}`;
//     const hash = crypto.createHash("sha512").update(hashString).digest("hex");

//     console.log("Payment initiated successfully. TxnID:", txnid);

//     // Return payment details
//     return NextResponse.json({
//       success: true,
//       paymentData: {
//         key: PAYU_MERCHANT_KEY,
//         txnid,
//         amount: numAmount,
//         productinfo,
//         firstname,
//         email,
//         phone,
//         surl,
//         furl,
//         hash,
//         accountCode,
//         // PayU payment gateway URL
//         payuUrl: "https://test.payu.in/_payment", // Use "https://secure.payu.in/_payment" for production
//       },
//       checkoutData: {
//         orderId: txnid,
//         amount: numAmount,
//         billingName: customer.name || "Customer",
//         billingAddress: customer.addressLine1 || "Address not provided",
//         billingCity: customer.city || "City",
//         billingState: customer.state || "State",
//         billingZip: customer.pinCode || "000000",
//         billingCountry: customer.country || "India",
//         billingTel: customer.telNo || "0000000000",
//         billingEmail: email,
//         customerId: customer.accountCode,
//         customerName: customer.name || "Customer",
//       },
//     });
//   } catch (error) {
//     console.error("Payment initiation error:", error);
//     return NextResponse.json(
//       { error: "Failed to initiate payment", details: error.message },
//       { status: 500 }
//     );
//   }
// }

// app/api/payment/initiate/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import crypto from "crypto";

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    console.log("Received payment initiation request:", body);

    const { amount, accountCode } = body;

    // Validate input
    if (!amount) {
      console.error("Amount is missing");
      return NextResponse.json(
        { error: "Amount is required" },
        { status: 400 }
      );
    }

    if (!accountCode) {
      console.error("Account code is missing");
      return NextResponse.json(
        { error: "Account code is required" },
        { status: 400 }
      );
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount" },
        { status: 400 }
      );
    }

    // Fetch customer details
    console.log("Fetching customer with accountCode:", accountCode);
    const customer = await CustomerAccount.findOne({ accountCode });

    if (!customer) {
      console.error("Customer not found with accountCode:", accountCode);
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    console.log("Customer found:", customer.name, customer.accountCode);

    // PayU credentials from environment variables
    const PAYU_MERCHANT_KEY = process.env.PAYU_MERCHANT_KEY;
    const PAYU_SALT = process.env.PAYU_SALT;
    const IS_PRODUCTION = process.env.NODE_ENV === "production";

    if (!PAYU_MERCHANT_KEY || !PAYU_SALT) {
      console.error("PayU credentials not configured");
      return NextResponse.json(
        { error: "Payment gateway not configured" },
        { status: 500 }
      );
    }

    // Generate transaction ID
    const txnid = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare PayU parameters
    const productinfo = "Wallet Recharge";
    const firstname = customer.name || customer.contactPerson || "Customer";
    const email = customer.email || customer.billingEmailId || "customer@example.com";
    const phone = customer.telNo || "9999999999";
    
    // Get the base URL from environment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    (req.headers.get('host') ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host')}` : 'http://localhost:3000');
    
    const surl = `${baseUrl}/api/payment/success`;
    const furl = `${baseUrl}/api/payment/failure`;

    console.log("Payment URLs:", { surl, furl, baseUrl, isProduction: IS_PRODUCTION });

    // Generate hash
    // Hash formula: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
    const hashString = `${PAYU_MERCHANT_KEY}|${txnid}|${numAmount}|${productinfo}|${firstname}|${email}|${accountCode}||||||||||${PAYU_SALT}`;
    const hash = crypto.createHash("sha512").update(hashString).digest("hex");

    console.log("Payment initiated successfully. TxnID:", txnid);

    // PayU URL - use production or test based on environment
    const payuUrl = IS_PRODUCTION 
      ? "https://secure.payu.in/_payment" 
      : "https://test.payu.in/_payment";

    console.log("Using PayU URL:", payuUrl);

    // Return payment details
    return NextResponse.json({
      success: true,
      paymentData: {
        key: PAYU_MERCHANT_KEY,
        txnid,
        amount: numAmount,
        productinfo,
        firstname,
        email,
        phone,
        surl,
        furl,
        hash,
        accountCode,
        payuUrl,
      },
      checkoutData: {
        orderId: txnid,
        amount: numAmount,
        billingName: customer.name || "Customer",
        billingAddress: customer.addressLine1 || "Address not provided",
        billingCity: customer.city || "City",
        billingState: customer.state || "State",
        billingZip: customer.pinCode || "000000",
        billingCountry: customer.country || "India",
        billingTel: customer.telNo || "0000000000",
        billingEmail: email,
        customerId: customer.accountCode,
        customerName: customer.name || "Customer",
      },
    });
  } catch (error) {
    console.error("Payment initiation error:", error);
    return NextResponse.json(
      { error: "Failed to initiate payment", details: error.message },
      { status: 500 }
    );
  }
}