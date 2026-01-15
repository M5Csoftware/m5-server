// import { NextResponse } from "next/server";
// import connectDB from "@/app/lib/db";
// import Shipment from "@/app/model/portal/Shipment";
// import CustomerAccount from "@/app/model/CustomerAccount";
// import EventActivity from "@/app/model/EventActivity";

// export async function GET(request) {
//   try {
//     await connectDB();

//     const { searchParams } = new URL(request.url);
//     const sector = searchParams.get("sector");

//     if (!sector) {
//       return NextResponse.json(
//         { success: false, message: "Sector is required" },
//         { status: 400 }
//       );
//     }

//     // Find all shipments for the given sector
//     const shipments = await Shipment.find({ 
//       sector: sector.toUpperCase() 
//     }).lean();

//     if (!shipments || shipments.length === 0) {
//       return NextResponse.json(
//         { success: true, data: [], message: "No shipments found for this sector" },
//         { status: 200 }
//       );
//     }

//     // Get all AWB numbers
//     const awbNumbers = shipments.map(s => s.awbNo);

//     // Find events where status array contains "Delivered"
//     const deliveredEvents = await EventActivity.find({
//       awbNo: { $in: awbNumbers },
//       status: "Delivered (POD Updated)" // MongoDB will search in the array
//     }).lean();

//     console.log(`Found ${deliveredEvents.length} delivered events for sector ${sector}`);

//     if (deliveredEvents.length === 0) {
//       return NextResponse.json(
//         { success: true, data: [], message: "No delivered shipments found" },
//         { status: 200 }
//       );
//     }

//     // Create a map of AWB to receiver name (get the latest receiver name)
//     const awbToReceiverMap = {};
//     deliveredEvents.forEach(event => {
//       // Since status is an array, find the index of "Delivered"
//       const deliveredIndex = event.status.lastIndexOf("Delivered");
      
//       if (deliveredIndex !== -1 && !awbToReceiverMap[event.awbNo]) {
//         awbToReceiverMap[event.awbNo] = event.receiverName || "N/A";
//       }
//     });

//     // Filter shipments that have delivered status
//     const deliveredAWBs = new Set(deliveredEvents.map(e => e.awbNo));
//     const deliveredShipments = shipments.filter(s => deliveredAWBs.has(s.awbNo));

//     console.log(`Found ${deliveredShipments.length} delivered shipments`);

//     if (deliveredShipments.length === 0) {
//       return NextResponse.json(
//         { success: true, data: [], message: "No delivered shipments found" },
//         { status: 200 }
//       );
//     }

//     // Get unique account codes
//     const accountCodes = [...new Set(deliveredShipments.map(s => s.accountCode))];

//     // Fetch customer account details
//     const customerAccounts = await CustomerAccount.find({
//       accountCode: { $in: accountCodes }
//     }).lean();

//     // Create a map of account code to customer details
//     const accountMap = {};
//     customerAccounts.forEach(account => {
//       accountMap[account.accountCode] = {
//         customerName: account.name || "N/A",
//         email: account.email || "",
//         branchName: account.branchName || "N/A",
//         salesPersonName: account.salesPersonName || "N/A"
//       };
//     });

//     // Map the data
//     const result = deliveredShipments.map(shipment => {
//       const customerDetails = accountMap[shipment.accountCode] || {};
      
//       return {
//         awbNo: shipment.awbNo,
//         accountCode: shipment.accountCode,
//         customerName: customerDetails.customerName || "N/A",
//         weight: shipment.totalActualWt || 0,
//         destination: shipment.destination || "N/A",
//         receiverName: awbToReceiverMap[shipment.awbNo] || "N/A",
//         email: customerDetails.email || "",
//         branchCode: customerDetails.branchName || "N/A",
//         salePerson: customerDetails.salesPersonName || "N/A"
//       };
//     });

//     console.log(`Returning ${result.length} records`);

//     return NextResponse.json(
//       { 
//         success: true, 
//         data: result,
//         message: `Found ${result.length} delivered shipments`
//       },
//       { status: 200 }
//     );

//   } catch (error) {
//     console.error("Error in POD email fetch:", error);
//     return NextResponse.json(
//       { success: false, message: "Internal server error", error: error.message },
//       { status: 500 }
//     );
//   }
// }

import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import EventActivity from "@/app/model/EventActivity";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const sector = searchParams.get("sector");

    if (!sector) {
      return NextResponse.json(
        { success: false, message: "Sector is required" },
        { status: 400 }
      );
    }

    // Find all shipments for the given sector
    const shipments = await Shipment.find({ 
      sector: sector.toUpperCase() 
    }).lean();

    if (!shipments || shipments.length === 0) {
      return NextResponse.json(
        { success: true, data: [], message: "No shipments found for this sector" },
        { status: 200 }
      );
    }

    // Get all AWB numbers
    const awbNumbers = shipments.map(s => s.awbNo);

    // Find events where status array contains "Delivered (POD Updated)"
    const deliveredEvents = await EventActivity.find({
      awbNo: { $in: awbNumbers },
      status: "Delivered (POD Updated)" // MongoDB will search in the array
    }).lean();

    console.log(`Found ${deliveredEvents.length} delivered events for sector ${sector}`);

    if (deliveredEvents.length === 0) {
      return NextResponse.json(
        { success: true, data: [], message: "No delivered shipments found" },
        { status: 200 }
      );
    }

    // Create a map of AWB to receiver name (get the latest receiver name)
    const awbToReceiverMap = {};
    deliveredEvents.forEach(event => {
      // Since status is an array, find the index of "Delivered (POD Updated)"
      const deliveredIndex = event.status.lastIndexOf("Delivered (POD Updated)");
      
      if (deliveredIndex !== -1) {
        // Debug log to see what's in the event
        console.log(`AWB: ${event.awbNo}, ReceiverName: ${event.receiverName}, Event:`, event);
        
        if (!awbToReceiverMap[event.awbNo]) {
          awbToReceiverMap[event.awbNo] = event.receiverName || "N/A";
        }
      }
    });

    // Filter shipments that have delivered status
    const deliveredAWBs = new Set(deliveredEvents.map(e => e.awbNo));
    const deliveredShipments = shipments.filter(s => deliveredAWBs.has(s.awbNo));

    console.log(`Found ${deliveredShipments.length} delivered shipments`);

    if (deliveredShipments.length === 0) {
      return NextResponse.json(
        { success: true, data: [], message: "No delivered shipments found" },
        { status: 200 }
      );
    }

    // Get unique account codes
    const accountCodes = [...new Set(deliveredShipments.map(s => s.accountCode))];

    // Fetch customer account details
    const customerAccounts = await CustomerAccount.find({
      accountCode: { $in: accountCodes }
    }).lean();

    // Create a map of account code to customer details
    const accountMap = {};
    customerAccounts.forEach(account => {
      accountMap[account.accountCode] = {
        customerName: account.name || "N/A",
        email: account.email || "",
        branchName: account.branchName || "N/A",
        salesPersonName: account.salesPersonName || "N/A"
      };
    });

    // Map the data
    const result = deliveredShipments.map(shipment => {
      const customerDetails = accountMap[shipment.accountCode] || {};
      
      return {
        awbNo: shipment.awbNo,
        accountCode: shipment.accountCode,
        customerName: customerDetails.customerName || "N/A",
        weight: shipment.totalActualWt || 0,
        destination: shipment.destination || "N/A",
        receiverName: awbToReceiverMap[shipment.awbNo] || "N/A",
        email: customerDetails.email || "",
        branchCode: customerDetails.branchName || "N/A",
        salePerson: customerDetails.salesPersonName || "N/A"
      };
    });

    console.log(`Returning ${result.length} records`);

    return NextResponse.json(
      { 
        success: true, 
        data: result,
        message: `Found ${result.length} delivered shipments`
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Error in POD email fetch:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error", error: error.message },
      { status: 500 }
    );
  }
}