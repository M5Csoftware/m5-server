import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import ShipperTariff from "@/app/model/ShipperTariff";

export async function GET(req) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const customerCode = searchParams.get("customerCode");
  const rateTariff = searchParams.get("rateTariff");
  const service = searchParams.get("service");

  if (!customerCode || !rateTariff || !service) {
    return NextResponse.json("", { status: 200 });
  }

  try {
    console.log("Fetching country for:", {
      customerCode,
      rateTariff: `"${rateTariff}"`,
      service: `"${service}"`,
    });

    // Find the ShipperTariff document for this customer
    const shipperTariff = await ShipperTariff.findOne(
      { accountCode: customerCode },
      { ratesApplicable: 1 },
    ).lean();

    if (!shipperTariff?.ratesApplicable?.length) {
      console.log("No ratesApplicable found");
      return NextResponse.json("", { status: 200 });
    }

    console.log(
      `Found ${shipperTariff.ratesApplicable.length} ratesApplicable items`,
    );

    // DEBUG: Log first few items to see structure
    console.log(
      "First 3 ratesApplicable items:",
      shipperTariff.ratesApplicable.slice(0, 3),
    );

    // Find the specific rate tariff AND service combination
    // Your data shows rateTariff has a tab at the end: "111201 DEL AGNT GST 20241201\t"
    const selectedRate = shipperTariff.ratesApplicable.find((rate) => {
      const rateTariffTrimmed = rate.rateTariff?.trim() || "";
      const serviceTrimmed = rate.service?.trim() || "";
      const searchRateTariff = rateTariff.trim();
      const searchService = service.trim();

      console.log(
        `Comparing: rateTariff="${rateTariffTrimmed}" with "${searchRateTariff}"`,
      );
      console.log(
        `Comparing: service="${serviceTrimmed}" with "${searchService}"`,
      );

      return (
        rateTariffTrimmed === searchRateTariff &&
        serviceTrimmed === searchService
      );
    });

    if (!selectedRate) {
      console.log(
        `No exact match found for rateTariff: "${rateTariff.trim()}" and service: "${service.trim()}"`,
      );

      // Try partial match (service only) as fallback
      const serviceMatch = shipperTariff.ratesApplicable.find((rate) => {
        const serviceTrimmed = rate.service?.trim() || "";
        return serviceTrimmed === service.trim();
      });

      if (serviceMatch) {
        console.log("Found service match (fallback):", serviceMatch.sector);
        return NextResponse.json(serviceMatch.sector?.trim() || "", {
          status: 200,
        });
      }

      console.log("No service match found either");
      return NextResponse.json("", { status: 200 });
    }

    // Return the sector (country) if found
    const country = selectedRate.sector?.trim() || "";
    console.log("✅ Found country:", country);

    return NextResponse.json(country, { status: 200 });
  } catch (error) {
    console.error("Error fetching country:", error);
    return NextResponse.json(
      { error: "Failed to fetch country: " + error.message },
      { status: 500 },
    );
  }
}
