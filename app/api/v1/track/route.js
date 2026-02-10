import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import {validateApiKey} from "@/app/lib/Apikeymiddleware";
import EventActivity from "@/app/model/EventActivity";
import Shipment from "@/app/model/portal/Shipment";

/**
 * Track Shipment API
 * GET /api/v1/track
 * 
 * This endpoint fetches real tracking data from EventActivity collection:
 * 1. Validate API key
 * 2. Check rate limits
 * 3. Verify endpoint permissions
 * 4. Fetch tracking data from database
 * 5. Return formatted response
 * 
 * Usage:
 * curl -X GET "http://localhost:3000/api/v1/track?awb=123456" \
 *   -H "X-API-Key: sk_live_abc123..."
 */

await connectDB();

export async function GET(req) {
    try {
        // Step 1: Validate API key with endpoint-specific permissions
        const validation = await validateApiKey(req, {
            requiredEndpoint: "/v1/track",
            requiredMethod: "GET"
        });

        // If validation failed, return the error response
        if (!validation.valid) {
            return validation.response;
        }

        // Extract validated data
        const { apiKey, customer, usage } = validation.data;

        // Step 2: Extract query parameters
        const { searchParams } = new URL(req.url);
        const awb = searchParams.get("awb") || searchParams.get("awbNo");

        if (!awb) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing required parameter",
                    message: "Please provide an AWB (Air Waybill) number using 'awb' or 'awbNo' parameter",
                    code: "MISSING_AWB"
                },
                { status: 400 }
            );
        }

        // Step 3: Fetch tracking data from database
        const trackingData = await getTrackingData(awb, customer.code);

        if (!trackingData) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Shipment not found",
                    message: `No tracking information found for AWB: ${awb}`,
                    code: "AWB_NOT_FOUND"
                },
                { status: 404 }
            );
        }

        // Step 4: Return successful response with tracking data
        return NextResponse.json(
            {
                success: true,
                data: trackingData,
                meta: {
                    apiVersion: "v1",
                    endpoint: "/track",
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
                    'X-Rate-Limit-Hourly': apiKey.rateLimit.requestsPerHour.toString(),
                    'X-Rate-Limit-Remaining-Hourly': (apiKey.rateLimit.requestsPerHour - usage.hourly).toString(),
                    'X-Rate-Limit-Daily': apiKey.rateLimit.requestsPerDay.toString(),
                    'X-Rate-Limit-Remaining-Daily': (apiKey.rateLimit.requestsPerDay - usage.daily).toString(),
                }
            }
        );

    } catch (error) {
        console.error("Track API Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Internal server error",
                message: "An error occurred while processing your request",
                code: "INTERNAL_ERROR",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            },
            { status: 500 }
        );
    }
}

/**
 * Get tracking data for an AWB from EventActivity collection
 */
async function getTrackingData(awb, customerCode) {
    try {
        // Fetch event activity data
        const eventActivity = await EventActivity.findOne({ awbNo: awb });
        
        if (!eventActivity) {
            return null;
        }

        // Fetch shipment data (if exists)
        const shipment = await Shipment.findOne({ awbNo: awb });

        // Get the latest status (last element in arrays)
        const latestIndex = eventActivity.eventCode.length - 1;
        const latestStatus = eventActivity.status[latestIndex] || "UNKNOWN";
        const latestLocation = eventActivity.eventLocation[latestIndex] || "";
        const latestDate = eventActivity.eventDate[latestIndex] || new Date();

        // Build events history from arrays
        const events = [];
        for (let i = 0; i < eventActivity.eventCode.length; i++) {
            events.push({
                eventCode: eventActivity.eventCode[i] || "",
                status: eventActivity.status[i] || "",
                description: getStatusDescription(eventActivity.status[i]),
                location: eventActivity.eventLocation[i] || "",
                date: eventActivity.eventDate[i] || null,
                time: eventActivity.eventTime[i] || "",
                timestamp: eventActivity.eventDate[i] ? 
                    new Date(eventActivity.eventDate[i]).toISOString() : 
                    eventActivity.eventLogTime[i]?.toISOString() || new Date().toISOString(),
                user: eventActivity.eventUser[i] || "",
                remarks: `Event logged at ${eventActivity.eventLocation[i] || 'unknown location'}`
            });
        }

        // Sort events by date (oldest first)
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Determine origin and destination from events
        const firstEvent = events[0];
        const originLocation = parseLocation(firstEvent?.location || "");
        
        // Try to get destination from shipment or use last known location
        let destinationLocation = { city: "", state: "", country: "India", pincode: "" };
        if (shipment?.destination) {
            destinationLocation = parseLocation(shipment.destination);
        } else if (events.length > 1) {
            destinationLocation = parseLocation(events[events.length - 1].location);
        }

        // Build response
        return {
            awbNo: awb,
            status: latestStatus,
            statusDescription: getStatusDescription(latestStatus),
            trackingHistory: events,
            currentLocation: {
                location: latestLocation,
                ...parseLocation(latestLocation),
                timestamp: new Date(latestDate).toISOString()
            },
            origin: originLocation,
            destination: destinationLocation,
            shipmentDetails: shipment ? {
                weight: shipment.weight || null,
                weightUnit: shipment.weightUnit || "kg",
                packageCount: shipment.packageCount || 1,
                serviceType: shipment.serviceType || null,
                paymentMode: shipment.paymentMode || null,
                declaredValue: shipment.declaredValue || null
            } : null,
            sender: shipment?.sender ? {
                name: shipment.sender.name || "",
                contact: shipment.sender.contact || "",
                address: shipment.sender.address || ""
            } : null,
            receiver: shipment?.receiver ? {
                name: shipment.receiver.name || "",
                contact: shipment.receiver.contact || "",
                address: shipment.receiver.address || ""
            } : null,
            estimatedDelivery: calculateEstimatedDelivery(latestStatus, latestDate),
            createdAt: eventActivity.createdAt || events[0]?.timestamp,
            updatedAt: eventActivity.updatedAt || new Date().toISOString(),
            totalEvents: events.length
        };

    } catch (error) {
        console.error("Error fetching tracking data:", error);
        throw error;
    }
}

/**
 * Parse location string into structured format
 * Example: "Mumbai, Maharashtra" -> { city: "Mumbai", state: "Maharashtra" }
 */
function parseLocation(locationStr) {
    if (!locationStr || typeof locationStr !== 'string') {
        return { city: "", state: "", country: "India", pincode: "" };
    }

    const parts = locationStr.split(',').map(p => p.trim());
    
    return {
        city: parts[0] || "",
        state: parts[1] || "",
        country: "India",
        pincode: ""
    };
}

/**
 * Get human-readable status description
 */
function getStatusDescription(status) {
    const statusDescriptions = {
        "PICKED_UP": "Shipment has been picked up from sender",
        "IN_TRANSIT": "Shipment is in transit to destination",
        "OUT_FOR_DELIVERY": "Shipment is out for delivery",
        "DELIVERED": "Shipment has been delivered successfully",
        "DELAYED": "Shipment delivery has been delayed",
        "PENDING": "Shipment is pending processing",
        "CANCELLED": "Shipment has been cancelled",
        "RETURNED": "Shipment is being returned to sender",
        "FAILED": "Delivery attempt failed",
        "ON_HOLD": "Shipment is on hold",
        "RECEIVED": "Shipment received at facility",
        "DISPATCHED": "Shipment dispatched from facility",
        "ARRIVED": "Shipment arrived at destination hub",
        "SORTING": "Shipment is being sorted",
        "LOADED": "Shipment loaded for transport",
        "UNLOADED": "Shipment unloaded at facility"
    };

    return statusDescriptions[status] || status || "Status information not available";
}

/**
 * Calculate estimated delivery date based on status and last update
 */
function calculateEstimatedDelivery(status, lastUpdateDate) {
    if (status === "DELIVERED") {
        return lastUpdateDate;
    }

    const deliveryStatuses = ["OUT_FOR_DELIVERY"];
    const nearDeliveryStatuses = ["ARRIVED", "SORTING"];
    
    let daysToAdd = 3; // Default 3 days
    
    if (deliveryStatuses.includes(status)) {
        daysToAdd = 1; // Next day
    } else if (nearDeliveryStatuses.includes(status)) {
        daysToAdd = 2; // 2 days
    }

    const estimatedDate = new Date(lastUpdateDate);
    estimatedDate.setDate(estimatedDate.getDate() + daysToAdd);
    
    return estimatedDate.toISOString();
}

/**
 * Generate unique request ID for tracking
 */
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}