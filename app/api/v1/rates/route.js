import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import { validateApiKey } from "@/app/lib/Apikeymiddleware";
import CustomerAccount from "@/app/model/CustomerAccount";
import ShipperTariff from "@/app/model/ShipperTariff";
import Zone from "@/app/model/Zone";
import RateSheet from "@/app/model/RateSheet";

/**
 * Get Rate API
 * GET /api/v1/rates
 * 
 * Query Parameters:
 * - sector: Origin sector (e.g., "DEL", "UK")
 * - destination: Destination location (e.g., "Mumbai", "London")
 * - service: Service name (e.g., "Express", "Premium")
 * - weight: Chargeable weight in kg (e.g., 5.5)
 * - actualWeight: Actual weight in kg (optional)
 * - volumetricWeight: Volumetric weight in kg (optional)
 * 
 * Usage:
 * curl -X GET "http://localhost:3000/api/v1/rates?sector=DEL&destination=Mumbai&service=Express&weight=5.5" \
 *   -H "X-API-Key: sk_live_abc123..."
 */

await connectDB();

// Helper function to calculate GST
const calculateGST = (basicAmount, shipmentSector, customerBranchCode) => {
    const defaultCGSTRate = 0.09; // 9%
    const defaultSGSTRate = 0.09; // 9%
    const defaultIGSTRate = 0.18; // 18%

    const isInterstate = shipmentSector !== customerBranchCode;

    let sgst = 0, cgst = 0, igst = 0;

    if (isInterstate) {
        igst = basicAmount * defaultIGSTRate;
    } else {
        cgst = basicAmount * defaultCGSTRate;
        sgst = basicAmount * defaultSGSTRate;
    }

    return {
        sgst: parseFloat(sgst.toFixed(2)),
        cgst: parseFloat(cgst.toFixed(2)),
        igst: parseFloat(igst.toFixed(2)),
    };
};

// Helper function to get rate from RateSheet
const getRateFromRateSheet = async (rateTariffId, service, zoneNumber, chargeableWt) => {
    try {
        console.log(`🔍 Looking up rate in RateSheet:`, {
            shipper: rateTariffId,
            service,
            zone: zoneNumber,
            weight: chargeableWt,
        });

        const rateSheets = await RateSheet.find({
            shipper: rateTariffId,
            service: service,
            minWeight: { $lte: chargeableWt },
            maxWeight: { $gte: chargeableWt },
        }).sort({ minWeight: 1 });

        console.log(`   Found ${rateSheets.length} matching rate sheet(s)`);

        if (rateSheets.length === 0) {
            console.error(`❌ No rate sheet found for weight ${chargeableWt}`);
            return null;
        }

        const rateSheet = rateSheets[0];
        const zoneKey = zoneNumber.toString();
        const rate = rateSheet[zoneKey];

        console.log(`   Rate for Zone ${zoneNumber}: ${rate}`);

        if (rate === undefined || rate === null) {
            console.error(`❌ No rate found for zone ${zoneNumber} in rate sheet`);
            return null;
        }

        return parseFloat(rate) || 0;
    } catch (error) {
        console.error("Error getting rate from RateSheet:", error);
        return null;
    }
};

export async function GET(req) {
    try {
        // Validate API key
        const validation = await validateApiKey(req, {
            requiredEndpoint: "/v1/rates",
            requiredMethod: "GET"
        });

        if (!validation.valid) {
            return validation.response;
        }

        const { apiKey, customer, usage } = validation.data;

        // Extract query parameters
        const { searchParams } = new URL(req.url);
        const sector = searchParams.get("sector");
        const destination = searchParams.get("destination");
        const service = searchParams.get("service");
        const weight = searchParams.get("weight");
        const actualWeight = searchParams.get("actualWeight");
        const volumetricWeight = searchParams.get("volumetricWeight");

        console.log(`📋 Rate request from ${customer.code}:`, {
            sector,
            destination,
            service,
            weight
        });

        // Validate required parameters
        if (!sector || !destination || !service || !weight) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing required parameters",
                    message: "Please provide sector, destination, service, and weight",
                    code: "MISSING_PARAMETERS",
                    required: ["sector", "destination", "service", "weight"]
                },
                { status: 400 }
            );
        }

        // Parse and validate weight
        const chargeableWt = parseFloat(weight);
        if (isNaN(chargeableWt) || chargeableWt <= 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Invalid weight",
                    message: "Weight must be a positive number",
                    code: "INVALID_WEIGHT"
                },
                { status: 400 }
            );
        }

        // Get customer details
        const customerAccount = await CustomerAccount.findOne({
            accountCode: customer.code
        });

        if (!customerAccount) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Customer account not found",
                    code: "CUSTOMER_NOT_FOUND"
                },
                { status: 404 }
            );
        }

        // STEP 1: Find Shipper Tariff
        console.log("🔍 Step 1: Looking for shipper tariff...");
        
        const currentDate = new Date();
        const shipperTariffs = await ShipperTariff.find({
            accountCode: customer.code,
            "ratesApplicable.service": {
                $regex: new RegExp(`^${service.trim()}$`, "i")
            },
            "ratesApplicable.from": { $lte: currentDate },
            "ratesApplicable.to": { $gte: currentDate },
        });

        if (shipperTariffs.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: "No tariff found",
                    message: `No active tariff found for service: ${service}`,
                    code: "TARIFF_NOT_FOUND"
                },
                { status: 404 }
            );
        }

        // Extract matching rate tariff
        let rateTariff = null;
        for (const doc of shipperTariffs) {
            for (const rate of doc.ratesApplicable) {
                if (
                    rate.from <= currentDate &&
                    rate.to >= currentDate &&
                    rate.service.trim().toUpperCase() === service.trim().toUpperCase() &&
                    rate.sector.trim().toUpperCase() === sector.trim().toUpperCase()
                ) {
                    rateTariff = {
                        accountCode: doc.accountCode,
                        service: rate.service,
                        sector: rate.sector,
                        rateTariff: rate.rateTariff,
                        zoneMatrix: rate.zoneMatrix,
                        network: rate.network,
                        mode: rate.mode,
                    };
                    break;
                }
            }
            if (rateTariff) break;
        }

        if (!rateTariff) {
            return NextResponse.json(
                {
                    success: false,
                    error: "No matching tariff",
                    message: `No tariff found for sector: ${sector}, service: ${service}`,
                    code: "TARIFF_SECTOR_MISMATCH"
                },
                { status: 404 }
            );
        }

        console.log("✅ Tariff found:", rateTariff);

        // STEP 2: Find Zone
        console.log("🔍 Step 2: Looking for zone...");

        const zone = await Zone.findOne({
            zoneMatrix: rateTariff.zoneMatrix,
            sector: { $regex: new RegExp(`^${sector.trim()}$`, "i") },
            destination: { $regex: new RegExp(`^${destination.trim()}$`, "i") },
            service: { $regex: new RegExp(`^${service.trim()}$`, "i") },
            effectiveDateFrom: { $lte: currentDate },
            effectiveDateTo: { $gte: currentDate },
        });

        if (!zone) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Zone not found",
                    message: `No zone found for ${sector} → ${destination} (${service})`,
                    code: "ZONE_NOT_FOUND",
                    details: {
                        sector,
                        destination,
                        service,
                        zoneMatrix: rateTariff.zoneMatrix
                    }
                },
                { status: 404 }
            );
        }

        const zoneNumber = parseInt(zone.zone);
        console.log("✅ Zone found:", zoneNumber);

        // STEP 3: Get Rate from RateSheet
        console.log("🔍 Step 3: Getting rate from RateSheet...");

        const rate = await getRateFromRateSheet(
            rateTariff.rateTariff,
            service,
            zoneNumber,
            chargeableWt
        );

        if (rate === null || rate === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Rate not found",
                    message: `No rate available for weight ${chargeableWt}kg in zone ${zoneNumber}`,
                    code: "RATE_NOT_FOUND",
                    details: {
                        zone: zoneNumber,
                        weight: chargeableWt,
                        service
                    }
                },
                { status: 404 }
            );
        }

        console.log("✅ Rate found:", rate);

        // STEP 4: Calculate Charges
        console.log("🔍 Step 4: Calculating charges...");

        const basicAmt = rate * chargeableWt;
        const { sgst, cgst, igst } = calculateGST(
            basicAmt,
            sector,
            customerAccount.branch || "DEL"
        );

        const totalAmt = basicAmt + sgst + cgst + igst;

        console.log("✅ Calculation complete:", {
            basicAmt,
            sgst,
            cgst,
            igst,
            totalAmt
        });

        // Build response
        const response = {
            success: true,
            data: {
                quote: {
                    basicAmount: parseFloat(basicAmt.toFixed(2)),
                    cgst: cgst,
                    sgst: sgst,
                    igst: igst,
                    totalAmount: parseFloat(totalAmt.toFixed(2)),
                    currency: "INR"
                },
                shipment: {
                    sector: sector,
                    destination: destination,
                    service: service,
                    chargeableWeight: chargeableWt,
                    actualWeight: actualWeight ? parseFloat(actualWeight) : null,
                    volumetricWeight: volumetricWeight ? parseFloat(volumetricWeight) : null,
                    zone: zoneNumber,
                    ratePerKg: rate
                },
                tariff: {
                    rateTariffId: rateTariff.rateTariff,
                    zoneMatrix: rateTariff.zoneMatrix,
                    network: rateTariff.network,
                    mode: rateTariff.mode
                },
                customerBalance: {
                    availableBalance: customerAccount.leftOverBalance || 0,
                    creditLimit: customerAccount.creditLimit || 0,
                    canAfford: (customerAccount.leftOverBalance || 0) >= totalAmt
                }
            },
            meta: {
                apiVersion: "v1",
                endpoint: "/rates",
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
                status: 200,
                headers: getRateLimitHeaders(apiKey, usage)
            }
        );

    } catch (error) {
        console.error("❌ Get Rate API Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Internal server error",
                message: "An error occurred while calculating rate",
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