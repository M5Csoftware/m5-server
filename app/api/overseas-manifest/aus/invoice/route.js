import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import Shipment from "@/app/model/portal/Shipment";
import ChildShipment from "@/app/model/portal/ChildShipment";

// Function to convert INR to AUD
async function convertToAUD(inrAmount) {
  try {
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/INR`
    );
    const data = await response.json();
    const audRate = data.rates.AUD;
    return (inrAmount * audRate).toFixed(2);
  } catch (error) {
    console.error("Currency conversion error:", error);
    return (inrAmount * 0.018).toFixed(2);
  }
}

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return NextResponse.json(
        { success: false, message: "Run Number is required" },
        { status: 400 }
      );
    }

    // Find bagging data for the run
    const baggingData = await Bagging.findOne({ runNo }).lean();

    if (!baggingData) {
      return NextResponse.json(
        { success: false, message: "No data found for this Run Number" },
        { status: 404 }
      );
    }

    // Extract all AWB numbers from bagging data
    const allAwbs = new Set();
    const masterAwbs = new Set();
    const childAwbs = new Set();

    baggingData.rowData.forEach((item) => {
      if (item.awbNo) {
        allAwbs.add(item.awbNo);
        masterAwbs.add(item.awbNo);
      }
      if (item.childShipment) {
        allAwbs.add(item.childShipment);
        childAwbs.add(item.childShipment);
      }
    });

    // Fetch child shipment records to get master-child relationships
    const childShipmentRecords = await ChildShipment.find({
      childAwbNo: { $in: Array.from(childAwbs) },
    }).lean();

    // Create map of child to master
    const childToMasterMap = {};
    
    childShipmentRecords.forEach((child) => {
      childToMasterMap[child.childAwbNo] = child.masterAwbNo;
      allAwbs.add(child.masterAwbNo);
    });

    // Fetch all shipments (master and child)
    const shipments = await Shipment.find({
      awbNo: { $in: Array.from(allAwbs) },
    }).lean();

    // Create a map of AWB to shipment data
    const shipmentMap = {};
    shipments.forEach((shipment) => {
      shipmentMap[shipment.awbNo] = shipment;
    });

    // Process invoice data
    const finalInvoice = [];
    const shipmentsByMaster = {};

    // Helper function to process shipment details
    const processShipmentDetails = async (awbNo, isMaster = true) => {
      const shipment = shipmentMap[awbNo];
      if (!shipment) return;

      const masterAwbNo = isMaster ? awbNo : childToMasterMap[awbNo];
      
      // Initialize master shipment group if not exists
      if (!shipmentsByMaster[masterAwbNo]) {
        shipmentsByMaster[masterAwbNo] = {
          masterAwb: masterAwbNo,
          totalValueAUD: 0,
          items: []
        };
      }

      // Process shipmentAndPackageDetails
      if (shipment.shipmentAndPackageDetails && 
          typeof shipment.shipmentAndPackageDetails === 'object') {
        
        // Handle both object format {"1": [...], "2": [...]} and array format
        let detailsArray = [];
        
        if (Array.isArray(shipment.shipmentAndPackageDetails)) {
          detailsArray = shipment.shipmentAndPackageDetails;
        } else {
          // Extract arrays from object keys (box numbers)
          Object.keys(shipment.shipmentAndPackageDetails).forEach(boxKey => {
            const boxItems = shipment.shipmentAndPackageDetails[boxKey];
            if (Array.isArray(boxItems)) {
              boxItems.forEach(item => {
                detailsArray.push({
                  ...item,
                  box: boxKey
                });
              });
            }
          });
        }

        // Process each detail item
        for (const detail of detailsArray) {
          const description = detail.context || detail.description || "";
          const hsn = detail.hsnNo || detail.hsn || "";
          const qty = detail.qty || 0;
          const rate = detail.rate || 0;
          const amount = detail.amount || detail.amt || 0;
          const boxNo = detail.box || "1";
          
          // Convert amount to AUD
          const customValueAUD = await convertToAUD(parseFloat(amount));
          
          // Add to items
          shipmentsByMaster[masterAwbNo].items.push({
            awbNo: masterAwbNo,
            box: boxNo,
            description: description,
            hsn: hsn,
            qty: qty,
            rate: parseFloat(rate).toFixed(2),
            amt: parseFloat(amount).toFixed(2),
            customValue: customValueAUD,
            customCurrency: "AUD"
          });
          
          // Accumulate total value
          shipmentsByMaster[masterAwbNo].totalValueAUD += parseFloat(customValueAUD);
        }
      } else {
        // If no shipmentAndPackageDetails, use totalInvoiceValue from boxes or main shipment
        let totalValue = shipment.totalInvoiceValue || 0;
        let description = "General Goods";
        let qty = shipment.pcs || 1;

        // Try to get description from content or boxes
        if (Array.isArray(shipment.content) && shipment.content.length > 0) {
          description = shipment.content.filter(c => c && c.trim()).join(", ") || description;
        }
        
        if (Array.isArray(shipment.boxes) && shipment.boxes.length > 0) {
          // Sum up amounts from boxes if available
          const boxTotal = shipment.boxes.reduce((sum, box) => {
            return sum + (parseFloat(box.amount) || 0);
          }, 0);
          
          if (boxTotal > 0) {
            totalValue = boxTotal;
          }
          
          // Get context from boxes if available
          const boxContexts = shipment.boxes
            .map(box => box.context)
            .filter(c => c && c.trim());
          
          if (boxContexts.length > 0) {
            description = boxContexts.join(", ");
          }
        }

        const totalValueAUD = await convertToAUD(totalValue);
        
        shipmentsByMaster[masterAwbNo].items.push({
          awbNo: masterAwbNo,
          box: "1",
          description: description,
          hsn: "",
          qty: qty,
          rate: "0.00",
          amt: totalValue.toFixed(2),
          customValue: totalValueAUD,
          customCurrency: "AUD"
        });
        
        shipmentsByMaster[masterAwbNo].totalValueAUD += parseFloat(totalValueAUD);
      }
    };

    // Process all master AWBs
    for (const awbNo of masterAwbs) {
      await processShipmentDetails(awbNo, true);
    }

    // Process all child AWBs
    for (const childAwb of childAwbs) {
      await processShipmentDetails(childAwb, false);
    }

    // Prepare final invoice data (flattened for table display)
    Object.values(shipmentsByMaster).forEach(shipmentGroup => {
      finalInvoice.push(...shipmentGroup.items);
    });

    // Get first shipment for common details
    const firstMasterAwb = Array.from(masterAwbs)[0] || Object.keys(shipmentsByMaster)[0];
    const firstShipment = shipmentMap[firstMasterAwb] || shipments[0];

    const invoiceData = {
      shipperName: firstShipment?.shipperFullName || "M5C LOGISTICS",
      shipperAddress: firstShipment?.shipperAddressLine1 || "F-280, SECTOR-63",
      shipperCity: firstShipment?.shipperCity || "NOIDA",
      shipperState: firstShipment?.shipperState || "UTTAR PRADESH",
      shipperPin: firstShipment?.shipperPincode || "201301",
      shipperPhone: firstShipment?.shipperPhoneNumber || "+91 120 456 7890",
      shipperKycType: firstShipment?.shipperKycType || "PAN",
      shipperAadhar: firstShipment?.shipperKycNumber || "ABCDE1234F",
      
      consigneeName: "DCW SOLUTIONS INC",
      consigneeAddress: "13937 60 AVE",
      consigneeCity: "SURREY",
      consigneeState: "BC",
      consigneePin: "V3X0K7",
      consigneePhone: "+1 604 123 4567",
      
      preCarriageBy: "AIR",
      placeOfReceipt: "Delhi",
      portOfLoading: "IGI Airport",
      
      buyerOrderNo: "",
      otherReference: "",
      buyerIfOther: "",
      countryOfOrigin: "INDIA",
      destination: "AUSTRALIA",
      terms: "DDP",
      currency: "AUD",
      declaration: "The above mentioned items are not for commercial use and value declared only for custom purpose.",
      
      shipmentsByMaster: shipmentsByMaster,
      finalInvoice: finalInvoice,
      
      // Calculate totals
      totalWeight: Object.values(shipmentsByMaster).reduce((sum, group) => {
        const shipment = shipmentMap[group.masterAwb];
        return sum + (shipment?.totalActualWt || 0);
      }, 0),
      totalValue: Object.values(shipmentsByMaster).reduce((sum, group) => 
        sum + group.totalValueAUD, 0
      ).toFixed(2)
    };

    const runInfo = {
      runNo: baggingData.runNo,
      sector: baggingData.sector,
      flight: baggingData.flight,
      date: baggingData.createdAt || new Date(),
      alMawb: baggingData.alMawb,
      obc: baggingData.obc,
      noOfBags: baggingData.noOfBags,
      noOfAwb: baggingData.noOfAwb,
      runWeight: baggingData.runWeight,
    };

    return NextResponse.json({
      success: true,
      data: invoiceData,
      runInfo: runInfo,
      count: finalInvoice.length,
    });
  } catch (error) {
    console.error("Error in AUS invoice API:", error);
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