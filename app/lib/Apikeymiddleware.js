import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import ApiKey from "@/app/model/portal/ApiKey";
import { hashApiKey, isValidApiKeyFormat } from "./Apikeyutils";

/**
 * Middleware to validate API key for protected routes
 * Usage in your API routes:
 * 
 * import { validateApiKey } from "@/app/lib/apiKeyMiddleware";
 * 
 * export async function GET(req) {
 *   const validation = await validateApiKey(req);
 *   if (!validation.valid) {
 *     return validation.response;
 *   }
 *   const { apiKey, customer } = validation.data;
 *   // Your API logic here...
 * }
 */
export async function validateApiKey(req, options = {}) {
    try {
        await connectDB();

        // Extract API key from headers or query params
        const apiKeyFromHeader = req.headers.get("X-API-Key") || req.headers.get("Authorization")?.replace("Bearer ", "");
        const { searchParams } = new URL(req.url);
        const apiKeyFromQuery = searchParams.get("apiKey") || searchParams.get("key");
        
        const providedKey = apiKeyFromHeader || apiKeyFromQuery;

        // Check if key is provided
        if (!providedKey) {
            return {
                valid: false,
                response: NextResponse.json(
                    { 
                        error: "API key is required",
                        message: "Please provide your API key in the 'X-API-Key' header or 'apiKey' query parameter",
                        code: "MISSING_API_KEY"
                    },
                    { status: 401 }
                )
            };
        }

        // Validate key format
        if (!isValidApiKeyFormat(providedKey)) {
            return {
                valid: false,
                response: NextResponse.json(
                    { 
                        error: "Invalid API key format",
                        message: "The provided API key format is invalid",
                        code: "INVALID_KEY_FORMAT"
                    },
                    { status: 401 }
                )
            };
        }

        // Hash the provided key
        const hashedProvidedKey = hashApiKey(providedKey);

        // Find the API key in database
        const apiKeyRecord = await ApiKey.findOne({ hashedKey: hashedProvidedKey });

        if (!apiKeyRecord) {
            return {
                valid: false,
                response: NextResponse.json(
                    { 
                        error: "Invalid API key",
                        message: "The provided API key does not exist or has been revoked",
                        code: "INVALID_KEY"
                    },
                    { status: 401 }
                )
            };
        }

        // Check if key is active
        if (apiKeyRecord.status !== "active") {
            return {
                valid: false,
                response: NextResponse.json(
                    { 
                        error: "API key is not active",
                        message: `This API key has been ${apiKeyRecord.status}`,
                        code: "KEY_NOT_ACTIVE",
                        status: apiKeyRecord.status
                    },
                    { status: 403 }
                )
            };
        }

        // Check if key is expired
        if (apiKeyRecord.isExpired()) {
            // Update status to expired
            apiKeyRecord.status = "expired";
            await apiKeyRecord.save();

            return {
                valid: false,
                response: NextResponse.json(
                    { 
                        error: "API key expired",
                        message: "Your API key has expired. Please contact support for a new key",
                        code: "KEY_EXPIRED",
                        expiredAt: apiKeyRecord.expiresAt
                    },
                    { status: 403 }
                )
            };
        }

        // Check rate limits
        const rateLimitCheck = apiKeyRecord.isRateLimitExceeded();
        if (rateLimitCheck.exceeded) {
            return {
                valid: false,
                response: NextResponse.json(
                    { 
                        error: "Rate limit exceeded",
                        message: `You have exceeded the ${rateLimitCheck.type} rate limit`,
                        code: "RATE_LIMIT_EXCEEDED",
                        limit: rateLimitCheck.type === "hourly" 
                            ? apiKeyRecord.rateLimit.requestsPerHour 
                            : apiKeyRecord.rateLimit.requestsPerDay,
                        resetAt: rateLimitCheck.type === "hourly"
                            ? apiKeyRecord.usage.hourlyResetAt
                            : apiKeyRecord.usage.dailyResetAt
                    },
                    { status: 429 }
                )
            };
        }

        // Check if endpoint is allowed (if requiredEndpoint is provided)
        if (options.requiredEndpoint && options.requiredMethod) {
            const isAllowed = apiKeyRecord.isEndpointAllowed(
                options.requiredMethod, 
                options.requiredEndpoint
            );
            
            if (!isAllowed) {
                return {
                    valid: false,
                    response: NextResponse.json(
                        { 
                            error: "Endpoint not authorized",
                            message: "Your API key does not have access to this endpoint",
                            code: "ENDPOINT_NOT_AUTHORIZED",
                            allowedEndpoints: apiKeyRecord.allowedApis.map(api => ({
                                name: api.name,
                                method: api.method,
                                endpoint: api.endpoint
                            }))
                        },
                        { status: 403 }
                    )
                };
            }
        }

        // Check IP whitelist (if configured)
        if (apiKeyRecord.ipWhitelist && apiKeyRecord.ipWhitelist.length > 0) {
            const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                            req.headers.get("x-real-ip") ||
                            "unknown";
            
            if (!apiKeyRecord.ipWhitelist.includes(clientIp)) {
                return {
                    valid: false,
                    response: NextResponse.json(
                        { 
                            error: "IP not whitelisted",
                            message: "Your IP address is not authorized to use this API key",
                            code: "IP_NOT_WHITELISTED"
                        },
                        { status: 403 }
                    )
                };
            }
        }

        // Increment usage counter
        await apiKeyRecord.incrementUsage();

        // Return success with API key data
        return {
            valid: true,
            data: {
                apiKey: apiKeyRecord,
                customer: {
                    code: apiKeyRecord.customerCode,
                    name: apiKeyRecord.customerName,
                    email: apiKeyRecord.email,
                },
                usage: {
                    total: apiKeyRecord.usage.totalRequests,
                    hourly: apiKeyRecord.usage.requestsThisHour,
                    daily: apiKeyRecord.usage.requestsToday,
                    lastUsed: apiKeyRecord.usage.lastUsedAt,
                },
                limits: {
                    hourly: apiKeyRecord.rateLimit.requestsPerHour,
                    daily: apiKeyRecord.rateLimit.requestsPerDay,
                }
            }
        };

    } catch (error) {
        console.error("API Key Validation Error:", error);
        return {
            valid: false,
            response: NextResponse.json(
                { 
                    error: "Internal server error",
                    message: "An error occurred while validating your API key",
                    code: "VALIDATION_ERROR"
                },
                { status: 500 }
            )
        };
    }
}

/**
 * Helper function to extract error details for logging
 */
export function getValidationErrorDetails(validationResult) {
    if (validationResult.valid) return null;
    
    try {
        const responseClone = validationResult.response.clone();
        return responseClone.json();
    } catch (error) {
        return { error: "Failed to extract error details" };
    }
}

export default validateApiKey;