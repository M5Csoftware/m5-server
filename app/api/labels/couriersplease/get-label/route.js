import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import axios from "axios";

const CP_LABEL_URL = "https://api-test.couriersplease.com.au/v1/domestic/shipment/label";
const CP_ACCOUNT_NUMBER = process.env.CP_ACCOUNT_NUMBER;
const CP_TOKEN = process.env.CP_TOKEN;

// Exponential backoff helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchLabelWithRetry(consignmentNumber, headers, maxRetries = 3) {
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const fullUrl = `${CP_LABEL_URL}?consignmentNumber=${consignmentNumber}`;
      console.log(`🌐 GET (Attempt ${attempt + 1}/${maxRetries}):`, fullUrl);

      const response = await axios.get(fullUrl, {
        headers,
        timeout: 30000,
        validateStatus: (status) => true,
      });

      console.log(`📊 Response Status: ${response.status}`);

      // Success case
      if (response.status === 200 && response.data?.responseCode === "SUCCESS") {
        return { success: true, data: response.data, status: 200 };
      }

      // Rate limit - don't retry immediately, return to user
      if (response.status === 429) {
        const retryAfter = response.headers['retry-after'] || 60;
        console.log(`⚠️ Rate limit hit. Retry after: ${retryAfter}s`);
        
        return {
          success: false,
          status: 429,
          retryAfter: parseInt(retryAfter),
          message: "Rate limit exceeded",
          data: response.data
        };
      }

      // Not found - might not be ready yet
      if (response.status === 404) {
        console.log(`⚠️ Label not found (attempt ${attempt + 1}/${maxRetries})`);
        
        // Only retry 404 if not the last attempt
        if (attempt < maxRetries - 1) {
          const waitTime = Math.min(10000 * (attempt + 1), 30000); // 10s, 20s, 30s
          console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
          await sleep(waitTime);
          continue;
        }
        
        return {
          success: false,
          status: 404,
          message: "Label not ready yet",
          suggestion: "The shipment was just created. Please wait 30-60 seconds and try again."
        };
      }

      // Auth error
      if (response.status === 401) {
        return {
          success: false,
          status: 401,
          message: "Authentication failed"
        };
      }

      // Other errors
      lastError = {
        success: false,
        status: response.status,
        message: response.data?.msg || `API error: ${response.status}`,
        data: response.data
      };

      // Don't retry on client errors (4xx except 404, 429)
      if (response.status >= 400 && response.status < 500 && 
          response.status !== 404 && response.status !== 429) {
        return lastError;
      }

      // Exponential backoff for server errors (5xx)
      if (attempt < maxRetries - 1 && response.status >= 500) {
        const waitTime = Math.min(5000 * Math.pow(2, attempt), 30000);
        console.log(`⏳ Server error, waiting ${waitTime/1000}s before retry...`);
        await sleep(waitTime);
      }

    } catch (error) {
      console.error(`💥 Request error (attempt ${attempt + 1}):`, error.message);
      lastError = {
        success: false,
        status: 500,
        message: error.message
      };

      // Retry on network errors
      if (attempt < maxRetries - 1) {
        const waitTime = Math.min(5000 * Math.pow(2, attempt), 30000);
        console.log(`⏳ Network error, waiting ${waitTime/1000}s before retry...`);
        await sleep(waitTime);
      }
    }
  }

  return lastError || {
    success: false,
    status: 500,
    message: "Failed after all retries"
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const consignmentNumber = searchParams.get("consignmentNumber");
    const awbNo = searchParams.get("awbNo");

    if (!consignmentNumber && !awbNo) {
      return NextResponse.json(
        { 
          success: false, 
          message: "Either consignmentNumber or awbNo is required" 
        },
        { status: 400 }
      );
    }

    // Validate credentials
    if (!CP_ACCOUNT_NUMBER || !CP_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          message: "CouriersPlease API credentials not configured"
        },
        { status: 500 }
      );
    }

    await connectDB();

    let finalConsignmentNumber = consignmentNumber;

    // If AWB provided, look up consignment number
    if (!finalConsignmentNumber && awbNo) {
      const shipment = await Shipment.findOne({ awbNo });
      
      if (!shipment) {
        return NextResponse.json(
          { success: false, message: "Shipment not found" },
          { status: 404 }
        );
      }

      finalConsignmentNumber = shipment.cpConsignmentNumber || shipment.forwardingNo;

      if (!finalConsignmentNumber) {
        return NextResponse.json(
          { 
            success: false, 
            message: "No consignment number found for this AWB. Please create the shipment first." 
          },
          { status: 400 }
        );
      }
    }

    console.log(`\n🏷️ FETCHING LABEL FOR CONSIGNMENT: ${finalConsignmentNumber}`);

    // Create Basic Auth header
    const authString = Buffer.from(`${CP_ACCOUNT_NUMBER}:${CP_TOKEN}`).toString("base64");
    const headers = {
      Authorization: `Basic ${authString}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // Fetch label with retry logic
    const result = await fetchLabelWithRetry(finalConsignmentNumber, headers);

    // Handle rate limiting
    if (result.status === 429) {
      return NextResponse.json(
        {
          success: false,
          message: "⚠️ Rate limit exceeded. Too many requests to CouriersPlease API.",
          status: 429,
          suggestion: `Please wait ${result.retryAfter} seconds before trying again`,
          retryAfter: result.retryAfter,
          consignmentNumber: finalConsignmentNumber
        },
        { status: 429 }
      );
    }

    // Handle not found
    if (result.status === 404) {
      return NextResponse.json(
        {
          success: false,
          message: "Label not ready yet",
          status: 404,
          suggestion: result.suggestion,
          consignmentNumber: finalConsignmentNumber
        },
        { status: 404 }
      );
    }

    // Handle auth failure
    if (result.status === 401) {
      return NextResponse.json(
        {
          success: false,
          message: "Authentication failed",
          status: 401
        },
        { status: 401 }
      );
    }

    // Handle success
    if (result.success && result.data?.data?.label) {
      console.log("✅ Label retrieved successfully");

      // Convert Base64 to data URL
      const base64ToDataUrl = (base64String) => {
        if (!base64String) return null;
        return `data:application/pdf;base64,${base64String}`;
      };

      const mainLabel = {
        type: "main",
        labelUrl: base64ToDataUrl(result.data.data.label),
        dpdNumber: finalConsignmentNumber,
        consignmentNumber: finalConsignmentNumber,
        success: true,
        timestamp: new Date().toISOString()
      };

      // Update database if AWB was provided
      if (awbNo) {
        await Shipment.updateOne(
          { awbNo },
          {
            $set: {
              labelGeneratedAt: new Date(),
              labelStatus: "generated"
            }
          }
        );
        console.log("💾 Database updated");
      }

      return NextResponse.json({
        success: true,
        message: "Label retrieved successfully",
        labels: [mainLabel],
        consignmentNumber: finalConsignmentNumber,
        timestamp: new Date().toISOString()
      });
    }

    // Handle other failures
    return NextResponse.json(
      {
        success: false,
        message: result.message || "Failed to retrieve label",
        status: result.status || 500,
        consignmentNumber: finalConsignmentNumber
      },
      { status: result.status || 500 }
    );

  } catch (error) {
    console.error("💥 Get label error:", error.message);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        error: error.message
      },
      { status: 500 }
    );
  }
}