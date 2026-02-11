import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import { validateApiKey } from "@/app/lib/Apikeymiddleware";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import AccountLedger from "@/app/model/AccountLedger";
import EventActivity from "@/app/model/EventActivity";
import ChildShipment from "@/app/model/portal/ChildShipment";

/**
 * Shipment Management API
 * 
 * Endpoints:
 * - POST   /api/v1/shipments - Create new shipment
 * - GET    /api/v1/shipments?awb=XXX - Get shipment details
 * - PUT    /api/v1/shipments?awb=XXX - Update shipment
 * - DELETE /api/v1/shipments?awb=XXX - Cancel shipment
 */

await connectDB();

// CORS Headers Helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, X-API-Key',
  };
}

// BALANCE CALCULATION UTILITY FUNCTION
function calculateBalanceAndCredit(balance, credit, amount) {
  let newBalance = balance;
  let newCredit = credit;

  if (balance < 0) {
    const wallet = Math.abs(balance);

    if (wallet >= amount) {
      newBalance = balance + amount;
    } else {
      const creditNeeded = amount - wallet;
      if (credit < creditNeeded) {
        return { insufficient: true };
      }
      newBalance = 0;
      newCredit = credit - creditNeeded;
    }
  } else {
    if (credit < amount) {
      return { insufficient: true };
    }
    newBalance = balance + amount;
    newCredit = credit - amount;
  }

  return { insufficient: false, newBalance, newCredit };
}

/**
 * OPTIONS /api/v1/shipments
 * Handle preflight requests
 */
export async function OPTIONS(req) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: corsHeaders()
    }
  );
}

/**
 * GET /api/v1/shipments
 * Get shipment details by AWB number
 */
export async function GET(req) {
    try {
        // Validate API key
        const validation = await validateApiKey(req, {
            requiredEndpoint: "/v1/shipments",
            requiredMethod: "GET"
        });

        if (!validation.valid) {
            const response = validation.response;
            const body = await response.json();
            return NextResponse.json(body, { 
              status: response.status,
              headers: corsHeaders()
            });
        }

        const { apiKey, customer, usage } = validation.data;

        // Extract query parameters
        const { searchParams } = new URL(req.url);
        const awb = searchParams.get("awb") || searchParams.get("awbNo");
        const runNo = searchParams.get("runNo");

        let shipments;

        if (awb) {
            // Get single shipment by AWB
            shipments = await Shipment.findOne({ 
                awbNo: awb,
                accountCode: customer.code // Filter by customer
            });

            if (!shipments) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Shipment not found",
                        message: `No shipment found with AWB: ${awb}`,
                        code: "SHIPMENT_NOT_FOUND"
                    },
                    { 
                      status: 404,
                      headers: corsHeaders()
                    }
                );
            }
        } else if (runNo) {
            // Get shipments by run number
            shipments = await Shipment.find({ 
                runNo,
                accountCode: customer.code
            });
        } else {
            // Get all shipments for this customer
            shipments = await Shipment.find({ 
                accountCode: customer.code 
            }).sort({ createdAt: -1 }).limit(100);
        }

        return NextResponse.json(
            {
                success: true,
                data: shipments,
                meta: {
                    apiVersion: "v1",
                    endpoint: "/shipments",
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
            },
            { 
                status: 200,
                headers: {
                  ...getRateLimitHeaders(apiKey, usage),
                  ...corsHeaders()
                }
            }
        );

    } catch (error) {
        console.error("GET Shipments API Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Internal server error",
                message: "An error occurred while fetching shipments",
                code: "INTERNAL_ERROR",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            },
            { 
              status: 500,
              headers: corsHeaders()
            }
        );
    }
}

/**
 * POST /api/v1/shipments
 * Create new shipment
 */
export async function POST(req) {
    try {
        // Validate API key
        const validation = await validateApiKey(req, {
            requiredEndpoint: "/v1/shipments",
            requiredMethod: "POST"
        });

        if (!validation.valid) {
            const response = validation.response;
            const body = await response.json();
            return NextResponse.json(body, { 
              status: response.status,
              headers: corsHeaders()
            });
        }

        const { apiKey, customer, usage } = validation.data;

        // Parse request body
        const body = await req.json();

        // Validate required fields - FIXED: Added sector to required fields
        const requiredFields = ['destination', 'payment', 'sector'];
        const missingFields = requiredFields.filter(field => !body[field]);

        if (missingFields.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing required fields",
                    message: "Please provide all required fields",
                    code: "MISSING_FIELDS",
                    fields: missingFields
                },
                { 
                  status: 400,
                  headers: corsHeaders()
                }
            );
        }

        // Get customer account
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
                { 
                  status: 404,
                  headers: corsHeaders()
                }
            );
        }

        // Calculate total amount
        const grandTotal = Number(body.grandTotal || body.totalAmt || 0);
        const currentBalance = Number(customerAccount.leftOverBalance ?? 0);
        const currentCredit = Number(customerAccount.creditLimit ?? 0);

        console.log("Creating shipment - Balance:", currentBalance, "Credit:", currentCredit, "Amount:", grandTotal);

        // Check credit and update balance
        const creditResult = calculateBalanceAndCredit(
            currentBalance,
            currentCredit,
            grandTotal
        );

        let isHold = false;
        let holdReason = "";

        if (creditResult.insufficient) {
            // Put shipment on hold
            isHold = true;
            holdReason = "Credit Limit Exceeded";

            await CustomerAccount.updateOne(
                { _id: customerAccount._id },
                { $inc: { leftOverBalance: grandTotal } }
            );

            customerAccount.leftOverBalance = currentBalance + grandTotal;
        } else {
            // Normal flow - update balance and credit
            customerAccount.leftOverBalance = creditResult.newBalance;
            customerAccount.creditLimit = creditResult.newCredit;
            await customerAccount.save();
        }

        // Generate AWB number if not provided
        let newAwbNo = (body.awbNo || "").trim();

        if (!newAwbNo) {
            const lastShipment = await Shipment.findOne().sort({ createdAt: -1 });

            if (lastShipment?.awbNo) {
                const prefix = lastShipment.awbNo.match(/^[A-Z]+/)?.[0] || "MPL";
                let nextNumber = parseInt(lastShipment.awbNo.replace(/[^0-9]/g, ""), 10) + 1;
                newAwbNo = `${prefix}${String(nextNumber).padStart(7, "0")}`;

                // Check for duplicates in both Shipment and EventActivity collections
                while (
                    await Shipment.findOne({ awbNo: newAwbNo }) || 
                    await EventActivity.findOne({ awbNo: newAwbNo })
                ) {
                    nextNumber++;
                    newAwbNo = `${prefix}${String(nextNumber).padStart(7, "0")}`;
                }
            } else {
                newAwbNo = "MPL0000001";
            }
        } else {
            // Check for duplicate AWB in both collections
            const existsInShipment = await Shipment.findOne({ awbNo: newAwbNo });
            const existsInEventActivity = await EventActivity.findOne({ awbNo: newAwbNo });
            
            if (existsInShipment || existsInEventActivity) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Duplicate AWB",
                        message: `AWB number ${newAwbNo} already exists`,
                        code: "DUPLICATE_AWB"
                    },
                    { 
                      status: 400,
                      headers: corsHeaders()
                    }
                );
            }
        }

        // Prepare event activity data (but don't save yet)
        const eventCode = isHold ? "HOLD" : "SRD";
        const status = isHold ? "Shipment put on Hold" : "Shipment Created";
        const eventLocation = body.origin || "";

        const currentDate = new Date();
        const formattedTime = currentDate.toTimeString().slice(0, 5);

        // Prepare shipment data - FIXED: Ensure sector is always provided
        const shipmentData = {
            awbNo: newAwbNo,
            accountCode: customer.code,
            customer: customer.name,
            date: new Date(),
            sector: body.sector, // FIXED: Required field, now validated above
            destination: body.destination,
            reference: body.reference || "",
            forwardingNo: body.forwardingNo || "",
            goodstype: body.goodstype || "",
            payment: body.payment,
            totalActualWt: Number(body.totalActualWt || 0),
            chargeableWt: Number(body.chargeableWt || 0),
            totalVolWt: Number(body.totalVolWt || 0),
            totalInvoiceValue: Number(body.totalInvoiceValue || 0),
            content: body.content || "",
            operationRemark: body.operationRemark || "",
            isHold: isHold,
            holdReason: holdReason,
            pcs: Number(body.pcs || 0),
            service: body.service || "",
            basicAmt: Number(body.basicAmt || 0),
            cgst: Number(body.cgst || 0),
            sgst: Number(body.sgst || 0),
            igst: Number(body.igst || 0),
            totalAmt: grandTotal,
            
            // Receiver details
            receiverFullName: body.receiverFullName || "",
            receiverPhoneNumber: body.receiverPhoneNumber || "",
            receiverEmail: body.receiverEmail || "",
            receiverAddressLine1: body.receiverAddressLine1 || "",
            receiverAddressLine2: body.receiverAddressLine2 || "",
            receiverCity: body.receiverCity || "",
            receiverState: body.receiverState || "",
            receiverPincode: body.receiverPincode || "",

            // Shipper details
            shipperFullName: body.shipperFullName || "",
            shipperPhoneNumber: body.shipperPhoneNumber || "",
            shipperEmail: body.shipperEmail || "",
            shipperAddressLine1: body.shipperAddressLine1 || "",
            shipperAddressLine2: body.shipperAddressLine2 || "",
            shipperCity: body.shipperCity || "",
            shipperState: body.shipperState || "",
            shipperPincode: body.shipperPincode || "",

            origin: body.origin || "",
            status: status,
            insertUser: "API",
        };

        // Save shipment first
        const shipment = new Shipment(shipmentData);
        const savedShipment = await shipment.save();

        // Now create event activity (only after shipment is saved successfully)
        try {
            const eventActivity = new EventActivity({
                awbNo: newAwbNo,
                eventCode: [eventCode],
                eventDate: [currentDate],
                eventTime: [formattedTime],
                status: [status],
                eventUser: ["API"],
                eventLocation: [eventLocation],
                eventLogTime: [currentDate],
                remark: body.remarks || null,
                receiverName: body.receiverFullName || null,
            });

            await eventActivity.save();
        } catch (eventError) {
            // If event activity fails, log but don't fail the whole request
            console.error("Event Activity creation failed:", eventError);
            // Continue - shipment was created successfully
        }

        // Create account ledger entry
        try {
            const ledgerData = {
                accountCode: customer.code,
                customer: customer.name,
                awbNo: newAwbNo,
                payment: body.payment,
                date: new Date(),
                isHold: isHold,
                operationRemark: body.operationRemark || "",
                leftOverBalance: customerAccount.leftOverBalance,
                sector: body.sector, // FIXED: Ensure sector is included
                destination: body.destination,
                receiverCity: body.receiverCity || "",
                receiverPincode: body.receiverPincode || "",
                pcs: Number(body.pcs || 0),
                totalActualWt: Number(body.totalActualWt || 0),
                totalVolWt: Number(body.totalVolWt || 0),
                basicAmt: Number(body.basicAmt || 0),
                cgst: Number(body.cgst || 0),
                sgst: Number(body.sgst || 0),
                igst: Number(body.igst || 0),
                totalAmt: grandTotal,
                reference: body.reference || "API",
            };

            await new AccountLedger(ledgerData).save();
        } catch (ledgerError) {
            // If ledger fails, log but don't fail the whole request
            console.error("Account Ledger creation failed:", ledgerError);
            // Continue - shipment was created successfully
        }

        return NextResponse.json(
            {
                success: true,
                data: {
                    awbNo: savedShipment.awbNo,
                    status: savedShipment.status,
                    isHold: savedShipment.isHold,
                    holdReason: savedShipment.holdReason,
                    totalAmount: savedShipment.totalAmt,
                    createdAt: savedShipment.createdAt,
                    trackingUrl: `/v1/track?awb=${savedShipment.awbNo}`
                },
                message: "Shipment created successfully",
                meta: {
                    apiVersion: "v1",
                    endpoint: "/shipments",
                    timestamp: new Date().toISOString(),
                    requestId: generateRequestId(),
                    customer: {
                        code: customer.code,
                        name: customer.name,
                        remainingBalance: customerAccount.leftOverBalance,
                        remainingCredit: customerAccount.creditLimit
                    }
                }
            },
            { 
                status: 201,
                headers: {
                  ...getRateLimitHeaders(apiKey, usage),
                  ...corsHeaders()
                }
            }
        );

    } catch (error) {
        console.error("POST Shipments API Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Internal server error",
                message: "An error occurred while creating shipment",
                code: "INTERNAL_ERROR",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            },
            { 
              status: 500,
              headers: corsHeaders()
            }
        );
    }
}

/**
 * PUT /api/v1/shipments?awb=XXX
 * Update existing shipment
 */
export async function PUT(req) {
    try {
        // Validate API key
        const validation = await validateApiKey(req, {
            requiredEndpoint: "/v1/shipments/{id}",
            requiredMethod: "PUT"
        });

        if (!validation.valid) {
            const response = validation.response;
            const body = await response.json();
            return NextResponse.json(body, { 
              status: response.status,
              headers: corsHeaders()
            });
        }

        const { apiKey, customer, usage } = validation.data;

        // Get AWB from query params
        const { searchParams } = new URL(req.url);
        const awb = searchParams.get("awb") || searchParams.get("awbNo");

        if (!awb) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing AWB parameter",
                    message: "Please provide an AWB number",
                    code: "MISSING_AWB"
                },
                { 
                  status: 400,
                  headers: corsHeaders()
                }
            );
        }

        // Get existing shipment
        const shipment = await Shipment.findOne({ 
            awbNo: awb,
            accountCode: customer.code 
        });

        if (!shipment) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Shipment not found",
                    message: `No shipment found with AWB: ${awb}`,
                    code: "SHIPMENT_NOT_FOUND"
                },
                { 
                  status: 404,
                  headers: corsHeaders()
                }
            );
        }

        // Parse request body
        const body = await req.json();

        // Get customer account
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
                { 
                  status: 404,
                  headers: corsHeaders()
                }
            );
        }

        // Handle amount changes
        const oldAmt = Number(shipment.totalAmt || 0);
        const newAmt = Number(body.grandTotal || oldAmt);
        const diff = newAmt - oldAmt;

        if (diff !== 0) {
            if (diff < 0) {
                // Refund flow
                const refund = Math.abs(diff);
                customerAccount.leftOverBalance -= refund;

                if (!shipment.isHold || shipment.holdReason !== "Credit Limit Exceeded") {
                    customerAccount.creditLimit += refund;
                }

                await customerAccount.save();
            } else {
                // Extra charge flow
                if (shipment.isHold && shipment.holdReason === "Credit Limit Exceeded") {
                    customerAccount.leftOverBalance += diff;
                    await customerAccount.save();
                } else {
                    const result = calculateBalanceAndCredit(
                        customerAccount.leftOverBalance,
                        customerAccount.creditLimit,
                        diff
                    );

                    if (result.insufficient) {
                        body.isHold = true;
                        body.holdReason = "Credit Limit Exceeded";
                        customerAccount.leftOverBalance += diff;
                    } else {
                        customerAccount.leftOverBalance = result.newBalance;
                        customerAccount.creditLimit = result.newCredit;
                    }

                    await customerAccount.save();
                }
            }
        }

        // Update ledger
        const ledgerData = {
            accountCode: customer.code,
            customer: customer.name,
            awbNo: awb,
            payment: body.payment || shipment.payment,
            date: new Date(),
            isHold: body.isHold ?? shipment.isHold,
            operationRemark: body.operationRemark || shipment.operationRemark,
            leftOverBalance: customerAccount.leftOverBalance,
            totalAmt: newAmt,
        };

        await AccountLedger.findOneAndUpdate(
            { awbNo: awb },
            ledgerData,
            { new: true, upsert: true }
        );

        // Check for hold status change
        const previousHold = shipment.isHold;
        const newHold = body.isHold ?? previousHold;

        if (previousHold !== newHold) {
            const eventCode = newHold ? "HOLD" : "UNHOLD";
            const status = newHold ? "Shipment put on Hold" : "Shipment Released from Hold";

            const now = new Date();
            const formattedTime = now.toTimeString().slice(0, 5);

            await EventActivity.updateOne(
                { awbNo: awb },
                {
                    $push: {
                        eventCode: eventCode,
                        eventDate: now,
                        eventTime: formattedTime,
                        status: status,
                        eventUser: "API",
                        eventLocation: body.origin || shipment.origin,
                        eventLogTime: now,
                    },
                },
                { upsert: true }
            );
        }

        // Prepare update data
        const updateData = {
            destination: body.destination || shipment.destination,
            payment: body.payment || shipment.payment,
            totalActualWt: Number(body.totalActualWt || shipment.totalActualWt),
            totalVolWt: Number(body.totalVolWt || shipment.totalVolWt),
            isHold: newHold,
            holdReason: body.holdReason || shipment.holdReason,
            totalAmt: newAmt,
            operationRemark: body.operationRemark || shipment.operationRemark,
            updateUser: "API",
        };

        // Update shipment
        const updatedShipment = await Shipment.findOneAndUpdate(
            { awbNo: awb },
            updateData,
            { new: true }
        );

        return NextResponse.json(
            {
                success: true,
                data: {
                    awbNo: updatedShipment.awbNo,
                    status: updatedShipment.status,
                    isHold: updatedShipment.isHold,
                    totalAmount: updatedShipment.totalAmt,
                    updatedAt: updatedShipment.updatedAt
                },
                message: "Shipment updated successfully",
                meta: {
                    apiVersion: "v1",
                    endpoint: "/shipments",
                    timestamp: new Date().toISOString(),
                    requestId: generateRequestId()
                }
            },
            { 
                status: 200,
                headers: {
                  ...getRateLimitHeaders(apiKey, usage),
                  ...corsHeaders()
                }
            }
        );

    } catch (error) {
        console.error("PUT Shipments API Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Internal server error",
                message: "An error occurred while updating shipment",
                code: "INTERNAL_ERROR",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            },
            { 
              status: 500,
              headers: corsHeaders()
            }
        );
    }
}

/**
 * DELETE /api/v1/shipments?awb=XXX
 * Cancel shipment
 */
export async function DELETE(req) {
    try {
        // Validate API key
        const validation = await validateApiKey(req, {
            requiredEndpoint: "/v1/shipments/{id}",
            requiredMethod: "DELETE"
        });

        if (!validation.valid) {
            const response = validation.response;
            const body = await response.json();
            return NextResponse.json(body, { 
              status: response.status,
              headers: corsHeaders()
            });
        }

        const { apiKey, customer, usage } = validation.data;

        // Get AWB from query params
        const { searchParams } = new URL(req.url);
        const awb = searchParams.get("awb") || searchParams.get("awbNo");

        if (!awb) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing AWB parameter",
                    message: "Please provide an AWB number",
                    code: "MISSING_AWB"
                },
                { 
                  status: 400,
                  headers: corsHeaders()
                }
            );
        }

        // Get existing shipment
        const shipment = await Shipment.findOne({ 
            awbNo: awb,
            accountCode: customer.code 
        });

        if (!shipment) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Shipment not found",
                    message: `No shipment found with AWB: ${awb}`,
                    code: "SHIPMENT_NOT_FOUND"
                },
                { 
                  status: 404,
                  headers: corsHeaders()
                }
            );
        }

        // Get customer account
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
                { 
                  status: 404,
                  headers: corsHeaders()
                }
            );
        }

        // Refund logic
        const refundAmount = Number(shipment.totalAmt || 0);

        // Always rollback wallet
        customerAccount.leftOverBalance -= refundAmount;

        // Restore credit only if it was consumed
        if (customerAccount.leftOverBalance > 0) {
            const creditRestore = Math.min(refundAmount, customerAccount.leftOverBalance);
            customerAccount.creditLimit += creditRestore;
            customerAccount.leftOverBalance -= creditRestore;
        }

        await customerAccount.save();

        // Delete ledger entries
        await AccountLedger.deleteMany({ awbNo: awb });

        // Delete child shipments
        await ChildShipment.deleteMany({ masterAwbNo: awb });

        // Add cancellation event
        const now = new Date();
        const formattedTime = now.toTimeString().slice(0, 5);

        await EventActivity.updateOne(
            { awbNo: awb },
            {
                $push: {
                    eventCode: "CANCELLED",
                    eventDate: now,
                    eventTime: formattedTime,
                    status: "Shipment Cancelled",
                    eventUser: "API",
                    eventLocation: shipment.origin || "",
                    eventLogTime: now,
                },
            },
            { upsert: true }
        );

        // Delete shipment
        await Shipment.deleteOne({ awbNo: awb });

        return NextResponse.json(
            {
                success: true,
                data: {
                    awbNo: awb,
                    refundAmount: refundAmount,
                    cancelledAt: new Date().toISOString()
                },
                message: "Shipment cancelled and refund applied successfully",
                meta: {
                    apiVersion: "v1",
                    endpoint: "/shipments",
                    timestamp: new Date().toISOString(),
                    requestId: generateRequestId(),
                    customer: {
                        code: customer.code,
                        remainingBalance: customerAccount.leftOverBalance,
                        remainingCredit: customerAccount.creditLimit
                    }
                }
            },
            { 
                status: 200,
                headers: {
                  ...getRateLimitHeaders(apiKey, usage),
                  ...corsHeaders()
                }
            }
        );

    } catch (error) {
        console.error("DELETE Shipments API Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Internal server error",
                message: "An error occurred while cancelling shipment",
                code: "INTERNAL_ERROR",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            },
            { 
              status: 500,
              headers: corsHeaders()
            }
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