// app/api/labels/couriersplease/test-credentials/route.js
import { NextResponse } from "next/server";
import axios from "axios";

// IMPORTANT: CouriersPlease has TWO different API systems:
// 1. Developer Portal API (uses numeric Developer ID)
// 2. International Shipment API (uses Account Number like WD00000006)
// Make sure you're using the correct credentials for the correct API!

const CP_VALIDATE_URL = "https://api-test.couriersplease.com.au/v1/international/shipment/validate";
const CP_ACCOUNT_NUMBER = process.env.CP_ACCOUNT_NUMBER;
const CP_TOKEN = process.env.CP_TOKEN;

// Alternative: Try with Developer ID if account number doesn't work
const CP_DEVELOPER_ID = process.env.CP_DEVELOPER_ID; // Numeric ID like 123456789

export async function GET(request) {
  console.log("🔍 Testing CouriersPlease Credentials...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  // Check if credentials exist
  if (!CP_ACCOUNT_NUMBER || !CP_TOKEN) {
    return NextResponse.json({
      success: false,
      message: "Credentials not configured",
      details: {
        hasAccountNumber: !!CP_ACCOUNT_NUMBER,
        hasToken: !!CP_TOKEN,
        hasDeveloperId: !!CP_DEVELOPER_ID,
        note: "Make sure .env.local has CP_ACCOUNT_NUMBER and CP_TOKEN set"
      }
    }, { status: 500 });
  }

  // Clean credentials (remove any whitespace, quotes, newlines)
  const cleanAccountNumber = CP_ACCOUNT_NUMBER.trim().replace(/['"]/g, '');
  const cleanToken = CP_TOKEN.trim().replace(/['"]/g, '');
  const cleanDeveloperId = CP_DEVELOPER_ID ? CP_DEVELOPER_ID.trim().replace(/['"]/g, '') : null;

  console.log("📋 Credentials Information:");
  console.log("  Account Number:", cleanAccountNumber);
  console.log("  Account Type:", cleanAccountNumber.startsWith('WD') ? 'Test Account (WD prefix)' : 'Unknown Type');
  console.log("  Token Length:", cleanToken.length, "(should be 64)");
  console.log("  Token First 10:", cleanToken.substring(0, 10));
  console.log("  Token Last 10:", cleanToken.substring(cleanToken.length - 10));
  if (cleanDeveloperId) {
    console.log("  Developer ID:", cleanDeveloperId, "(alternative auth method)");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Test payload
  const testPayload = {
    pickupIsBusiness: true,
    pickupCompanyName: "Test Company",
    pickupFirstName: "John",
    pickupLastName: "Doe",
    pickupAddress1: "Building C South",
    pickupAddress2: "5/7 Shirley Street",
    pickupSuburb: "ROSEHILL",
    pickupPostcode: "2142",
    pickupState: "NSW",
    pickupCountryCode: "AU",
    pickupEmail: "test@example.com",
    pickupPhone: "0412345678",

    destinationIsBusiness: false,
    destinationCompanyName: "",
    destinationFirstName: "Jane",
    destinationLastName: "Smith",
    destinationAddress1: "123 Main St",
    destinationAddress2: "",
    destinationSuburb: "New York",
    destinationPostcode: "10001",
    destinationState: "NY",
    destinationCountryCode: "US",
    destinationEmail: "receiver@example.com",
    destinationPhone: "+1234567890",

    contactIsBusiness: true,
    contactCompanyName: "Test Company",
    contactFirstName: "John",
    contactLastName: "Doe",
    contactAddress1: "Building C South",
    contactAddress2: "5/7 Shirley Street",
    contactSuburb: "ROSEHILL",
    contactPostcode: "2142",
    contactState: "NSW",
    contactCountryCode: "AU",
    contactEmail: "test@example.com",
    contactPhone: "0412345678",

    items: [{
      quantity: 1,
      length: 30,
      width: 30,
      height: 30,
      physicalWeight: 1.0
    }],

    customsDeclarations: [{
      numItems: 1,
      itemDescription: "Test merchandise",
      countryOfOrigin: "AU",
      HSCode: "",
      unitPrice: 10
    }],

    rateCardId: "EXPA",
    preferredPickupDateTime: "2025-12-11 10:00 AM",
    specialInstruction: "",
    referenceNumber: "TEST123",
    termsAccepted: true,
    dangerousGoods: false,
    acceptPhotoIDRequired: true,
    insurance: false,
    isReturnToSender: false,
    shipmentType: "Merchandise",
    natureOfGoods: "",
    typeOfExport: "Permanent"
  };

  // Try multiple authentication methods
  const authMethods = [];
  
  // Method 1: Account Number : Token
  authMethods.push({
    name: "Account Number:Token",
    username: cleanAccountNumber,
    password: cleanToken
  });
  
  // Method 2: Developer ID : Token (if available)
  if (cleanDeveloperId) {
    authMethods.push({
      name: "Developer ID:Token",
      username: cleanDeveloperId,
      password: cleanToken
    });
  }

  const results = [];

  for (const method of authMethods) {
    console.log(`\n🧪 Testing: ${method.name}`);
    console.log(`   Username: ${method.username}`);
    console.log(`   Password Length: ${method.password.length}`);
    
    const authString = Buffer.from(`${method.username}:${method.password}`).toString("base64");
    console.log(`   Base64 Length: ${authString.length}`);
    console.log(`   Base64 First 30: ${authString.substring(0, 30)}...`);

    const headers = {
      "Authorization": `Basic ${authString}`,
      "Accept": "application/json",
      "Content-Type": "application/json"
    };

    try {
      const response = await axios.post(CP_VALIDATE_URL, testPayload, {
        headers,
        timeout: 30000,
        validateStatus: () => true
      });

      console.log(`   ✓ Response Status: ${response.status}`);
      console.log(`   ✓ Response Body:`, response.data ? JSON.stringify(response.data) : 'Empty');

      results.push({
        method: method.name,
        status: response.status,
        success: response.status === 200 && response.data?.responseCode === "SUCCESS",
        responseCode: response.data?.responseCode,
        message: response.data?.msg,
        data: response.data
      });

      // If successful, break early
      if (response.status === 200 && response.data?.responseCode === "SUCCESS") {
        console.log(`   🎉 SUCCESS with ${method.name}!`);
        break;
      }

    } catch (error) {
      console.error(`   ✗ Error:`, error.message);
      results.push({
        method: method.name,
        status: 'ERROR',
        success: false,
        error: error.message
      });
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Check if any method succeeded
  const successfulMethod = results.find(r => r.success);

  if (successfulMethod) {
    return NextResponse.json({
      success: true,
      message: `✅ Credentials are VALID using ${successfulMethod.method}!`,
      workingMethod: successfulMethod.method,
      details: {
        status: successfulMethod.status,
        responseCode: successfulMethod.responseCode,
        message: successfulMethod.message
      },
      allResults: results
    });
  }

  // All methods failed
  const firstResult = results[0];
  
  return NextResponse.json({
    success: false,
    message: "❌ All authentication methods FAILED",
    primaryError: {
      method: firstResult.method,
      status: firstResult.status,
      message: firstResult.message || firstResult.error
    },
    allResults: results,
    troubleshooting: {
      common_issues: [
        "1. WRONG API TYPE: You might be using Developer Portal credentials for International Shipment API",
        "2. ACCOUNT NOT ACTIVE: Contact CouriersPlease to activate your test account",
        "3. TOKEN EXPIRED: Generate a new token from CouriersPlease portal",
        "4. WRONG ENVIRONMENT: Verify you're using TEST credentials with TEST URL",
        "5. WHITESPACE: Check .env.local for hidden spaces/quotes/newlines",
        "6. API ACCESS: Confirm your account has International Shipment API access enabled"
      ],
      check_your_env_file: {
        current: {
          CP_ACCOUNT_NUMBER: cleanAccountNumber,
          CP_TOKEN_LENGTH: cleanToken.length,
          CP_DEVELOPER_ID: cleanDeveloperId || "Not set"
        },
        expected_format: [
          "For International API:",
          "  CP_ACCOUNT_NUMBER=WD00000006",
          "  CP_TOKEN=your_64_char_token",
          "",
          "For Developer Portal API:",
          "  CP_DEVELOPER_ID=123456789",
          "  CP_TOKEN=your_64_char_token"
        ]
      },
      next_steps: [
        "1. Log into CouriersPlease portal at: https://apidev.couriersplease.com.au",
        "2. Check which API type your account has access to",
        "3. Verify token is active and not expired",
        "4. Contact CouriersPlease support: [email protected]",
        "5. Request they enable 'International Shipment API' access",
        "6. Ask them to verify your test credentials"
      ]
    }
  }, { status: 401 });
}

export async function POST(request) {
  // Allow testing with custom credentials
  const body = await request.json();
  const { accountNumber, token, developerId } = body;

  if ((!accountNumber && !developerId) || !token) {
    return NextResponse.json({
      success: false,
      message: "Please provide (accountNumber OR developerId) AND token in request body",
      example: {
        accountNumber: "WD00000006",
        token: "your_64_char_token",
        developerId: "123456789" // optional alternative
      }
    }, { status: 400 });
  }

  const username = developerId || accountNumber;
  const cleanUsername = username.trim().replace(/['"]/g, '');
  const cleanToken = token.trim().replace(/['"]/g, '');

  console.log("Testing custom credentials...");
  console.log("  Username:", cleanUsername);
  console.log("  Token length:", cleanToken.length);

  const authString = Buffer.from(`${cleanUsername}:${cleanToken}`).toString("base64");

  const testPayload = {
    pickupIsBusiness: true,
    pickupCompanyName: "Test Company",
    pickupFirstName: "John",
    pickupLastName: "Doe",
    pickupAddress1: "Building C South",
    pickupAddress2: "5/7 Shirley Street",
    pickupSuburb: "ROSEHILL",
    pickupPostcode: "2142",
    pickupState: "NSW",
    pickupCountryCode: "AU",
    pickupEmail: "test@example.com",
    pickupPhone: "0412345678",
    destinationIsBusiness: false,
    destinationCompanyName: "",
    destinationFirstName: "Jane",
    destinationLastName: "Smith",
    destinationAddress1: "123 Main St",
    destinationAddress2: "",
    destinationSuburb: "New York",
    destinationPostcode: "10001",
    destinationState: "NY",
    destinationCountryCode: "US",
    destinationEmail: "receiver@example.com",
    destinationPhone: "+1234567890",
    contactIsBusiness: true,
    contactCompanyName: "Test Company",
    contactFirstName: "John",
    contactLastName: "Doe",
    contactAddress1: "Building C South",
    contactAddress2: "5/7 Shirley Street",
    contactSuburb: "ROSEHILL",
    contactPostcode: "2142",
    contactState: "NSW",
    contactCountryCode: "AU",
    contactEmail: "test@example.com",
    contactPhone: "0412345678",
    items: [{ quantity: 1, length: 30, width: 30, height: 30, physicalWeight: 1.0 }],
    customsDeclarations: [{
      numItems: 1,
      itemDescription: "Test",
      countryOfOrigin: "AU",
      HSCode: "",
      unitPrice: 10
    }],
    rateCardId: "EXPA",
    preferredPickupDateTime: "2025-12-11 10:00 AM",
    specialInstruction: "",
    referenceNumber: "TEST",
    termsAccepted: true,
    dangerousGoods: false,
    acceptPhotoIDRequired: true,
    insurance: false,
    isReturnToSender: false,
    shipmentType: "Merchandise",
    natureOfGoods: "",
    typeOfExport: "Permanent"
  };

  const headers = {
    "Authorization": `Basic ${authString}`,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  try {
    const response = await axios.post(CP_VALIDATE_URL, testPayload, {
      headers,
      timeout: 30000,
      validateStatus: () => true
    });

    const isSuccess = response.status === 200 && response.data?.responseCode === "SUCCESS";

    return NextResponse.json({
      success: isSuccess,
      status: response.status,
      responseCode: response.data?.responseCode,
      message: response.data?.msg,
      result: isSuccess ? "✅ Valid credentials" : "❌ Invalid credentials",
      fullResponse: response.data,
      testedWith: {
        username: cleanUsername,
        tokenLength: cleanToken.length,
        authType: developerId ? "Developer ID" : "Account Number"
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.response?.data
    }, { status: 500 });
  }
}