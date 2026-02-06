import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import ShipperTariff from "@/app/model/ShipperTariff";
import Zone from "@/app/model/Zone";
import RateSheet from "@/app/model/RateSheet";

connectDB();

const calculateGST = (basicAmount, shipmentSector, customerBranchCode) => {
  const defaultCGSTRate = 0.09; // 9%
  const defaultSGSTRate = 0.09; // 9%
  const defaultIGSTRate = 0.18; // 18%

  const isInterstate = shipmentSector !== customerBranchCode;

  let sgst = 0,
    cgst = 0,
    igst = 0;

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

/**
 * Find the correct rate from RateSheet based on weight
 * @param {string} rateTariffId - The shipper/rateTariff ID (e.g., "10126001 DEL AGNT GST 20260105")
 * @param {string} service - Service name
 * @param {number} zoneNumber - Zone number (1-35)
 * @param {number} chargeableWt - Chargeable weight
 * @returns {Promise<number>} - The rate for the given zone and weight
 */
const getRateFromRateSheet = async (
  rateTariffId,
  service,
  zoneNumber,
  chargeableWt,
) => {
  try {
    console.log(`🔍 Looking up rate in RateSheet:`, {
      shipper: rateTariffId,
      service,
      zone: zoneNumber,
      weight: chargeableWt,
    });

    // Find all rate sheets for this tariff and service
    const rateSheets = await RateSheet.find({
      shipper: rateTariffId,
      service: service,
      minWeight: { $lte: chargeableWt },
      maxWeight: { $gte: chargeableWt },
    }).sort({ minWeight: 1 });

    console.log(`   Found ${rateSheets.length} matching rate sheet(s)`);

    if (rateSheets.length === 0) {
      console.error(`❌ No rate sheet found for weight ${chargeableWt}`);

      // Try to find any rate sheets for this shipper/service to help debug
      const anyRateSheets = await RateSheet.find({
        shipper: rateTariffId,
        service: service,
      }).limit(3);

      if (anyRateSheets.length > 0) {
        console.error(`   Available weight ranges for this tariff:`);
        anyRateSheets.forEach((rs) => {
          console.error(`      ${rs.minWeight} - ${rs.maxWeight}`);
        });
      }

      return 0;
    }

    // Get the first matching rate sheet (they're sorted by minWeight)
    const rateSheet = rateSheets[0];

    // The zone number is the key in the rateSheet document
    const zoneKey = zoneNumber.toString();
    const rate = rateSheet[zoneKey];

    console.log(`   Rate for Zone ${zoneNumber}: ${rate}`);

    if (rate === undefined || rate === null) {
      console.error(`❌ No rate found for zone ${zoneNumber} in rate sheet`);
      return 0;
    }

    return parseFloat(rate) || 0;
  } catch (error) {
    console.error("Error getting rate from RateSheet:", error);
    return 0;
  }
};

/**
 * POST /api/portal/bulk-upload/calculate-rates
 * Calculate rates for bulk upload shipments
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { shipments, accountCode } = body;

    console.log("Rate calculation request received:", {
      totalShipments: shipments?.length,
      accountCode,
    });

    // Validate input
    if (!shipments || !Array.isArray(shipments) || shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments data provided" },
        { status: 400 },
      );
    }

    if (!accountCode || accountCode.trim() === "") {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 },
      );
    }

    // Get customer details
    const customer = await CustomerAccount.findOne({
      accountCode: accountCode.toUpperCase(),
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found" },
        { status: 400 },
      );
    }

    // Get all unique services from shipments
    const uniqueServices = [
      ...new Set(
        shipments
          .map((s) => s.service)
          .filter((service) => service && service.trim() !== ""),
      ),
    ];

    console.log("Unique services:", uniqueServices);

    // Query the nested ratesApplicable array with date range check
    const currentDate = new Date();
    const shipperTariffs = await ShipperTariff.find({
      accountCode: accountCode.toUpperCase(),
      "ratesApplicable.service": {
        $in: uniqueServices.map((s) => new RegExp(`^${s.trim()}$`, "i")),
      },
      "ratesApplicable.from": { $lte: currentDate },
      "ratesApplicable.to": { $gte: currentDate },
    });

    console.log("Found ShipperTariff documents:", shipperTariffs.length);

    // Extract the matching rates from the nested array
    const rateTariffs = [];
    shipperTariffs.forEach((doc) => {
      doc.ratesApplicable.forEach((rate) => {
        if (
          rate.from <= currentDate &&
          rate.to >= currentDate &&
          uniqueServices.some(
            (s) => s.trim().toUpperCase() === rate.service.trim().toUpperCase(),
          )
        ) {
          rateTariffs.push({
            accountCode: doc.accountCode,
            service: rate.service,
            sector: rate.sector,
            rateTariff: rate.rateTariff, // This is the shipper ID for RateSheet
            zoneMatrix: rate.zoneMatrix,
            network: rate.network,
            mode: rate.mode,
            from: rate.from,
            to: rate.to,
          });
        }
      });
    });

    console.log("Extracted rate tariffs:", rateTariffs.length);
    if (rateTariffs.length === 0) {
      console.error("❌ NO RATE TARIFFS FOUND!");
      console.error("   Account Code:", accountCode.toUpperCase());
      console.error("   Services searched:", uniqueServices);
      console.error("   Current date:", currentDate);

      // Try to find what services ARE available for this account
      const availableTariffs = await ShipperTariff.find({
        accountCode: accountCode.toUpperCase(),
      });

      if (availableTariffs.length > 0) {
        const allServices = [];
        availableTariffs.forEach((doc) => {
          doc.ratesApplicable.forEach((rate) => {
            allServices.push({
              service: rate.service,
              sector: rate.sector,
              from: rate.from,
              to: rate.to,
            });
          });
        });
        console.error("   Available services for this account:", allServices);
      }
    }

    // Get all needed zones at once
    const DELIMITER = "|||";
    const uniqueSectorDestinations = [
      ...new Set(
        shipments.map(
          (s) =>
            `${s.sector}${DELIMITER}${s.destination}${DELIMITER}${s.service}`,
        ),
      ),
    ];

    console.log(
      "Unique sector-destination-service combinations:",
      uniqueSectorDestinations,
    );

    // Case-insensitive zone lookup
    const zoneMap = {};

    for (const key of uniqueSectorDestinations) {
      const [sector, destination, service] = key.split(DELIMITER);

      // Get the matching rate tariff to get zoneMatrix
      const rateTariff = rateTariffs.find((rt) => {
        return (
          rt.service.trim().toUpperCase() === service.trim().toUpperCase() &&
          rt.sector.trim().toUpperCase() === sector.trim().toUpperCase()
        );
      });

      if (!rateTariff) {
        console.warn(
          `❌ No rate tariff found for sector: ${sector}, service: ${service}`,
        );
        continue;
      }

      // Query zone with zoneMatrix, sector, destination, and service
      const zone = await Zone.findOne({
        zoneMatrix: rateTariff.zoneMatrix,
        sector: { $regex: new RegExp(`^${sector.trim()}$`, "i") },
        destination: { $regex: new RegExp(`^${destination.trim()}$`, "i") },
        service: { $regex: new RegExp(`^${service.trim()}$`, "i") },
        effectiveDateFrom: { $lte: currentDate },
        effectiveDateTo: { $gte: currentDate },
      });

      if (zone) {
        zoneMap[key] = zone;
        console.log(
          `✅ Zone found for ${key}: Zone ${zone.zone}, ZoneMatrix: ${zone.zoneMatrix}`,
        );
      } else {
        console.warn(`❌ Zone not found for: ${key}`);
        console.warn(
          `   Searched: zoneMatrix="${rateTariff.zoneMatrix}", sector="${sector}", destination="${destination}", service="${service}"`,
        );

        // Try to find similar zones to help debug
        const similarZones = await Zone.find({
          zoneMatrix: rateTariff.zoneMatrix,
          $or: [
            { sector: { $regex: new RegExp(sector, "i") } },
            { service: { $regex: new RegExp(service, "i") } },
          ],
        }).limit(3);

        if (similarZones.length > 0) {
          console.warn(`   Similar zones found:`);
          similarZones.forEach((z) => {
            console.warn(
              `      - sector: "${z.sector}", destination: "${z.destination}", service: "${z.service}", zoneMatrix: "${z.zoneMatrix}"`,
            );
          });
        }
      }
    }

    console.log("Zones found:", Object.keys(zoneMap).length);

    // Calculate rates for each shipment
    const results = await Promise.all(
      shipments.map(async (shipment) => {
        try {
          // Find zone for this shipment
          const zoneKey = `${shipment.sector}${DELIMITER}${shipment.destination}${DELIMITER}${shipment.service}`;
          const zone = zoneMap[zoneKey];

          if (!zone) {
            console.warn(`Zone not found for: ${zoneKey}`);
            return {
              awbNo: shipment.awbNo,
              success: false,
              error: `Zone not found for ${shipment.sector} → ${shipment.destination} → ${shipment.service}`,
            };
          }

          // Find the matching rate tariff
          const rateTariff = rateTariffs.find((rt) => {
            if (!rt.service || !shipment.service) return false;
            return (
              rt.service.trim().toUpperCase() ===
              shipment.service.trim().toUpperCase()
            );
          });

          if (!rateTariff || !rateTariff.rateTariff) {
            console.warn(
              `Rate tariff not found for service: ${shipment.service}`,
            );
            return {
              awbNo: shipment.awbNo,
              success: false,
              error: `Rate tariff not found for service: ${shipment.service}`,
            };
          }

          // Get chargeable weight
          const chargeableWt = Number(shipment.chargeableWt) || 0;

          if (chargeableWt === 0) {
            console.warn(`Zero chargeable weight for: ${shipment.awbNo}`);
            return {
              awbNo: shipment.awbNo,
              success: false,
              error: "Chargeable weight is zero",
            };
          }

          // Get the zone number as an integer
          const zoneNumber = parseInt(zone.zone);

          if (isNaN(zoneNumber) || zoneNumber < 1 || zoneNumber > 35) {
            console.error(`Invalid zone number: ${zone.zone}`);
            return {
              awbNo: shipment.awbNo,
              success: false,
              error: `Invalid zone number: ${zone.zone}`,
            };
          }

          // Get rate from RateSheet collection
          const rate = await getRateFromRateSheet(
            rateTariff.rateTariff, // This is the shipper ID
            shipment.service,
            zoneNumber,
            chargeableWt,
          );

          if (rate === 0) {
            console.warn(`Zero rate returned for: ${shipment.awbNo}`);
            console.log("Rate tariff (shipper):", rateTariff.rateTariff);
            console.log("Service:", shipment.service);
            console.log("Zone:", zoneNumber);
            console.log("Chargeable weight:", chargeableWt);
            return {
              awbNo: shipment.awbNo,
              success: false,
              error:
                "Zero rate - check RateSheet configuration for this weight/zone",
            };
          }

          // Calculate basic amount
          const basicAmt = rate * chargeableWt;

          // Calculate GST
          const { sgst, cgst, igst } = calculateGST(
            basicAmt,
            shipment.sector,
            customer.branch || "DEL",
          );

          // Calculate total amount
          const totalAmt = basicAmt + sgst + cgst + igst;

          console.log(`✅ Calculated for ${shipment.awbNo}:`, {
            chargeableWt,
            zone: zoneNumber,
            rate,
            basicAmt,
            sgst,
            cgst,
            igst,
            totalAmt,
          });

          return {
            awbNo: shipment.awbNo,
            success: true,
            basicAmt: parseFloat(basicAmt.toFixed(2)),
            sgst: sgst,
            cgst: cgst,
            igst: igst,
            totalAmt: parseFloat(totalAmt.toFixed(2)),
            service: shipment.service,
            zone: zoneNumber,
            chargeableWt: chargeableWt,
            rateUsed: rate,
          };
        } catch (error) {
          console.error(`Error calculating for ${shipment.awbNo}:`, error);
          return {
            awbNo: shipment.awbNo,
            success: false,
            error: error.message,
          };
        }
      }),
    );

    // Count successes and failures
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(
      `Rate calculation completed: ${successful.length} successful, ${failed.length} failed`,
    );

    if (failed.length > 0) {
      console.error("Failed shipments:");
      failed.forEach((f) => {
        console.error(`  - ${f.awbNo}: ${f.error}`);
      });
    }

    return NextResponse.json({
      success: true,
      results: results,
      summary: {
        total: shipments.length,
        successful: successful.length,
        failed: failed.length,
        customerBalance: customer.leftOverBalance || 0,
      },
    });
  } catch (error) {
    console.error("Rate calculation error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error calculating rates",
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
