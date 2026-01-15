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
 * GET /api/shipper-tariff
 * Supports multiple query patterns:
 * 1. ?accountCode=CG001 - Returns ratesApplicable for specific account
 * 2. ?customer=Company Name (CG001) - Extracts accountCode and returns rates
 * 3. ?customer=Company Name (CG001)&sector=US - Returns filtered rates by sector (case-insensitive)
 */
export async function GET(req) {
  try {
    let accountCode = req.nextUrl.searchParams.get("accountCode");
    const customer = req.nextUrl.searchParams.get("customer");
    const sector = req.nextUrl.searchParams.get("sector");

    // Extract accountCode from customer string if provided
    if (!accountCode && customer) {
      accountCode = extractAccountCode(customer);
    }

    if (!accountCode) {
      return NextResponse.json(
        { error: "Missing accountCode or customer query parameter" },
        { status: 400 }
      );
    }

    console.log("📋 Fetching shipper tariff for:", { accountCode, sector });

    const doc = await ShipperTariff.findOne(
      { accountCode: accountCode.trim() },
      { ratesApplicable: 1, _id: 0 }
    );

    if (!doc) {
      console.log("⚠️ No shipper tariff found for accountCode:", accountCode);
      return NextResponse.json([], { status: 200 }); // Return empty array instead of error
    }

    let rates = doc.ratesApplicable || [];
    console.log(`✅ Found ${rates.length} total rates`);

    // Filter by sector if provided and not "All" (case-insensitive)
    if (sector && normalizeString(sector) !== "all") {
      const normalizedSector = normalizeString(sector);
      const beforeFilter = rates.length;
      rates = rates.filter(rate => normalizeString(rate.sector) === normalizedSector);
      console.log(`🔍 Filtered by sector "${sector}": ${beforeFilter} → ${rates.length} rates`);
    }

    // Transform rates to match frontend table structure
    const transformedRates = rates.map((rate, index) => ({
      id: rate._id || `${accountCode}-${index}`,
      customer: customer || accountCode,
      network: rate.network || "",
      service: rate.service || "",
      zoneMatrix: rate.zoneMatrix || "",
      rateTariff: rate.rateTariff || "",
      country: rate.sector || "",
      mode: rate.mode || "",
      fromDate: rate.from || "",
      toDate: rate.to || "",
    }));

    console.log(`📤 Returning ${transformedRates.length} transformed rates`);
    return NextResponse.json(transformedRates, { status: 200 });
  } catch (err) {
    console.error("❌ GET /shipper-tariff error:", err);
    return NextResponse.json(
      { error: "Server error", details: err.message },
      { status: 500 }
    );
  }
}

/**
 * Extract account code from customer string like "Company Name (CG001)"
 */
function extractAccountCode(customerStr) {
  if (!customerStr || typeof customerStr !== "string") return null;
  const match = customerStr.match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim() : null;
}

/**
 * Normalize date to YYYY-MM-DD format
 */
function normalizeDate(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

/**
 * Map frontend row data to database rate format
 */
function mapRowToRate(row) {
  return {
    sector: row.country ?? "",
    service: row.service ?? "",
    zoneMatrix: row.zoneMatrix ?? "",
    network: row.network ?? "",
    rateTariff: row.rateTariff ?? "",
    mode: row.mode ?? "",
    from: normalizeDate(row.fromDate),
    to: normalizeDate(row.toDate),
  };
}

/**
 * Check if two rates match (case-insensitive comparison on key fields)
 * Matches on: sector + service (ignoring case)
 */
function isSameKey(r1, r2) {
  return (
    normalizeString(r1.sector) === normalizeString(r2.sector) &&
    normalizeString(r1.service) === normalizeString(r2.service)
  );
}

/**
 * POST /api/shipper-tariff
 * Create or update shipper tariff rates
 * Body: Array of rate objects
 */
export async function POST(req) {
  try {
    const rows = await req.json();
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "Body must be non-empty array" },
        { status: 400 }
      );
    }

    console.log(`📥 Received ${rows.length} rows to save`);
    const results = [];

    for (const row of rows) {
      const accountCode = extractAccountCode(row.customer);
      
      if (!accountCode) {
        console.warn("⚠️ Skipping row - no account code found:", row.customer);
        continue;
      }

      const rate = mapRowToRate(row);
      console.log(`📝 Processing rate for ${accountCode}:`, {
        sector: rate.sector,
        service: rate.service,
        zoneMatrix: rate.zoneMatrix
      });

      let doc = await ShipperTariff.findOne({ accountCode });

      if (!doc) {
        // CREATE NEW DOCUMENT
        console.log(`✨ Creating new tariff document for ${accountCode}`);
        doc = new ShipperTariff({
          accountCode,
          ratesApplicable: [rate],
        });
        await doc.save();
        results.push({ accountCode, action: "created new tariff record" });
        continue;
      }

      // Find existing matching entry (case-insensitive, ignore dates)
      const matchIndex = doc.ratesApplicable.findIndex((r) =>
        isSameKey(r, rate)
      );

      if (matchIndex !== -1) {
        // UPDATE EXISTING ENTRY
        console.log(`🔄 Updating existing tariff for ${accountCode} at index ${matchIndex}`);
        doc.ratesApplicable[matchIndex] = rate;
        await doc.save();
        results.push({ 
          accountCode, 
          action: "updated existing tariff",
          sector: rate.sector,
          service: rate.service
        });
      } else {
        // INSERT NEW ENTRY
        console.log(`➕ Inserting new tariff for ${accountCode}`);
        doc.ratesApplicable.push(rate);
        await doc.save();
        results.push({ 
          accountCode, 
          action: "inserted new tariff row",
          sector: rate.sector,
          service: rate.service
        });
      }
    }

    console.log(`✅ Successfully processed ${results.length} rates`);
    return NextResponse.json({ ok: true, results }, { status: 200 });

  } catch (err) {
    console.error("❌ Error saving shipper tariff:", err);
    return NextResponse.json({ 
      error: "Failed to save tariff",
      details: err.message 
    }, { status: 500 });
  }
}

/**
 * DELETE /api/shipper-tariff
 * Delete a shipper tariff by ID
 * Query param: ?id=123456
 */
export async function DELETE(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ 
        error: "ID is required" 
      }, { status: 400 });
    }

    console.log(`🗑️ Attempting to delete tariff with ID: ${id}`);

    const deletedTariff = await ShipperTariff.findByIdAndDelete(id);

    if (!deletedTariff) {
      console.log(`⚠️ Tariff not found: ${id}`);
      return NextResponse.json({ 
        error: "Tariff not found" 
      }, { status: 404 });
    }

    console.log(`✅ Successfully deleted tariff: ${id}`);
    return NextResponse.json(
      {
        message: "Tariff deleted successfully",
        deletedTariff,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ DELETE Error:", error);
    return NextResponse.json(
      { error: "Failed to delete tariff", details: error.message },
      { status: 500 }
    );
  }
}