import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import ShipperTariff from "@/app/model/ShipperTariff";

/**
 * GET /api/shipper-tariff
 * Fetch shipper tariff for a specific account code
 * Used by Rate Calculator to get available services
 */
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get("accountCode");

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 },
      );
    }

    console.log("Fetching shipper tariff for account:", accountCode);

    // Find all tariffs for this account
    const tariffs = await ShipperTariff.find({
      accountCode: accountCode.toUpperCase(),
    });

    console.log("Found tariffs:", tariffs.length);

    if (tariffs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No tariffs found for this account",
        },
        { status: 404 },
      );
    }

    // Return the tariffs (frontend will extract ratesApplicable)
    return NextResponse.json(tariffs);
  } catch (error) {
    console.error("Error fetching shipper tariff:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error fetching shipper tariff",
        error: error.message,
      },
      { status: 500 },
    );
  }
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
