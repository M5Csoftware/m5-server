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
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!sector) {
      return NextResponse.json(
        { success: false, message: "Sector is required" },
        { status: 400 }
      );
    }

    if (!from || !to) {
      return NextResponse.json(
        { success: false, message: "Both From and To dates are required" },
        { status: 400 }
      );
    }

    // Convert dates to Date objects for comparison
    const fromDate = new Date(from);
    const toDate = new Date(to);
    
    // Set time to start and end of day
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

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
      status: "Delivered (POD Updated)"
    }).lean();

    console.log(`Found ${deliveredEvents.length} delivered events for sector ${sector}`);

    if (deliveredEvents.length === 0) {
      return NextResponse.json(
        { success: true, data: [], message: "No delivered shipments found" },
        { status: 200 }
      );
    }

    // Filter events by date range and create a map of AWB to receiver name
    const awbToReceiverMap = {};
    const deliveredAWBsInRange = new Set();

    deliveredEvents.forEach(event => {
      // Find the index of "Delivered (POD Updated)" in status array
      const deliveredIndex = event.status.lastIndexOf("Delivered (POD Updated)");
      
      if (deliveredIndex !== -1) {
        // Get the corresponding date from eventDate array
        const deliveryDate = event.eventDate[deliveredIndex];
        
        if (deliveryDate) {
          const eventDate = new Date(deliveryDate);
          
          // Check if the delivery date is within the date range
          if (eventDate >= fromDate && eventDate <= toDate) {
            deliveredAWBsInRange.add(event.awbNo);
            
            if (!awbToReceiverMap[event.awbNo]) {
              awbToReceiverMap[event.awbNo] = event.receiverName || "N/A";
            }
          }
        }
      }
    });

    console.log(`Found ${deliveredAWBsInRange.size} shipments delivered in date range`);

    // Filter shipments that have delivered status within date range
    const deliveredShipments = shipments.filter(s => deliveredAWBsInRange.has(s.awbNo));

    if (deliveredShipments.length === 0) {
      return NextResponse.json(
        { success: true, data: [], message: "No delivered shipments found in the specified date range" },
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
        message: `Found ${result.length} delivered shipments between ${from} and ${to}`
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Error in POD email custom fetch:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error", error: error.message },
      { status: 500 }
    );
  }
}