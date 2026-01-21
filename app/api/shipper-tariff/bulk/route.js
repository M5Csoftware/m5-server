// app/api/shipper-tariff/bulk/route.js
import connectDB from "@/app/lib/db";
import ShipperTariff from "@/app/model/ShipperTariff";
import { NextResponse } from "next/server";

connectDB();

/**
 * Normalize string for case-insensitive comparison
 */
function normalizeString(str) {
  if (!str || typeof str !== "string") return "";
  return str.trim().toLowerCase();
}

/**
 * Normalize date to YYYY-MM-DD format
 */
function normalizeDate(date) {
  if (!date) return null;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch (error) {
    return null;
  }
}

/**
 * Extract account code from customer string
 */
function extractAccountCode(customerStr) {
  if (!customerStr || typeof customerStr !== "string") return null;
  
  // Try to match account code pattern (like CG001, DL001)
  const accountCodeMatch = customerStr.match(/^[A-Z]{2}\d{3}$/i);
  if (accountCodeMatch) return accountCodeMatch[0].toUpperCase();
  
  // If no pattern, use the string as-is
  return customerStr.trim().toUpperCase();
}

/**
 * POST /api/shipper-tariff/bulk
 * Handle bulk upload for both Rate Update and Service Update
 */
export async function POST(req) {
  try {
    const { type, data } = await req.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: "Data must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!["Rate Update", "Service Update"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'Rate Update' or 'Service Update'" },
        { status: 400 }
      );
    }

    console.log(`📥 Bulk ${type}: Processing ${data.length} records`);
    
    const results = {
      success: 0,
      failed: 0,
      details: []
    };

    // Process Rate Update
    if (type === "Rate Update") {
      for (const row of data) {
        try {
          const accountCode = extractAccountCode(row.customer);
          
          if (!accountCode) {
            results.failed++;
            results.details.push({
              customer: row.customer,
              error: "No account code found"
            });
            continue;
          }

          const rateData = {
            sector: row.country || "",
            network: row.network || "",
            service: row.service || "",
            zoneMatrix: row.zoneMatrix || "",
            rateTariff: row.rateTariff || "",
            mode: row.mode || "",
            from: normalizeDate(row.fromDate),
            to: normalizeDate(row.toDate),
          };

          // Find or create document
          let doc = await ShipperTariff.findOne({ accountCode });

          if (!doc) {
            doc = new ShipperTariff({
              accountCode,
              ratesApplicable: [rateData]
            });
          } else {
            // Check if same rate exists (sector + service)
            const existingIndex = doc.ratesApplicable.findIndex(rate =>
              normalizeString(rate.sector) === normalizeString(rateData.sector) &&
              normalizeString(rate.service) === normalizeString(rateData.service)
            );

            if (existingIndex !== -1) {
              // Update existing
              doc.ratesApplicable[existingIndex] = rateData;
            } else {
              // Add new
              doc.ratesApplicable.push(rateData);
            }
          }

          await doc.save();
          results.success++;
          results.details.push({
            accountCode,
            action: doc.isNew ? "created" : "updated",
            sector: rateData.sector,
            service: rateData.service
          });

        } catch (error) {
          results.failed++;
          results.details.push({
            customer: row.customer,
            error: error.message
          });
        }
      }
    }
    
    // Process Service Update
    else if (type === "Service Update") {
      for (const row of data) {
        try {
          const accountCode = extractAccountCode(row.customer);
          
          if (!accountCode) {
            results.failed++;
            results.details.push({
              customer: row.customer,
              error: "No account code found"
            });
            continue;
          }

          const serviceData = {
            sector: row.country || "",
            network: row.network || "",
            service: row.service || "",
            applicable: true,
            effectiveDate: new Date().toISOString()
          };

          // Find or create document
          let doc = await ShipperTariff.findOne({ accountCode });

          if (!doc) {
            doc = new ShipperTariff({
              accountCode,
              servicesApplicable: [serviceData]
            });
          } else {
            // Initialize servicesApplicable if it doesn't exist
            if (!doc.servicesApplicable) {
              doc.servicesApplicable = [];
            }

            // Check if same service exists (sector + service)
            const existingIndex = doc.servicesApplicable.findIndex(service =>
              normalizeString(service.sector) === normalizeString(serviceData.sector) &&
              normalizeString(service.service) === normalizeString(serviceData.service)
            );

            if (existingIndex !== -1) {
              // Update existing
              doc.servicesApplicable[existingIndex] = serviceData;
            } else {
              // Add new
              doc.servicesApplicable.push(serviceData);
            }
          }

          await doc.save();
          results.success++;
          results.details.push({
            accountCode,
            action: doc.isNew ? "created" : "updated",
            sector: serviceData.sector,
            service: serviceData.service
          });

        } catch (error) {
          results.failed++;
          results.details.push({
            customer: row.customer,
            error: error.message
          });
        }
      }
    }

    console.log(`✅ Bulk ${type} completed: ${results.success} successful, ${results.failed} failed`);
    
    return NextResponse.json({
      message: `Bulk ${type} completed`,
      summary: results,
      total: data.length,
      success: results.success,
      failed: results.failed
    }, { status: 200 });

  } catch (error) {
    console.error("❌ Bulk operation error:", error);
    return NextResponse.json(
      { error: "Failed to process bulk data", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/shipper-tariff/bulk/template
 * Download template for bulk upload
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "Rate Update";
    
    let templateData = [];
    
    if (type === "Rate Update") {
      templateData = [{
        customer: "CG001",
        network: "MPL",
        service: "Express",
        zoneMatrix: "ZONE_A",
        rateTariff: "100",
        country: "USA",
        mode: "Normal Rate",
        fromDate: "2024-01-01",
        toDate: "2024-12-31"
      }];
    } else {
      templateData = [{
        customer: "CG001",
        network: "MPL",
        service: "Express",
        country: "USA"
      }];
    }

    return NextResponse.json({
      type,
      template: templateData,
      instructions: type === "Rate Update" 
        ? "Fill all columns. Customer should be account code."
        : "Fill required columns. Customer should be account code."
    }, { status: 200 });

  } catch (error) {
    console.error("Template error:", error);
    return NextResponse.json(
      { error: "Failed to generate template" },
      { status: 500 }
    );
  }
}