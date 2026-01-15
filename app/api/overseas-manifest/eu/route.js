import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import Shipment from "@/app/model/portal/Shipment";
import RunEntry from "@/app/model/RunEntry";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");

    console.log("Received runNo:", runNo);

    if (!runNo) {
      return NextResponse.json(
        { success: false, message: "Run Number is required" },
        { status: 400 }
      );
    }

    // Fetch run entry data
    const runEntry = await RunEntry.findOne({ runNo }).lean();
    console.log("RunEntry found:", runEntry ? "Yes" : "No");
    
    if (!runEntry) {
      return NextResponse.json(
        { success: false, message: "Run Number not found" },
        { status: 404 }
      );
    }

    // Fetch bagging data for this run
    const baggingData = await Bagging.find({ runNo }).lean();
    console.log("Bagging data count:", baggingData.length);

    if (!baggingData || baggingData.length === 0) {
      return NextResponse.json(
        { success: false, message: "No bagging data found for this run" },
        { status: 404 }
      );
    }

    // Extract all AWB numbers from bagging rowData
    const awbNumbers = [];
    const baggingMap = {}; // Map AWB to bag info

    baggingData.forEach((bag) => {
      console.log("Processing bag:", bag.bagNo, "rowData exists:", !!bag.rowData);
      
      if (bag.rowData && Array.isArray(bag.rowData)) {
        console.log("rowData length:", bag.rowData.length);
        
        bag.rowData.forEach((row) => {
          if (row.awbNo) {
            awbNumbers.push(row.awbNo);
            baggingMap[row.awbNo] = {
              bagNo: row.bagNo || bag.bagNo,
              bagWeight: row.bagWeight || bag.bagWeight,
              bagLabel: bag.mhbsNo || "",
            };
          }
        });
      }
    });

    console.log("Total AWB numbers extracted:", awbNumbers.length);
    console.log("Sample AWB numbers:", awbNumbers.slice(0, 5));

    if (awbNumbers.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          message: "No AWB numbers found in bagging data. Check if rowData exists in bagging records.",
          debug: {
            baggingCount: baggingData.length,
            sampleBag: baggingData[0]
          }
        },
        { status: 404 }
      );
    }

    // Fetch shipment data for all AWBs with sector containing "Europe" (case-insensitive)
    const shipments = await Shipment.find({
      awbNo: { $in: awbNumbers },
      sector: { $regex: /europe/i }
    }).lean();

    console.log("Shipments found with Europe sector:", shipments.length);
    
    // Debug: Show sectors of found shipments
    if (shipments.length > 0) {
      console.log("Sample shipment sectors:", shipments.slice(0, 5).map(s => ({ awb: s.awbNo, sector: s.sector })));
    }

    // Debug: Check if there are any shipments without Europe filter
    const allShipments = await Shipment.find({
      awbNo: { $in: awbNumbers }
    }).lean();
    console.log("Total shipments (without Europe filter):", allShipments.length);
    if (allShipments.length > 0) {
      console.log("All shipment sectors:", allShipments.slice(0, 10).map(s => ({ awb: s.awbNo, sector: s.sector })));
    }

    if (shipments.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          message: "No shipments found with Europe sector. Please check if the sector field contains 'Europe' for these AWBs.",
          debug: {
            totalAwbCount: awbNumbers.length,
            totalShipmentsFound: allShipments.length,
            sampleAwbs: awbNumbers.slice(0, 5),
            sampleSectors: allShipments.slice(0, 5).map(s => ({ awb: s.awbNo, sector: s.sector }))
          }
        },
        { status: 404 }
      );
    }

    // Combine data - only for shipments with Europe sector
    const manifestData = shipments.map((shipment) => {
      const bagInfo = baggingMap[shipment.awbNo] || {};

      // Format content properly
      let goodsType = "";
      if (Array.isArray(shipment.content)) {
        goodsType = shipment.content.filter(c => c && c.trim()).join(", ");
      } else if (typeof shipment.content === 'string') {
        goodsType = shipment.content;
      }

      return {
        trackingNumber: runEntry.almawb || "", // from Run
        refrenceNumber: shipment.awbNo || "", // from Bagging
        bagNo: bagInfo.bagNo || "", // from Bagging
        bagLabel: bagInfo.bagLabel || "", // from Bagging
        internalAccountNumber: "", // empty
        shipperFullName: shipment.shipperFullName || "",
        shipperAddress1: shipment.shipperAddressLine1 || "",
        shipperAddress2: shipment.shipperAddressLine2 || "",
        shipperCity: shipment.shipperCity || "",
        shipperState: shipment.shipperState || "",
        shipperPincode: shipment.shipperPincode || "",
        shipperCountry: shipment.shipperCountry || "",
        receieverFullName: shipment.receiverFullName || "",
        receiverAddressLine1: shipment.receiverAddressLine1 || "",
        receiverAddressLine2: shipment.receiverAddressLine2 || "",
        receiverCity: shipment.receiverCity || "",
        receiverState: shipment.receiverState || "",
        receiverPincode: shipment.receiverPincode || "",
        receiverCountry: shipment.receiverCountry || "",
        receiverEmail: shipment.receiverEmail || "",
        receiverPhoneNumber: shipment.receiverPhoneNumber || "",
        pcs: shipment.pcs || 0,
        totalWeight: bagInfo.bagWeight || shipment.totalActualWt || 0, // from Bagging or shipment
        weightUom: "KG", // KG for all
        totalValue: shipment.totalInvoiceValue || 0,
        currency: shipment.currency || shipment.currencys || "INR", // INR for all
        incoterms: "DDP", // DDP for all
        vendor: "", // empty
        service: "DPD", // DPD same for all
        returnAction: "", // empty
        goodsType: goodsType,
        sector: shipment.sector || "", // Include sector for verification
      };
    });

    console.log("Manifest data prepared, count:", manifestData.length);
    console.log("Sample manifest data:", manifestData.slice(0, 2));

    return NextResponse.json({
      success: true,
      data: manifestData,
      count: manifestData.length,
      runInfo: {
        runNo: runEntry.runNo,
        date: runEntry.date,
        sector: runEntry.sector,
        flight: runEntry.flight,
        destination: runEntry.destination,
      },
    });
  } catch (error) {
    console.error("Error fetching EU manifest:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        error: error.message,
      },
      { status: 500 }
    );
  }
}