import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import RateSheet from "@/app/model/RateSheet";
import Zone from "@/app/model/Zone";

await connectDB();

export async function GET(req) {
  try {
    const service = req.nextUrl.searchParams.get("service");
    const zone = req.nextUrl.searchParams.get("zone");
    const weight = parseFloat(req.nextUrl.searchParams.get("chargeableWt"));
    const shipper = req.nextUrl.searchParams.get("rateTariff");
    const actualWt = parseFloat(req.nextUrl.searchParams.get("actualWt"));
    const pcs = parseFloat(req.nextUrl.searchParams.get("pcs"));
    const destination = req.nextUrl.searchParams.get("destination");
    const sector = req.nextUrl.searchParams.get("sector");
    const zipcode = req.nextUrl.searchParams.get("zipcode");

    // ---------------- VALIDATION ----------------
    if (!service || !shipper || isNaN(weight) || isNaN(actualWt) || isNaN(pcs)) {
      return NextResponse.json(
        { error: "Missing or invalid query params" },
        { status: 400 }
      );
    }

    if (pcs <= 0) {
      return NextResponse.json(
        { error: "Pieces must be greater than zero" },
        { status: 400 }
      );
    }

    // ---------------- AUSTRALIA-SPECIFIC LOGIC ----------------
    let finalZone = zone;
    let zoneLookupDetails = null;
    
    // Check if sector/destination is Australia (case insensitive)
    const isAustraliaSector = sector && sector.toLowerCase().includes("australia");
    const isAustraliaDestination = destination && destination.toLowerCase().includes("australia");
    const isAustralia = isAustraliaSector && isAustraliaDestination;
    
    // ---------------- CANADA-SPECIFIC LOGIC ----------------
    const isCanadaSector = sector && sector.toLowerCase().includes("canada");
    const isCanadaDestination = destination && destination.toLowerCase().includes("canada");
    const isCanada = isCanadaSector && isCanadaDestination;
    
    if (isAustralia || isCanada) {
      const country = isAustralia ? "AUSTRALIA" : "CANADA";
      console.log(`Processing ${country} shipment for destination: ${destination}`);
      
      if (!zipcode) {
        return NextResponse.json(
          { error: `Zipcode/Postal Code is required for ${country} shipments` },
          { status: 400 }
        );
      }

      // Clean and normalize the zipcode
      const cleanedZip = zipcode.replace(/\s+/g, '').toUpperCase();
      
      let fsa, firstLetter;
      
      if (isAustralia) {
        // Australia: First digit(s) determine zone
        // e.g., 2xxx (NSW), 3xxx (VIC), 4xxx (QLD), 5xxx (SA), 6xxx (WA), 7xxx (TAS)
        // For Australia, we'll look for first digit or first 2 digits depending on zone matrix
        const firstChar = cleanedZip.substring(0, 1);
        const firstTwoChars = cleanedZip.substring(0, 2);
        
        console.log(`Looking for Australia zone with postcode: ${cleanedZip}, First Char: ${firstChar}, First Two: ${firstTwoChars}`);
        
        // Query for zones - look in the Zone collection for Australia mappings
        // Australia zone mapping might be based on:
        // 1. Full postcode (e.g., 2000)
        // 2. First digit (e.g., 2 for NSW)
        // 3. First two digits (e.g., 26 for Sydney metro)
        
        const zoneQuery = {
          sector: { $regex: new RegExp(sector, "i") },
          destination: { $regex: new RegExp(destination, "i") },
          service: { $regex: new RegExp(service, "i") },
          isActive: true
        };

        // Try multiple matching strategies for Australia
        let zoneRecord = null;
        let matchType = "general";

        // 1. Try full postcode match (4 digits)
        if (cleanedZip.length >= 4) {
          zoneRecord = await Zone.findOne({
            ...zoneQuery,
            zipcode: cleanedZip.substring(0, 4)
          }).lean();

          if (zoneRecord) {
            matchType = "full_postcode";
          }
        }

        // 2. Try first two digits match (for metro areas)
        if (!zoneRecord && cleanedZip.length >= 2) {
          zoneRecord = await Zone.findOne({
            ...zoneQuery,
            zipcode: firstTwoChars
          }).lean();

          if (zoneRecord) {
            matchType = "first_two_digits";
          }
        }

        // 3. Try first digit match (for state-level zones)
        if (!zoneRecord && cleanedZip.length >= 1) {
          zoneRecord = await Zone.findOne({
            ...zoneQuery,
            zipcode: firstChar
          }).lean();

          if (zoneRecord) {
            matchType = "first_digit";
          }
        }

        // 4. Try regional code match (e.g., NSW, VIC, QLD, etc.)
        if (!zoneRecord) {
          // Map first digit to state codes
          const stateMap = {
            '2': 'NSW', // New South Wales
            '3': 'VIC', // Victoria
            '4': 'QLD', // Queensland
            '5': 'SA',  // South Australia
            '6': 'WA',  // Western Australia
            '7': 'TAS', // Tasmania
            '0': 'NT',  // Northern Territory
            '2': 'ACT'  // Australian Capital Territory (also starts with 2)
          };
          
          const stateCode = stateMap[firstChar];
          if (stateCode) {
            zoneRecord = await Zone.findOne({
              ...zoneQuery,
              zipcode: stateCode
            }).lean();

            if (zoneRecord) {
              matchType = "state_code";
            }
          }
        }

        // 5. Try general Australia zone (empty or null zipcode)
        if (!zoneRecord) {
          zoneRecord = await Zone.findOne({
            ...zoneQuery,
            $or: [
              { zipcode: "" },
              { zipcode: null },
              { zipcode: { $exists: false } }
            ]
          }).lean();

          if (zoneRecord) {
            matchType = "general";
          }
        }

        if (!zoneRecord) {
          console.log(`No zone mapping found for Australia. Query:`, zoneQuery);
          return NextResponse.json(
            { 
              error: `No zone mapping found for Australia destination: ${destination}`,
              details: {
                sector,
                destination,
                service,
                zipcode: cleanedZip,
                firstChar,
                firstTwoChars
              }
            },
            { status: 404 }
          );
        }

        finalZone = zoneRecord.zone;
        zoneLookupDetails = {
          zoneMatrix: zoneRecord.zoneMatrix || "",
          matchedZipcode: zoneRecord.zipcode || "",
          inputZipcode: cleanedZip,
          matchType: matchType,
          isRemote: zoneRecord.remoteZones?.includes(finalZone) || false,
          isUnserviceable: zoneRecord.unserviceableZones?.includes(finalZone) || false,
          isCapitalCity: this.isCapitalCityPostcode(cleanedZip),
          isMetro: this.isMetroPostcode(cleanedZip)
        };
        
        console.log(`Australia shipment - Input: ${zipcode}, Cleaned: ${cleanedZip}, Matched Zip: ${zoneRecord.zipcode}, Zone: ${finalZone}, Match Type: ${matchType}`);
        
      } else if (isCanada) {
        // CANADA LOGIC (existing code)
        const cleanedZip = zipcode.replace(/\s+/g, '').toUpperCase();
        const fsa = cleanedZip.substring(0, 3);
        const firstLetter = cleanedZip.substring(0, 1);

        console.log(`Looking for Canada zone with FSA: ${fsa}, First Letter: ${firstLetter}`);

        const zoneQuery = {
          sector: { $regex: new RegExp(sector, "i") },
          destination: { $regex: new RegExp(destination, "i") },
          service: { $regex: new RegExp(service, "i") },
          isActive: true
        };

        let zoneRecord = null;
        let matchType = "general";

        // 1. Try exact FSA match (first 3 chars)
        zoneRecord = await Zone.findOne({
          ...zoneQuery,
          zipcode: fsa
        }).lean();

        if (zoneRecord) {
          matchType = "fsa_exact";
        } else {
          // 2. Try first letter match
          zoneRecord = await Zone.findOne({
            ...zoneQuery,
            zipcode: firstLetter
          }).lean();

          if (zoneRecord) {
            matchType = "first_letter";
          } else {
            // 3. Try general Canada zone (empty zipcode)
            zoneRecord = await Zone.findOne({
              ...zoneQuery,
              $or: [
                { zipcode: "" },
                { zipcode: null },
                { zipcode: { $exists: false } }
              ]
            }).lean();

            if (zoneRecord) {
              matchType = "general";
            }
          }
        }

        if (!zoneRecord) {
          console.log(`No zone mapping found for Canada. Query:`, zoneQuery);
          return NextResponse.json(
            { 
              error: `No zone mapping found for Canada destination: ${destination}`,
              details: {
                sector,
                destination,
                service,
                zipcode: cleanedZip,
                fsa,
                firstLetter
              }
            },
            { status: 404 }
          );
        }

        finalZone = zoneRecord.zone;
        zoneLookupDetails = {
          zoneMatrix: zoneRecord.zoneMatrix || "",
          matchedZipcode: zoneRecord.zipcode || "",
          inputZipcode: cleanedZip,
          forwardSortationArea: fsa,
          matchType: matchType,
          isRemote: zoneRecord.remoteZones?.includes(finalZone) || false,
          isUnserviceable: zoneRecord.unserviceableZones?.includes(finalZone) || false
        };
        
        console.log(`Canada shipment - Input: ${zipcode}, Cleaned: ${cleanedZip}, FSA: ${fsa}, Matched Zip: ${zoneRecord.zipcode}, Zone: ${finalZone}, Match Type: ${matchType}`);
      }
    } else {
      // For non-Canada/Australia shipments, use the provided zone parameter
      if (!zone) {
        return NextResponse.json(
          { error: "Zone is required for non-international shipments" },
          { status: 400 }
        );
      }
      finalZone = zone;
    }

    // ---------------- GET MAX SLAB ----------------
    const maxSlab = await RateSheet.findOne({ 
      service: { $regex: new RegExp(service, "i") }, 
      shipper: { $regex: new RegExp(shipper, "i") } 
    })
      .sort({ maxWeight: -1 })
      .select("maxWeight")
      .lean();

    if (!maxSlab) {
      return NextResponse.json(
        { error: "No rate slabs found for this service and shipper" },
        { status: 404 }
      );
    }

    // ---------------- DECIDE LOOKUP WEIGHT ----------------
    let lookupWeight = weight;

    // If chargeable weight exceeds highest slab → use average weight per piece
    if (weight > maxSlab.maxWeight) {
      lookupWeight = actualWt / pcs;
    }

    // ---------------- FIND MATCHING SLAB ----------------
    const record = await RateSheet.findOne({
      service: { $regex: new RegExp(service, "i") },
      shipper: { $regex: new RegExp(shipper, "i") },
      minWeight: { $lte: lookupWeight },
      maxWeight: { $gte: lookupWeight },
    }).lean();

    if (!record) {
      return NextResponse.json(
        { error: "No matching rate slab found" },
        { status: 404 }
      );
    }

    // ---------------- ZONE RATE ----------------
    const zoneValue = record[finalZone] ?? null;

    if (zoneValue === null) {
      return NextResponse.json(
        { error: `No rate found for zone ${finalZone}` },
        { status: 404 }
      );
    }

    const responseData = {
      service: record.service,
      shipper: record.shipper,
      network: record.network,
      originalZone: zone,
      finalZone,
      zoneUsed: finalZone,
      isCanadaShipment: isCanada,
      isAustraliaShipment: isAustralia,
      pcs,
      actualWt,
      inputChargeableWt: weight,
      lookupWeight,
      rate: zoneValue,
      type: record.type,
    };

    // Add zone details if available
    if (zoneLookupDetails) {
      responseData.zoneDetails = zoneLookupDetails;
    }

    return NextResponse.json(responseData);

  } catch (err) {
    console.error("Error fetching ratesheet:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    );
  }
}

// Helper functions for Australia postcode classification
function isCapitalCityPostcode(postcode) {
  const capitalPostcodes = [
    '2000', // Sydney CBD
    '3000', // Melbourne CBD
    '4000', // Brisbane CBD
    '5000', // Adelaide CBD
    '6000', // Perth CBD
    '7000', // Hobart CBD
    '0800', // Darwin CBD
    '2600', // Canberra CBD
  ];
  return capitalPostcodes.includes(postcode.substring(0, 4));
}

function isMetroPostcode(postcode) {
  if (!postcode || postcode.length < 1) return false;
  
  const firstDigit = postcode.substring(0, 1);
  const firstTwoDigits = postcode.substring(0, 2);
  
  // Metro areas typically in lower postcode ranges
  const metroRanges = [
    '2',    // Sydney metro starts with 2
    '3',    // Melbourne metro starts with 3
    '4',    // Brisbane metro starts with 4
    '5',    // Adelaide metro starts with 5
    '6',    // Perth metro starts with 6
    '7',    // Hobart metro starts with 7
    '08',   // Darwin
    '26',   // Canberra
  ];
  
  return metroRanges.includes(firstDigit) || metroRanges.includes(firstTwoDigits);
}