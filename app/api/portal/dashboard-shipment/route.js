import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const accountCode = searchParams.get("accountCode");

    if (!accountCode) {
      return NextResponse.json(
        { 
          success: false, 
          message: "Account code is required" 
        },
        { status: 400 }
      );
    }

    // Fetch recent 6 shipments for the dashboard
    const shipments = await Shipment.find({ accountCode })
      .sort({ createdAt: -1 }) // Sort by newest first
      .limit(6)
      .select({
        status: 1,
        date: 1,
        awbNo: 1,
        destination: 1,
        service: 1,
        forwarder: 1,
        forwardingNo: 1,
        totalAmt: 1,
        _id: 0
      })
      .lean();

    // Format the data for frontend
    const formattedShipments = shipments.map(shipment => ({
      status: shipment.status || 'Shipment Created!',
      bookingDate: shipment.date ? new Date(shipment.date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) : 'N/A',
      awb: shipment.awbNo || 'N/A',
      destination: shipment.destination || 'N/A',
      service: shipment.service || 'N/A',
      forwarded: shipment.forwarder || 'N/A',
      forwordingNo: shipment.forwardingNo || 'N/A',
      amount: shipment.totalAmt || 0
    }));

    return NextResponse.json({
      success: true,
      shipments: formattedShipments,
      count: formattedShipments.length
    });

  } catch (error) {
    console.error("Error fetching dashboard shipments:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        error: error.message
      },
      { status: 500 }
    );
  }
}