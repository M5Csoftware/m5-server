// app/api/payment/failure/route.js
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const formData = await req.formData();
    
    const txnid = formData.get("txnid");
    const status = formData.get("status");
    const error = formData.get("error");
    const error_Message = formData.get("error_Message");
    const udf1 = formData.get("udf1") || "";

    console.log("Payment failed:", {
      txnid,
      status,
      error,
      error_Message,
      accountCode: udf1
    });

    // Get base URL from environment - works for both local and production
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    
    const redirectUrl = `${baseUrl}/payment-failure?txnid=${encodeURIComponent(txnid || 'unknown')}&status=${encodeURIComponent(status || 'failed')}&error=${encodeURIComponent(error || 'payment_failed')}&message=${encodeURIComponent(error_Message || 'Payment failed')}&accountCode=${encodeURIComponent(udf1)}`;
    
    console.log("Redirecting to:", redirectUrl);
    
    return NextResponse.redirect(redirectUrl, 302);
  } catch (error) {
    console.error("Payment failure handler error:", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUrl = `${baseUrl}/payment-failure?error=server_error&message=${encodeURIComponent(error.message)}`;
    console.log("Redirecting to:", redirectUrl);
    return NextResponse.redirect(redirectUrl, 302);
  }
}

// Handle GET requests
export async function GET(req) {
  console.log("GET request to /api/payment/failure");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(`${baseUrl}/payment-failure?error=invalid_request`, 302);
}