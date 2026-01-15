// app/api/labels/couriersplease/create-shipment/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import axios from "axios";

// CouriersPlease API Configuration - TEST ENVIRONMENT
const CP_VALIDATE_URL = "https://api-test.couriersplease.com.au/v1/international/shipment/validate";
const CP_CREATE_URL = "https://api-test.couriersplease.com.au/v1/international/shipment/create";

// Get credentials from environment variables
const CP_ACCOUNT_NUMBER = process.env.CP_ACCOUNT_NUMBER;
const CP_TOKEN = process.env.CP_TOKEN;

// Helper function to prepare shipment data for CP API
const prepareShipmentData = (shipment, rateCardId = "EXPA") => {
  // Default to DHL Express (EXPA) if not specified
  // EXPA = DHL Express, SAVA = SingPost
  
  // Parse pickup and delivery addresses from your shipment data
  // This assumes your Shipment model has these fields
  const pickup = shipment.pickupAddress || {};
  const delivery = shipment.deliveryAddress || {};
  const contact = shipment.contact || shipment.pickupAddress || {};
  
  // Format the date for CP API
  const formatDateForCP = (date) => {
    const d = new Date(date);
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${formattedHours}:${minutes} ${ampm}`;
  };

  // Prepare items array (based on package dimensions)
  const items = [];
  if (shipment.packageDetails) {
    shipment.packageDetails.forEach(pkg => {
      items.push({
        quantity: pkg.quantity || 1,
        length: pkg.length || 30,
        width: pkg.width || 30,
        height: pkg.height || 30,
        physicalWeight: pkg.weight || 1.0
      });
    });
  } else {
    // Default item if no package details
    items.push({
      quantity: 1,
      length: 30,
      width: 30,
      height: 30,
      physicalWeight: 1.0
    });
  }

  // Prepare customs declarations
  const customsDeclarations = [];
  if (shipment.items && shipment.items.length > 0) {
    shipment.items.forEach(item => {
      customsDeclarations.push({
        numItems: item.quantity || 1,
        itemDescription: item.description || "General merchandise",
        countryOfOrigin: item.countryOfOrigin || "AU",
        HSCode: item.hsCode || "",
        unitPrice: item.value || 10
      });
    });
  } else {
    // Default customs declaration
    customsDeclarations.push({
      numItems: 1,
      itemDescription: "General merchandise",
      countryOfOrigin: "AU",
      HSCode: "",
      unitPrice: 10
    });
  }

  return {
    // Pickup details
    pickupIsBusiness: true,
    pickupCompanyName: pickup.companyName || "Sender Company",
    pickupFirstName: pickup.firstName || "John",
    pickupLastName: pickup.lastName || "Doe",
    pickupAddress1: pickup.address1 || pickup.street || "123 Street",
    pickupAddress2: pickup.address2 || "",
    pickupSuburb: pickup.city || pickup.suburb || "Sydney",
    pickupPostcode: pickup.postcode || pickup.zipCode || "2000",
    pickupState: pickup.state || "NSW",
    pickupCountryCode: pickup.countryCode || "AU",
    pickupEmail: pickup.email || "sender@example.com",
    pickupPhone: pickup.phone || "0412345678",

    // Destination details
    destinationIsBusiness: delivery.business || false,
    destinationCompanyName: delivery.companyName || "",
    destinationFirstName: delivery.firstName || "Jane",
    destinationLastName: delivery.lastName || "Smith",
    destinationAddress1: delivery.address1 || delivery.street || "456 Road",
    destinationAddress2: delivery.address2 || "",
    destinationSuburb: delivery.city || delivery.suburb || delivery.city || "Destination City",
    destinationPostcode: delivery.postcode || delivery.zipCode || "10001",
    destinationState: delivery.state || delivery.province || "State",
    destinationCountryCode: delivery.countryCode || "US",
    destinationEmail: delivery.email || "receiver@example.com",
    destinationPhone: delivery.phone || "+1234567890",

    // Contact details (usually same as pickup for international)
    contactIsBusiness: true,
    contactCompanyName: contact.companyName || pickup.companyName || "Sender Company",
    contactFirstName: contact.firstName || pickup.firstName || "John",
    contactLastName: contact.lastName || pickup.lastName || "Doe",
    contactAddress1: contact.address1 || pickup.address1 || "123 Street",
    contactAddress2: contact.address2 || pickup.address2 || "",
    contactSuburb: contact.city || pickup.city || "Sydney",
    contactPostcode: contact.postcode || pickup.postcode || "2000",
    contactState: contact.state || pickup.state || "NSW",
    contactCountryCode: contact.countryCode || pickup.countryCode || "AU",
    contactEmail: contact.email || pickup.email || "sender@example.com",
    contactPhone: contact.phone || pickup.phone || "0412345678",

    // Shipment details
    items: items,
    customsDeclarations: customsDeclarations,
    rateCardId: rateCardId, // "EXPA" for DHL, "SAVA" for SingPost
    preferredPickupDateTime: formatDateForCP(shipment.pickupDate || new Date(Date.now() + 24 * 60 * 60 * 1000)),
    specialInstruction: shipment.instructions || "",
    referenceNumber: shipment.awbNo || shipment.reference || "",
    termsAccepted: true,
    dangerousGoods: false,
    acceptPhotoIDRequired: true,
    insurance: shipment.insurance || false,
    isReturnToSender: shipment.returnToSender || false,
    shipmentType: shipment.shipmentType || "Merchandise",
    natureOfGoods: shipment.natureOfGoods || "",
    typeOfExport: shipment.typeOfExport || "Permanent"
  };
};

export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { awbNo, rateCardId = "EXPA" } = body;

    console.log("🚀 Creating shipment for AWB:", awbNo);
    console.log("📦 Using rate card:", rateCardId);

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400 }
      );
    }

    // Find shipment in database
    const shipment = await Shipment.findOne({ awbNo });

    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "Shipment not found in database" },
        { status: 404 }
      );
    }

    // Check if shipment is on hold
    if (shipment.isHold) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot create shipment. Shipment is on hold. Reason: ${
            shipment.holdReason || "Not specified"
          }`,
        },
        { status: 400 }
      );
    }

    // Check if shipment already has a consignment number
    if (shipment.forwardingNo) {
      return NextResponse.json(
        {
          success: false,
          message: "Shipment already has a consignment number",
          consignmentNumber: shipment.forwardingNo
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

    // Create Basic Auth header
    const authString = Buffer.from(`${CP_ACCOUNT_NUMBER}:${CP_TOKEN}`).toString("base64");
    const headers = {
      Authorization: `Basic ${authString}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // Prepare shipment data for CP API
    const shipmentData = prepareShipmentData(shipment, rateCardId);
    
    console.log("📋 Prepared shipment data:", JSON.stringify(shipmentData, null, 2));

    // Function to call CouriersPlease API
    const callCPAPI = async (url, data) => {
      console.log(`🌐 Calling CP API: ${url}`);
      
      try {
        const response = await axios.post(url, data, {
          headers,
          timeout: 30000,
          validateStatus: (status) => true // Don't throw for any status
        });

        console.log(`📊 API Response:`, {
          status: response.status,
          responseCode: response.data?.responseCode,
          message: response.data?.msg
        });

        if (response.data) {
          console.log("📋 Response data:", JSON.stringify(response.data, null, 2));
        }

        return response;
      } catch (error) {
        console.error(`💥 API Error:`, error.message);
        throw error;
      }
    };

    // Step 1: Validate the shipment
    console.log("🔍 Step 1: Validating shipment...");
    const validateResponse = await callCPAPI(CP_VALIDATE_URL, shipmentData);

    if (validateResponse.status === 200 && validateResponse.data?.responseCode === "SUCCESS") {
      console.log("✅ Shipment validation successful");
    } else {
      console.error("❌ Shipment validation failed");
      return NextResponse.json(
        {
          success: false,
          message: "Shipment validation failed",
          error: validateResponse.data?.msg || "Validation error",
          validationErrors: validateResponse.data?.data?.errors,
          status: validateResponse.status
        },
        { status: 400 }
      );
    }

    // Step 2: Create the shipment
    console.log("🚀 Step 2: Creating shipment...");
    const createResponse = await callCPAPI(CP_CREATE_URL, shipmentData);

    if (createResponse.status === 200 && createResponse.data?.responseCode === "SUCCESS") {
      const consignmentCode = createResponse.data.data?.consignmentCode;
      
      if (!consignmentCode) {
        throw new Error("No consignment code returned from API");
      }

      console.log(`✅ Shipment created successfully! Consignment: ${consignmentCode}`);

      // Update the shipment in database with consignment number
      await Shipment.updateOne(
        { awbNo },
        { 
          $set: { 
            forwardingNo: consignmentCode,
            cpConsignmentNumber: consignmentCode,
            cpRateCardId: rateCardId,
            cpShipmentCreatedAt: new Date(),
            cpShipmentData: shipmentData,
            status: "shipment_created"
          }
        }
      );

      return NextResponse.json(
        {
          success: true,
          message: "Shipment created successfully",
          consignmentNumber: consignmentCode,
          rateCardId: rateCardId,
          carrier: rateCardId.startsWith("EXP") ? "DHL" : "SingPost",
          nextStep: "Now you can generate the label using the create-label endpoint",
          labelEndpoint: `/api/labels/couriersplease/create-label`,
          labelRequest: {
            awbNo: awbNo,
            consignmentNumber: consignmentCode
          }
        },
        { status: 200 }
      );

    } else {
      console.error("❌ Shipment creation failed");
      return NextResponse.json(
        {
          success: false,
          message: "Shipment creation failed",
          error: createResponse.data?.msg || "Creation error",
          status: createResponse.status,
          responseData: createResponse.data
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("💥 Create shipment error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create shipment",
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check shipment status
export async function GET(request) {
  try {
    await connectDB();
    
    const url = new URL(request.url);
    const awbNo = url.searchParams.get('awbNo');
    
    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
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
    
    return NextResponse.json({
      success: true,
      shipment: {
        awbNo: shipment.awbNo,
        forwardingNo: shipment.forwardingNo,
        cpConsignmentNumber: shipment.cpConsignmentNumber,
        cpRateCardId: shipment.cpRateCardId,
        cpShipmentCreatedAt: shipment.cpShipmentCreatedAt,
        status: shipment.status,
        hasShipment: !!shipment.forwardingNo,
        canCreateLabel: !!shipment.forwardingNo && !shipment.isHold
      }
    });
    
  } catch (error) {
    console.error("Get shipment error:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}