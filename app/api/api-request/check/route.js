import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import ApiKey from "@/app/model/portal/ApiKey";

/**
 * GET /api/api-key/check
 * Check if an API key exists for a given customerCode
 * 
 * Query Parameters:
 * - customerCode: The customer account code to check
 * 
 * Returns:
 * - exists: boolean - whether an API key exists
 * - apiKey: object - the API key details (if exists)
 * - count: number - number of API keys found for this customer
 */
export async function GET(req) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);
        const customerCode = searchParams.get("customerCode");

        // Validate customerCode parameter
        if (!customerCode) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing customerCode parameter",
                    message: "Please provide a customerCode to check",
                    exists: false
                },
                { status: 400 }
            );
        }

        // Find API keys for this customerCode - UPDATED to match schema field name
        const apiKeys = await ApiKey.find({ 
            customerCode: customerCode, // Changed from accountCode to customerCode
            status: "active" // Updated to match your schema's status field
        }).sort({ createdAt: -1 }); // Get most recent first

        if (apiKeys && apiKeys.length > 0) {
            // API key exists
            return NextResponse.json(
                {
                    success: true,
                    exists: true,
                    count: apiKeys.length,
                    apiKey: {
                        id: apiKeys[0]._id,
                        keyPrefix: apiKeys[0].keyPrefix, // Added from your schema
                        customerCode: apiKeys[0].customerCode,
                        customerName: apiKeys[0].customerName,
                        email: apiKeys[0].email,
                        allowedApis: apiKeys[0].allowedApis,
                        status: apiKeys[0].status,
                        rateLimit: apiKeys[0].rateLimit,
                        expiresAt: apiKeys[0].expiresAt,
                        createdAt: apiKeys[0].createdAt,
                        lastUsedAt: apiKeys[0].usage?.lastUsedAt, // Updated to match your schema
                        usage: apiKeys[0].usage,
                        environment: apiKeys[0].environment
                    }
                },
                { status: 200 }
            );
        } else {
            // No API key found
            return NextResponse.json(
                {
                    success: true,
                    exists: false,
                    count: 0,
                    message: `No active API key found for customer code: ${customerCode}`,
                    apiKey: null
                },
                { status: 200 }
            );
        }

    } catch (error) {
        console.error("API Key Check Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Internal server error",
                message: "An error occurred while checking API key",
                exists: false,
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            },
            { status: 500 }
        );
    }
}