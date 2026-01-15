// app/api/labels/couriersplease/create-label/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import axios from "axios";

// CouriersPlease API Configuration - TEST ENVIRONMENT
const CP_LABEL_URL = "https://api-test.couriersplease.com.au/v1/domestic/shipment/label";
const CP_VALIDATE_URL = "https://api-test.couriersplease.com.au/v1/domestic/shipment/validate";
const CP_CREATE_URL = "https://api-test.couriersplease.com.au/v1/domestic/shipment/create";
const CP_QUOTE_URL = "https://api-test.couriersplease.com.au/v1/domestic/quote";

// Get credentials from environment variables
const CP_ACCOUNT_NUMBER = process.env.CP_ACCOUNT_NUMBER;
const CP_TOKEN = process.env.CP_TOKEN;

console.log("CouriersPlease API Configuration:", {
  accountNumber: CP_ACCOUNT_NUMBER,
  tokenLength: CP_TOKEN ? CP_TOKEN.length : 0,
  isTestAccount: CP_ACCOUNT_NUMBER === "WD00000006",
  apiUrl: CP_CREATE_URL
});

// Helper function to format phone numbers for Australian domestic
const formatPhoneNumber = (phone) => {
  if (!phone) return "0000000000";
  
  // Remove all non-numeric characters
  let cleaned = String(phone).replace(/\D/g, '');
  
  // Remove country code if present (61)
  if (cleaned.startsWith('61')) {
    cleaned = '0' + cleaned.substring(2);
  }
  
  // Ensure it starts with 0
  if (!cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  
  return cleaned;
};

// Helper function to get rate card from Quote API
const getRateCard = async (shipment, headers) => {
  try {
    console.log("\n📊 FETCHING RATE CARD FROM QUOTE API...");
    
    // Prepare items for quote
    const items = [];
    if (shipment.boxes && shipment.boxes.length > 0) {
      shipment.boxes.forEach(box => {
        items.push({
          quantity: parseInt(box.pcs) || 1,
          length: parseInt(box.length) || 30,
          width: parseInt(box.width) || 30,
          height: parseInt(box.height) || 30,
          physicalWeight: parseFloat(box.actualWt) || 1.0
        });
      });
    } else {
      items.push({
        quantity: 1,
        length: 30,
        width: 30,
        height: 30,
        physicalWeight: parseFloat(shipment.totalActualWt) || 1.0
      });
    }

    const quotePayload = {
      fromSuburb: shipment.shipperCity || shipment.origin,
      fromPostcode: parseInt(shipment.shipperPincode) || 2150,
      toSuburb: shipment.receiverCity,
      toPostcode: parseInt(shipment.receiverPincode),
      items: items
    };

    console.log("Quote Request:", JSON.stringify(quotePayload, null, 2));

    const response = await axios.post(CP_QUOTE_URL, quotePayload, {
      headers,
      timeout: 30000,
      validateStatus: (status) => true,
    });

    console.log("Quote Response Status:", response.status);

    if (response.status === 200 && response.data?.responseCode === "SUCCESS") {
      const rates = response.data.data;
      if (rates && rates.length > 0) {
        // Return the first available rate card
        console.log(`✅ Rate Card Found: ${rates[0].RateCardCode}`);
        return rates[0].RateCardCode;
      }
    }

    console.error("❌ No rate card found in quote response");
    return null;
  } catch (error) {
    console.error("💥 Quote API Error:", error.message);
    return null;
  }
};

// Helper function to prepare domestic shipment data
const prepareDomesticShipmentData = (shipment, rateCardId) => {
  console.log("📦 Preparing DOMESTIC shipment data for:", shipment.awbNo);
  
  // Extract names
  const shipperNames = (shipment.shipperFullName || "John Doe").split(' ');
  const receiverNames = (shipment.receiverFullName || "Jane Smith").split(' ');
  
  // Format date as per API requirement: yyyy-MM-dd hh:mm tt
  const formatDateForCP = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  };

  // Prepare items array
  const items = [];
  if (shipment.boxes && shipment.boxes.length > 0) {
    shipment.boxes.forEach(box => {
      items.push({
        quantity: parseInt(box.pcs) || 1,
        length: parseInt(box.length) || 30,
        width: parseInt(box.width) || 30,
        height: parseInt(box.height) || 30,
        physicalWeight: parseFloat(box.actualWt) || 1.0
      });
    });
  } else {
    items.push({
      quantity: 1,
      length: 30,
      width: 30,
      height: 30,
      physicalWeight: parseFloat(shipment.totalActualWt) || 1.0
    });
  }
  
  // Validate total weight (max 25kg per item for domestic)
  const totalPhysicalWeight = items.reduce((sum, item) => {
    return sum + (item.physicalWeight * item.quantity);
  }, 0);
  
  console.log("📊 Weight validation:", {
    totalItems: items.length,
    totalPhysicalWeight: totalPhysicalWeight,
    isValid: totalPhysicalWeight >= 0.01 && totalPhysicalWeight <= 250
  });

  // Pickup date - tomorrow by default
  const pickupDate = shipment.pickupDate || new Date(Date.now() + 24 * 60 * 60 * 1000);

  const payload = {
    // Pickup details (Shipper)
    pickupDeliveryChoiceID: null,
    pickupFirstName: shipperNames[0] || "John",
    pickupLastName: shipperNames.slice(1).join(' ') || "Doe",
    pickupCompanyName: shipment.shipperCompanyName || "",
    pickupEmail: shipment.shipperEmail || "sender@example.com",
    pickupAddress1: shipment.shipperAddressLine1 || "123 Street",
    pickupAddress2: shipment.shipperAddressLine2 || "",
    pickupSuburb: shipment.shipperCity || shipment.origin,
    pickupPostcode: parseInt(shipment.shipperPincode) || 2150,
    pickupState: shipment.shipperState || "NSW",
    pickupPhone: formatPhoneNumber(shipment.shipperPhoneNumber),
    pickupIsBusiness: Boolean(shipment.shipperCompanyName),

    // Destination details (Receiver)
    destinationDeliveryChoiceID: null,
    destinationFirstName: receiverNames[0] || "Jane",
    destinationLastName: receiverNames.slice(1).join(' ') || "Smith",
    destinationCompanyName: shipment.receiverCompanyName || "",
    destinationEmail: shipment.receiverEmail || "receiver@example.com",
    destinationAddress1: shipment.receiverAddressLine1 || "456 Road",
    destinationAddress2: shipment.receiverAddressLine2 || "",
    destinationSuburb: shipment.receiverCity,
    destinationPostcode: parseInt(shipment.receiverPincode),
    destinationState: shipment.receiverState,
    destinationPhone: formatPhoneNumber(shipment.receiverPhoneNumber),
    destinationIsBusiness: Boolean(shipment.receiverCompanyName || shipment.receiverIsBusiness),

    // Contact details (same as pickup for domestic)
    contactFirstName: shipperNames[0] || "John",
    contactLastName: shipperNames.slice(1).join(' ') || "Doe",
    contactCompanyName: shipment.shipperCompanyName || "",
    contactEmail: shipment.shipperEmail || "sender@example.com",
    contactAddress1: shipment.shipperAddressLine1 || "123 Street",
    contactAddress2: shipment.shipperAddressLine2 || "",
    contactSuburb: shipment.shipperCity || shipment.origin,
    contactPostcode: parseInt(shipment.shipperPincode) || 2150,
    contactState: shipment.shipperState || "NSW",
    contactPhone: formatPhoneNumber(shipment.shipperPhoneNumber),
    contactIsBusiness: Boolean(shipment.shipperCompanyName),

    // Shipment details
    items: items,
    rateCardId: rateCardId,
    readyDateTime: formatDateForCP(pickupDate),
    specialInstruction: shipment.operationRemark || "",
    referenceNumber: shipment.awbNo || "",
    termsAccepted: true,
    dangerousGoods: false,
    isATL: false // Signature required by default
  };

  console.log("✅ DOMESTIC Payload prepared successfully");
  return payload;
};

export async function POST(request) {
  try {
    // Validate credentials first
    if (!CP_ACCOUNT_NUMBER || !CP_TOKEN) {
      console.error("❌ Missing credentials");
      return NextResponse.json(
        {
          success: false,
          message: "CouriersPlease API credentials not configured",
          details: "Please set CP_ACCOUNT_NUMBER and CP_TOKEN in environment variables"
        },
        { status: 500 }
      );
    }

    await connectDB();

    const body = await request.json();
    const { awbNo } = body;

    console.log("\n" + "=".repeat(60));
    console.log("📦 CREATING DOMESTIC LABEL FOR AWB:", awbNo);
    console.log("=".repeat(60));

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400 }
      );
    }

    // Find shipment
    const shipment = await Shipment.findOne({ awbNo });

    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "Shipment not found" },
        { status: 404 }
      );
    }

    console.log("✅ Shipment found:", {
      awbNo: shipment.awbNo,
      sector: shipment.sector,
      origin: shipment.shipperCity,
      destination: shipment.receiverCity,
      type: "Domestic"
    });

    // Validate this is a domestic shipment
    if (shipment.sector !== "Domestic" || shipment.shipperCountry !== "AU" || shipment.receiverCountry !== "AU") {
      return NextResponse.json(
        {
          success: false,
          message: "This endpoint is for domestic Australian shipments only. Use international endpoint for other shipments."
        },
        { status: 400 }
      );
    }

    // Check if shipment is on hold
    if (shipment.isHold) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot create label. Shipment is on hold. Reason: ${
            shipment.holdReason || "Not specified"
          }`,
        },
        { status: 400 }
      );
    }

    // Create Basic Auth header
    const authString = Buffer.from(`${CP_ACCOUNT_NUMBER}:${CP_TOKEN}`).toString("base64");
    const headers = {
      Authorization: `Basic ${authString}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // Check if shipment already exists in CP system
    let consignmentNumber = shipment.cpConsignmentNumber || shipment.forwardingNo;
    
    if (consignmentNumber && consignmentNumber.includes(",")) {
      consignmentNumber = consignmentNumber.split(",")[0].trim();
    }

    if (!consignmentNumber) {
      console.log("\n🚀 CREATING DOMESTIC SHIPMENT IN COURIERSPLEASE...");
      
      // Step 1: Get rate card from Quote API
      const rateCardId = await getRateCard(shipment, headers);
      
      if (!rateCardId) {
        return NextResponse.json(
          {
            success: false,
            message: "Failed to get rate card. Please verify suburbs and postcodes are correct.",
            suggestion: "Use the Quote API to check available rates for this route."
          },
          { status: 400 }
        );
      }
      
      // Prepare shipment data
      const shipmentData = prepareDomesticShipmentData(shipment, rateCardId);
      
      console.log("\n📋 SHIPMENT SUMMARY:");
      console.log("  Type: DOMESTIC");
      console.log("  Rate Card:", shipmentData.rateCardId);
      console.log("  Pickup:", `${shipmentData.pickupSuburb}, ${shipmentData.pickupState} ${shipmentData.pickupPostcode}`);
      console.log("  Delivery:", `${shipmentData.destinationSuburb}, ${shipmentData.destinationState} ${shipmentData.destinationPostcode}`);
      console.log("  Items:", shipmentData.items.length);
      
      // Log full payload for debugging
      console.log("\n📄 FULL PAYLOAD:");
      console.log(JSON.stringify(shipmentData, null, 2));

      // Step 2: Create the shipment (no validation step for domestic)
      console.log("\n🚀 CREATING DOMESTIC SHIPMENT...");
      try {
        const createResponse = await axios.post(CP_CREATE_URL, shipmentData, {
          headers,
          timeout: 30000,
          validateStatus: (status) => true,
        });

        console.log("📊 Create Status:", createResponse.status);

        if (createResponse.status === 404) {
          console.error("❌ 404 - Endpoint not found");
          return NextResponse.json(
            {
              success: false,
              message: "Shipment creation failed - endpoint not found",
              error: "The create endpoint returned 404.",
              suggestion: "Contact CouriersPlease support: apisupport@couriersplease.com.au"
            },
            { status: 500 }
          );
        }

        if (createResponse.status !== 200 || createResponse.data?.responseCode !== "SUCCESS") {
          console.error("❌ CREATION FAILED");
          console.log("Response:", JSON.stringify(createResponse.data, null, 2));
          
          // Extract validation errors if available
          const errors = createResponse.data?.data?.errors || [];
          const errorMessages = errors.map(e => `${e.field}: ${e.description}`).join("; ");
          
          return NextResponse.json(
            {
              success: false,
              message: "Shipment creation failed",
              error: createResponse.data?.msg || "Creation error",
              status: createResponse.status,
              validationErrors: errors,
              details: errorMessages || createResponse.data
            },
            { status: 500 }
          );
        }

        consignmentNumber = createResponse.data.data?.consignmentCode;
        
        if (!consignmentNumber) {
          throw new Error("No consignment code returned from API");
        }

        console.log(`✅ Shipment created! Consignment: ${consignmentNumber}`);

        // Update database
        await Shipment.updateOne(
          { awbNo },
          { 
            $set: { 
              forwardingNo: consignmentNumber,
              cpConsignmentNumber: consignmentNumber,
              cpRateCardId: rateCardId,
              cpShipmentCreatedAt: new Date(),
              status: "shipment_created"
            }
          }
        );

        console.log("💾 Database updated");

      } catch (error) {
        console.error("💥 Creation error:", error.message);

        if (error.response?.status === 401) {
          return NextResponse.json(
            {
              success: false,
              message: "Authentication failed during shipment creation",
              error: "Invalid credentials"
            },
            { status: 401 }
          );
        }

        return NextResponse.json(
          {
            success: false,
            message: "Shipment creation failed",
            error: error.response?.data?.msg || error.message
          },
          { status: 500 }
        );
      }
    } else {
      console.log(`✅ Using existing consignment: ${consignmentNumber}`);
    }

    // Step 3: Fetch the label with retry logic
    console.log(`\n🏷️ FETCHING DOMESTIC LABEL...`);
    
    // Helper function to wait
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Retry configuration
    const maxRetries = 3;
    const retryDelays = [2000, 5000, 10000]; // 2s, 5s, 10s
    
    let labelResponse = null;
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`⏳ Waiting ${retryDelays[attempt - 1] / 1000}s before retry ${attempt}...`);
          await wait(retryDelays[attempt - 1]);
        }
        
        const fullUrl = `${CP_LABEL_URL}?consignmentNumber=${consignmentNumber}`;
        console.log(`🌐 GET (Attempt ${attempt + 1}/${maxRetries + 1}):`, fullUrl);
        
        const response = await axios.get(fullUrl, { 
          headers,
          timeout: 30000,
          validateStatus: (status) => true,
        });

        console.log("📊 Label Status:", response.status);

        if (response.status === 429) {
          lastError = {
            status: 429,
            message: "Rate limit exceeded",
            retryAfter: response.headers['retry-after'] || 'unknown'
          };
          console.log(`⚠️ Rate limit hit. Retry after: ${lastError.retryAfter}s`);
          
          if (attempt < maxRetries) {
            continue; // Try again
          }
        } else if (response.status === 200 && response.data?.responseCode === "SUCCESS") {
          if (!response.data.data?.label) {
            throw new Error("Label data missing in response");
          }
          
          labelResponse = response;
          console.log(`✅ Label retrieved successfully`);
          break; // Success - exit retry loop
        } else if (response.status === 401) {
          throw new Error("Authentication failed when fetching label");
        } else if (response.status === 404) {
          lastError = {
            status: 404,
            message: `Consignment ${consignmentNumber} not found. It may still be processing.`
          };
          console.log(`⚠️ 404 - Consignment not ready yet`);
          
          if (attempt < maxRetries) {
            continue; // Try again
          }
        } else {
          throw new Error(response.data?.msg || `API error: ${response.status}`);
        }
      } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          lastError = {
            status: 'timeout',
            message: 'Request timeout - API may be slow'
          };
          console.log(`⚠️ Request timeout on attempt ${attempt + 1}`);
          
          if (attempt < maxRetries) {
            continue; // Try again
          }
        }
        throw error; // Re-throw unexpected errors
      }
    }
    
    // Check if we got the label
    if (labelResponse && labelResponse.status === 200) {
      const response = labelResponse;

      // Convert Base64 to data URL
      const base64ToDataUrl = (base64String) => {
        if (!base64String) return null;
        return `data:application/pdf;base64,${base64String}`;
      };

      // Prepare label response
      const mainLabel = {
        type: "main",
        labelUrl: base64ToDataUrl(response.data.data.label),
        dpdNumber: consignmentNumber,
        consignmentNumber: consignmentNumber,
        success: true,
        timestamp: new Date().toISOString()
      };

      // Update database
      await Shipment.updateOne(
        { awbNo },
        { 
          $set: { 
            forwardingNo: consignmentNumber,
            labelGeneratedAt: new Date(),
            labelStatus: "generated"
          }
        }
      );

      console.log("💾 Label status updated in database");
      console.log("\n" + "=".repeat(60));
      console.log("✅ DOMESTIC LABEL CREATION SUCCESSFUL!");
      console.log("=".repeat(60) + "\n");

      return NextResponse.json({
        success: true,
        message: `✅ Domestic label created successfully`,
        labels: [mainLabel],
        forwardingNo: consignmentNumber,
        totalSuccessful: 1,
        environment: "test",
        generatedAt: new Date().toISOString(),
        shipmentType: "Domestic"
      }, { status: 200 });
    } else {
      // Failed after all retries
      console.error("❌ Failed to fetch label after all retries");
      
      if (lastError?.status === 429) {
        return NextResponse.json(
          {
            success: false,
            message: "Rate limit exceeded",
            error: "CouriersPlease API rate limit has been reached. Please wait before trying again.",
            consignmentNumber: consignmentNumber,
            status: 429,
            instruction: "The shipment was created successfully. You can fetch the label later using the consignment number.",
            suggestion: "Wait 60 seconds and try fetching the label again, or use the consignment number to get the label from CouriersPlease portal.",
            retryEndpoint: `/api/labels/couriersplease/get-label?consignmentNumber=${consignmentNumber}`
          },
          { status: 429 }
        );
      } else if (lastError?.status === 404) {
        return NextResponse.json(
          {
            success: false,
            message: "Label not ready yet",
            error: lastError.message,
            consignmentNumber: consignmentNumber,
            status: 404,
            instruction: "The shipment was created but the label is still being processed.",
            suggestion: "Wait 30-60 seconds and try again.",
            retryEndpoint: `/api/labels/couriersplease/get-label?consignmentNumber=${consignmentNumber}`
          },
          { status: 404 }
        );
      } else {
        return NextResponse.json(
          {
            success: false,
            message: "Failed to fetch label after multiple retries",
            error: lastError?.message || "Unknown error",
            consignmentNumber: consignmentNumber,
            suggestion: "The shipment was created. Try fetching the label later."
          },
          { status: 500 }
        );
      }
    }

  } catch (error) {
    console.error("💥 Unhandled error:", error.message);
    
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// GET endpoint for status and testing
export async function GET(request) {
  const url = new URL(request.url);
  const awbNo = url.searchParams.get('awbNo');
  
  if (awbNo) {
    try {
      await connectDB();
      const shipment = await Shipment.findOne({ awbNo });
      
      if (!shipment) {
        return NextResponse.json(
          { success: false, message: "Shipment not found" },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        success: true,
        shipment: {
          awbNo: shipment.awbNo,
          consignmentNumber: shipment.cpConsignmentNumber || shipment.forwardingNo,
          hasLabel: !!shipment.labelGeneratedAt,
          labelStatus: shipment.labelStatus,
          createdAt: shipment.cpShipmentCreatedAt,
          isHold: shipment.isHold,
          sector: shipment.sector,
          origin: shipment.shipperCity,
          destination: shipment.receiverCity
        }
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }
  }
  
  return NextResponse.json({
    status: "CouriersPlease Domestic Label API - Ready",
    credentials: {
      accountNumber: CP_ACCOUNT_NUMBER || "Not set",
      tokenLength: CP_TOKEN ? CP_TOKEN.length : 0,
      isTestAccount: CP_ACCOUNT_NUMBER === "WD00000006"
    },
    endpoints: {
      quote: CP_QUOTE_URL,
      create: CP_CREATE_URL,
      label: CP_LABEL_URL
    },
    workflow: "Quote → Create → Get Label",
    timestamp: new Date().toISOString()
  });
}