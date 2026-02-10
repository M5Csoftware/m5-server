import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import { validateApiKey } from "@/app/lib/Apikeymiddleware";
import Manifest from "@/app/model/portal/Manifest";
import Shipment from "@/app/model/portal/Shipment";
import Notification from "@/app/model/Notification";
import { buildShipmentBookedNotification } from "@/app/lib/notificationPayload";

/**
 * Create Manifest API
 * POST /api/v1/manifest/create
 * 
 * Request Body:
 * {
 *   "awbNumbers": ["PORTAL17703727241301", "PORTAL17703727241302"]
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "manifestNumber": "CUST001-01",
 *     "awbCount": 2,
 *     "totalPieces": 5,
 *     "totalWeight": 15.5,
 *     "status": "pending"
 *   }
 * }
 */

await connectDB();

export async function POST(req) {
  try {
    // Validate API key
    const validation = await validateApiKey(req, {
      requiredEndpoint: "/v1/manifest/create",
      requiredMethod: "POST"
    });

    if (!validation.valid) {
      return validation.response;
    }

    const { apiKey, customer, usage } = validation.data;

    // Parse request body
    const body = await req.json();
    const { awbNumbers } = body;

    console.log(`📋 Create Manifest request from ${customer.code}:`);
    console.log(`   Account Code: ${customer.code}`);
    console.log(`   Customer Name: ${customer.name}`);
    console.log(`   AWB Numbers:`, awbNumbers);
    console.log(`   AWB Count: ${awbNumbers?.length}`);

    // ===== VALIDATION =====
    
    // Validate AWB numbers
    if (!Array.isArray(awbNumbers) || awbNumbers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid AWB numbers",
          message: "AWB numbers must be a non-empty array",
          code: "INVALID_AWB_NUMBERS"
        },
        { status: 400 }
      );
    }

    // ===== STEP 1: Check for already assigned shipments =====
    console.log("\n🔍 Step 1: Checking for already assigned shipments...");
    
    const alreadyAssigned = await Shipment.find({
      awbNo: { $in: awbNumbers },
      accountCode: customer.code,
      manifestNo: { $exists: true, $ne: null, $ne: "" }
    }).select("awbNo manifestNo");

    console.log(`   Found ${alreadyAssigned.length} already assigned shipment(s)`);

    if (alreadyAssigned.length > 0) {
      console.log(`   ❌ Already assigned AWBs:`);
      alreadyAssigned.forEach(s => {
        console.log(`      - ${s.awbNo} → Manifest: ${s.manifestNo}`);
      });
      
      return NextResponse.json(
        {
          success: false,
          error: "Shipments already in manifest",
          message: "Some shipments are already assigned to a manifest",
          code: "SHIPMENTS_ALREADY_ASSIGNED",
          details: {
            assignedShipments: alreadyAssigned.map(s => ({
              awbNo: s.awbNo,
              manifestNumber: s.manifestNo
            }))
          }
        },
        { status: 409 }
      );
    }

    console.log(`   ✅ No shipments already assigned`);

    // ===== STEP 2: Validate that all AWBs exist as shipments =====
    console.log("\n🔍 Step 2: Validating shipments exist for account...");
    console.log(`   Looking for AWBs in Shipment collection:`);
    console.log(`   - Account Code: ${customer.code}`);
    console.log(`   - AWB Numbers: ${awbNumbers.join(', ')}`);
    
    const validShipments = await Shipment.find({
      awbNo: { $in: awbNumbers },
      accountCode: customer.code
    }).select("awbNo boxes totalActualWt totalVolWt pcs accountCode");

    console.log(`   Found ${validShipments.length} valid shipment(s) out of ${awbNumbers.length} requested`);
    
    if (validShipments.length > 0) {
      console.log(`   Valid shipments:`);
      validShipments.forEach(s => {
        console.log(`      - AWB: ${s.awbNo}, Account: ${s.accountCode}, Pieces: ${s.pcs || s.boxes?.length || 0}, Weight: ${s.totalActualWt || 0}kg`);
      });
    }

    const validAwbNumbers = validShipments.map((s) => s.awbNo);
    const invalidAwbs = awbNumbers.filter(
      (awb) => !validAwbNumbers.includes(awb)
    );

    if (invalidAwbs.length > 0) {
      console.log(`   ❌ Invalid AWBs (not found for account ${customer.code}):`);
      invalidAwbs.forEach(awb => {
        console.log(`      - ${awb}`);
      });
      
      // Check if these AWBs exist for other accounts
      const otherAccountShipments = await Shipment.find({
        awbNo: { $in: invalidAwbs }
      }).select("awbNo accountCode");
      
      if (otherAccountShipments.length > 0) {
        console.log(`   ℹ️  These AWBs exist but belong to different accounts:`);
        otherAccountShipments.forEach(s => {
          console.log(`      - ${s.awbNo} → Account: ${s.accountCode}`);
        });
      }
      
      return NextResponse.json(
        {
          success: false,
          error: "Invalid AWB numbers",
          message: `Some AWB numbers do not exist as shipments for your account (${customer.code})`,
          code: "INVALID_AWBS",
          details: {
            invalidAwbs: invalidAwbs,
            validAwbs: validAwbNumbers,
            yourAccountCode: customer.code,
            note: "AWB numbers must belong to your account"
          }
        },
        { status: 400 }
      );
    }

    console.log(`   ✅ All ${validShipments.length} AWB(s) validated successfully`);

    // ===== STEP 3: Calculate totals =====
    console.log("\n🔍 Step 3: Calculating totals...");
    
    const totalPieces = validShipments.reduce(
      (sum, shipment) => sum + (shipment.pcs || shipment?.boxes?.length || 0),
      0
    );
    const totalWeight = validShipments.reduce(
      (sum, shipment) => sum + (shipment.totalActualWt || 0),
      0
    );

    console.log(`   Total Pieces: ${totalPieces}`);
    console.log(`   Total Weight: ${totalWeight.toFixed(2)} kg`);

    // ===== STEP 4: Get last manifest for counter =====
    console.log("\n🔍 Step 4: Generating manifest number...");
    
    const lastManifest = await Manifest.findOne({ 
      accountCode: customer.code 
    })
      .sort({ createdAt: -1 })
      .lean();

    let counter = 1;
    if (lastManifest?.manifestNumber) {
      const parts = lastManifest.manifestNumber.split("-");
      const lastCounter = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastCounter)) {
        counter = lastCounter + 1;
      }
      console.log(`   Last manifest: ${lastManifest.manifestNumber}, Next counter: ${counter}`);
    } else {
      console.log(`   No previous manifests found, starting with counter: 1`);
    }

    // ===== STEP 5: Generate new manifest number =====
    const manifestNumber = `${customer.code}-${counter.toString().padStart(2, "0")}`;

    console.log(`   ✅ Generated manifest number: ${manifestNumber}`);

    // ===== STEP 6: Create notification =====
    console.log("\n🔍 Step 5: Creating notification...");
    
    try {
      const notificationPayload = buildShipmentBookedNotification({
        accountCode: customer.code,
        type: "Manifest Created",
        title: "Manifest Created",
        awb: awbNumbers,
        manifestNo: manifestNumber,
      });

      await new Notification(notificationPayload).save();
      console.log(`   ✅ Notification created`);
    } catch (notifError) {
      console.log(`   ⚠️  Notification failed (non-critical):`, notifError.message);
    }

    // ===== STEP 7: Create and save Manifest =====
    console.log("\n🔍 Step 6: Creating manifest document...");
    
    const newManifest = new Manifest({
      manifestNumber,
      accountCode: customer.code,
      awbNumbers,
      status: "pending",
    });

    await newManifest.save();
    console.log(`   ✅ Manifest document saved`);

    // ===== STEP 8: Update Shipment records =====
    console.log("\n🔍 Step 7: Updating shipment records...");
    
    const updateResult = await Shipment.updateMany(
      { awbNo: { $in: awbNumbers }, accountCode: customer.code },
      {
        $set: {
          manifestNo: manifestNumber,
          status: "Manifest Created",
        }
      }
    );

    console.log(`   ✅ Updated ${updateResult.modifiedCount} shipment record(s)`);

    console.log(`\n✅ Manifest created successfully: ${manifestNumber}`);
    console.log(`   AWBs: ${awbNumbers.join(', ')}`);
    console.log(`   Pieces: ${totalPieces}, Weight: ${totalWeight.toFixed(2)} kg\n`);

    // ===== RESPONSE =====
    const response = {
      success: true,
      data: {
        manifestNumber: manifestNumber,
        awbCount: awbNumbers.length,
        totalPieces: totalPieces,
        totalWeight: parseFloat(totalWeight.toFixed(2)),
        status: "pending",
        createdAt: newManifest.createdAt,
        awbNumbers: awbNumbers
      },
      meta: {
        apiVersion: "v1",
        endpoint: "/manifest/create",
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
        customer: {
          code: customer.code,
          name: customer.name,
        },
        usage: {
          remaining: {
            hourly: apiKey.rateLimit.requestsPerHour - usage.hourly,
            daily: apiKey.rateLimit.requestsPerDay - usage.daily,
          }
        }
      }
    };

    return NextResponse.json(
      response,
      { 
        status: 201,
        headers: getRateLimitHeaders(apiKey, usage)
      }
    );

  } catch (error) {
    console.error("\n❌ Create Manifest API Error:", error);
    console.error("   Error stack:", error.stack);
    
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: "An error occurred while creating manifest",
        code: "INTERNAL_ERROR",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// Helper functions
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function getRateLimitHeaders(apiKey, usage) {
  return {
    'X-Rate-Limit-Hourly': apiKey.rateLimit.requestsPerHour.toString(),
    'X-Rate-Limit-Remaining-Hourly': (apiKey.rateLimit.requestsPerHour - usage.hourly).toString(),
    'X-Rate-Limit-Daily': apiKey.rateLimit.requestsPerDay.toString(),
    'X-Rate-Limit-Remaining-Daily': (apiKey.rateLimit.requestsPerDay - usage.daily).toString(),
  };
}