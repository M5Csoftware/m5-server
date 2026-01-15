// app/api/labels/couriersplease/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import axios from "axios";

// CouriersPlease API Configuration - TEST ENVIRONMENT
const CP_BASE_URL = "https://api-test.couriersplease.com.au/v1";
const CP_ACCOUNT_NUMBER = process.env.CP_ACCOUNT_NUMBER;
const CP_TOKEN = process.env.CP_TOKEN;

// Helper: Wait/Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Format phone number for Australian domestic
const formatPhoneNumber = (phone) => {
  if (!phone) return "0000000000";
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('61')) cleaned = '0' + cleaned.substring(2);
  if (!cleaned.startsWith('0')) cleaned = '0' + cleaned;
  return cleaned;
};

// Helper: Format date for CP API
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

// Helper: Get rate card from Quote API
const getRateCard = async (shipment, headers) => {
  try {
    console.log("\n📊 FETCHING RATE CARD...");
    
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

    const response = await axios.post(`${CP_BASE_URL}/domestic/quote`, quotePayload, {
      headers,
      timeout: 30000,
      validateStatus: (status) => true,
    });

    if (response.status === 200 && response.data?.responseCode === "SUCCESS") {
      const rates = response.data.data;
      if (rates && rates.length > 0) {
        console.log(`✅ Rate Card: ${rates[0].RateCardCode}`);
        return rates[0].RateCardCode;
      }
    }

    console.error("❌ No rate card found");
    return null;
  } catch (error) {
    console.error("💥 Quote API Error:", error.message);
    return null;
  }
};

// Helper: Prepare domestic shipment data
const prepareDomesticShipmentData = (shipment, rateCardId) => {
  const shipperNames = (shipment.shipperFullName || "John Doe").split(' ');
  const receiverNames = (shipment.receiverFullName || "Jane Smith").split(' ');
  
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

  const pickupDate = shipment.pickupDate || new Date(Date.now() + 24 * 60 * 60 * 1000);

  return {
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
    destinationIsBusiness: Boolean(shipment.receiverCompanyName),

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

    items: items,
    rateCardId: rateCardId,
    readyDateTime: formatDateForCP(pickupDate),
    specialInstruction: shipment.operationRemark || "",
    referenceNumber: shipment.awbNo || "",
    termsAccepted: true,
    dangerousGoods: false,
    isATL: false
  };
};

// Helper: Fetch label with retry
const fetchLabelWithRetry = async (consignmentNumber, headers, maxRetries = 3) => {
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const fullUrl = `${CP_BASE_URL}/domestic/shipment/label?consignmentNumber=${consignmentNumber}`;
      console.log(`🌐 GET (Attempt ${attempt + 1}/${maxRetries}):`, fullUrl);

      const response = await axios.get(fullUrl, {
        headers,
        timeout: 30000,
        validateStatus: (status) => true,
      });

      console.log(`📊 Status: ${response.status}`);

      if (response.status === 200 && response.data?.responseCode === "SUCCESS") {
        return { success: true, data: response.data, status: 200 };
      }

      if (response.status === 429) {
        const retryAfter = response.headers['retry-after'] || 60;
        console.log(`⚠️ Rate limit: ${retryAfter}s`);
        return {
          success: false,
          status: 429,
          retryAfter: parseInt(retryAfter),
          message: "Rate limit exceeded"
        };
      }

      if (response.status === 404) {
        console.log(`⚠️ Not found (attempt ${attempt + 1})`);
        
        if (attempt < maxRetries - 1) {
          const waitTime = Math.min(10000 * (attempt + 1), 30000);
          console.log(`⏳ Waiting ${waitTime/1000}s...`);
          await sleep(waitTime);
          continue;
        }
        
        return {
          success: false,
          status: 404,
          message: "Label not ready yet",
          suggestion: "Wait 30-60 seconds and try again"
        };
      }

      if (response.status === 401) {
        return { success: false, status: 401, message: "Authentication failed" };
      }

      lastError = {
        success: false,
        status: response.status,
        message: response.data?.msg || `API error: ${response.status}`
      };

      if (response.status >= 400 && response.status < 500 && 
          response.status !== 404 && response.status !== 429) {
        return lastError;
      }

      if (attempt < maxRetries - 1 && response.status >= 500) {
        const waitTime = Math.min(5000 * Math.pow(2, attempt), 30000);
        console.log(`⏳ Server error, waiting ${waitTime/1000}s...`);
        await sleep(waitTime);
      }

    } catch (error) {
      console.error(`💥 Error (attempt ${attempt + 1}):`, error.message);
      lastError = { success: false, status: 500, message: error.message };

      if (attempt < maxRetries - 1) {
        const waitTime = Math.min(5000 * Math.pow(2, attempt), 30000);
        await sleep(waitTime);
      }
    }
  }

  return lastError || { success: false, status: 500, message: "Failed after retries" };
};

// ============================================================================
// GET: Search Shipment or Get Label
// ============================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const awbNo = searchParams.get("awbNo");
    const consignmentNumber = searchParams.get("consignmentNumber");

    await connectDB();

    // ACTION: Search Shipment
    if (action === "search" || (!action && awbNo && !consignmentNumber)) {
      if (!awbNo) {
        return NextResponse.json(
          { success: false, message: "AWB Number required" },
          { status: 400 }
        );
      }

      const shipment = await Shipment.findOne({ awbNo });
      if (!shipment) {
        return NextResponse.json(
          { success: false, message: "Shipment not found" },
          { status: 404 }
        );
      }

      let customerName = "";
      if (shipment.accountCode) {
        const customer = await CustomerAccount.findOne({ accountCode: shipment.accountCode });
        customerName = customer ? customer.name : "";
      }

      return NextResponse.json({
        success: true,
        message: "Shipment found",
        data: {
          awbNo: shipment.awbNo,
          accountCode: shipment.accountCode,
          customer: customerName,
          sector: shipment.sector,
          date: shipment.date,
          origin: shipment.origin,
          destination: shipment.destination,
          shipperFullName: shipment.shipperFullName,
          shipperPhoneNumber: shipment.shipperPhoneNumber,
          shipperEmail: shipment.shipperEmail,
          shipperAddressLine1: shipment.shipperAddressLine1,
          shipperAddressLine2: shipment.shipperAddressLine2,
          shipperCity: shipment.shipperCity,
          shipperState: shipment.shipperState,
          shipperCountry: shipment.shipperCountry,
          shipperPincode: shipment.shipperPincode,
          receiverFullName: shipment.receiverFullName,
          receiverPhoneNumber: shipment.receiverPhoneNumber,
          receiverEmail: shipment.receiverEmail,
          receiverAddressLine1: shipment.receiverAddressLine1,
          receiverAddressLine2: shipment.receiverAddressLine2,
          receiverCity: shipment.receiverCity,
          receiverState: shipment.receiverState,
          receiverCountry: shipment.receiverCountry,
          receiverPincode: shipment.receiverPincode,
          pcs: shipment.pcs,
          totalActualWt: shipment.totalActualWt,
          totalInvoiceValue: shipment.totalInvoiceValue,
          operationRemark: shipment.operationRemark,
          content: shipment.content,
          isHold: shipment.isHold,
          holdReason: shipment.holdReason,
          shipmentAndPackageDetails: shipment.shipmentAndPackageDetails,
          cpConsignmentNumber: shipment.cpConsignmentNumber,
          forwardingNo: shipment.forwardingNo,
          boxes: shipment.boxes
        }
      });
    }

    // ACTION: Get Label
    if (action === "get-label" || consignmentNumber) {
      if (!CP_ACCOUNT_NUMBER || !CP_TOKEN) {
        return NextResponse.json(
          { success: false, message: "API credentials not configured" },
          { status: 500 }
        );
      }

      let finalConsignmentNumber = consignmentNumber;

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
            { success: false, message: "No consignment number. Create shipment first." },
            { status: 400 }
          );
        }
      }

      console.log(`\n🏷️ FETCHING LABEL: ${finalConsignmentNumber}`);

      const authString = Buffer.from(`${CP_ACCOUNT_NUMBER}:${CP_TOKEN}`).toString("base64");
      const headers = {
        Authorization: `Basic ${authString}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const result = await fetchLabelWithRetry(finalConsignmentNumber, headers);

      if (result.status === 429) {
        return NextResponse.json({
          success: false,
          message: "Rate limit exceeded",
          status: 429,
          suggestion: `Wait ${result.retryAfter} seconds`,
          retryAfter: result.retryAfter,
          consignmentNumber: finalConsignmentNumber
        }, { status: 429 });
      }

      if (result.status === 404) {
        return NextResponse.json({
          success: false,
          message: "Label not ready yet",
          status: 404,
          suggestion: result.suggestion,
          consignmentNumber: finalConsignmentNumber
        }, { status: 404 });
      }

      if (result.status === 401) {
        return NextResponse.json({
          success: false,
          message: "Authentication failed",
          status: 401
        }, { status: 401 });
      }

      if (result.success && result.data?.data?.label) {
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
        }

        return NextResponse.json({
          success: true,
          message: "Label retrieved",
          labels: [mainLabel],
          consignmentNumber: finalConsignmentNumber
        });
      }

      return NextResponse.json({
        success: false,
        message: result.message || "Failed to retrieve label",
        status: result.status || 500,
        consignmentNumber: finalConsignmentNumber
      }, { status: result.status || 500 });
    }

    return NextResponse.json(
      { success: false, message: "Invalid action" },
      { status: 400 }
    );

  } catch (error) {
    console.error("💥 GET Error:", error.message);
    return NextResponse.json({
      success: false,
      message: "Internal server error",
      error: error.message
    }, { status: 500 });
  }
}

// ============================================================================
// POST: Create Label or Save Label
// ============================================================================
export async function POST(request) {
  try {
    if (!CP_ACCOUNT_NUMBER || !CP_TOKEN) {
      return NextResponse.json(
        { success: false, message: "API credentials not configured" },
        { status: 500 }
      );
    }

    await connectDB();

    const body = await request.json();
    const { awbNo, action, labels } = body;

    console.log("\n" + "=".repeat(60));
    console.log(`📦 ACTION: ${action || 'CREATE'} for AWB: ${awbNo}`);
    console.log("=".repeat(60));

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number required" },
        { status: 400 }
      );
    }

    // ACTION: Save Labels
    if (action === "save") {
      if (!labels || labels.length === 0) {
        return NextResponse.json(
          { success: false, message: "No labels to save" },
          { status: 400 }
        );
      }

      const consignmentNumbers = labels
        .map(l => l.consignmentNumber || l.dpdNumber)
        .filter(Boolean)
        .join(", ");

      await Shipment.updateOne(
        { awbNo },
        {
          $set: {
            forwardingNo: consignmentNumbers,
            cpConsignmentNumber: consignmentNumbers,
            labelGeneratedAt: new Date(),
            labelStatus: "saved"
          }
        }
      );

      console.log("💾 Labels saved to database");

      return NextResponse.json({
        success: true,
        message: "Labels saved successfully",
        consignmentNumbers: consignmentNumbers
      });
    }

    // ACTION: Create Label (Default)
    const shipment = await Shipment.findOne({ awbNo });

    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "Shipment not found" },
        { status: 404 }
      );
    }

    if (shipment.sector !== "Domestic") {
      return NextResponse.json(
        { success: false, message: "Only domestic shipments supported" },
        { status: 400 }
      );
    }

    if (shipment.isHold) {
      return NextResponse.json({
        success: false,
        message: `Shipment on hold: ${shipment.holdReason || "Not specified"}`
      }, { status: 400 });
    }

    const authString = Buffer.from(`${CP_ACCOUNT_NUMBER}:${CP_TOKEN}`).toString("base64");
    const headers = {
      Authorization: `Basic ${authString}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    let consignmentNumber = shipment.cpConsignmentNumber || shipment.forwardingNo;

    if (!consignmentNumber) {
      console.log("\n🚀 CREATING SHIPMENT...");
      
      const rateCardId = await getRateCard(shipment, headers);
      if (!rateCardId) {
        return NextResponse.json({
          success: false,
          message: "Failed to get rate card. Verify suburbs/postcodes."
        }, { status: 400 });
      }

      const shipmentData = prepareDomesticShipmentData(shipment, rateCardId);
      
      console.log("📋 Creating with rate card:", rateCardId);

      const createResponse = await axios.post(
        `${CP_BASE_URL}/domestic/shipment/create`,
        shipmentData,
        {
          headers,
          timeout: 30000,
          validateStatus: (status) => true,
        }
      );

      console.log("📊 Create Status:", createResponse.status);

      if (createResponse.status !== 200 || createResponse.data?.responseCode !== "SUCCESS") {
        const errors = createResponse.data?.data?.errors || [];
        const errorMessages = errors.map(e => `${e.field}: ${e.description}`).join("; ");
        
        return NextResponse.json({
          success: false,
          message: "Shipment creation failed",
          error: createResponse.data?.msg || "Creation error",
          validationErrors: errors,
          details: errorMessages || createResponse.data
        }, { status: 500 });
      }

      consignmentNumber = createResponse.data.data?.consignmentCode;
      
      if (!consignmentNumber) {
        throw new Error("No consignment code returned");
      }

      console.log(`✅ Created: ${consignmentNumber}`);

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
    } else {
      console.log(`✅ Using existing: ${consignmentNumber}`);
    }

    // Fetch Label
    console.log(`\n🏷️ FETCHING LABEL...`);
    const result = await fetchLabelWithRetry(consignmentNumber, headers, 3);

    if (result.success && result.data?.data?.label) {
      const base64ToDataUrl = (base64String) => {
        if (!base64String) return null;
        return `data:application/pdf;base64,${base64String}`;
      };

      const mainLabel = {
        type: "main",
        labelUrl: base64ToDataUrl(result.data.data.label),
        dpdNumber: consignmentNumber,
        consignmentNumber: consignmentNumber,
        success: true,
        timestamp: new Date().toISOString()
      };

      console.log("✅ LABEL CREATED SUCCESSFULLY");

      return NextResponse.json({
        success: true,
        message: "Label created successfully",
        labels: [mainLabel],
        forwardingNo: consignmentNumber
      });

    } else {
      // Shipment created but label fetch failed
      if (result.status === 429) {
        return NextResponse.json({
          success: false,
          message: "Rate limit exceeded",
          error: "API rate limit reached",
          consignmentNumber: consignmentNumber,
          status: 429,
          instruction: "Shipment created. Fetch label later.",
          suggestion: "Wait 60 seconds and retry",
          retryAfter: result.retryAfter || 60
        }, { status: 429 });
      }

      if (result.status === 404) {
        return NextResponse.json({
          success: false,
          message: "Label not ready yet",
          error: result.message,
          consignmentNumber: consignmentNumber,
          status: 404,
          instruction: "Shipment created. Label processing.",
          suggestion: "Wait 30-60 seconds and retry",
          retryAfter: 30
        }, { status: 404 });
      }

      return NextResponse.json({
        success: false,
        message: "Failed to fetch label",
        error: result.message,
        consignmentNumber: consignmentNumber,
        suggestion: "Shipment created. Try fetching label later."
      }, { status: 500 });
    }

  } catch (error) {
    console.error("💥 POST Error:", error.message);
    return NextResponse.json({
      success: false,
      message: "Internal server error",
      error: error.message
    }, { status: 500 });
  }
}

// ============================================================================
// DELETE: Delete/Remove Label
// ============================================================================
export async function DELETE(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const awbNo = searchParams.get("awbNo");

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number required" },
        { status: 400 }
      );
    }

    const shipment = await Shipment.findOne({ awbNo });
    
    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "Shipment not found" },
        { status: 404 }
      );
    }

    // Clear label-related fields
    await Shipment.updateOne(
      { awbNo },
      {
        $unset: {
          cpConsignmentNumber: "",
          labelGeneratedAt: "",
          labelStatus: ""
        }
      }
    );

    console.log(`🗑️ Label data cleared for AWB: ${awbNo}`);

    return NextResponse.json({
      success: true,
      message: "Label data cleared successfully"
    });

  } catch (error) {
    console.error("💥 DELETE Error:", error.message);
    return NextResponse.json({
      success: false,
      message: "Failed to delete label",
      error: error.message
    }, { status: 500 });
  }
}