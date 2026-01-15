import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

// Ensure DB connection
connectDB();

export async function GET() {
  try {
    // Fetch the latest shipment entry sorted by creation time in descending order
    const lastShipment = await Shipment.findOne().sort({ createdAt: -1 });
    
    if (!lastShipment) {
      return NextResponse.json({ awbNo: "MPL1111111" });
    }

    // Extract the numeric part of the awbNo and increment it
    const awbPrefix = lastShipment.awbNo.match(/^[A-Z]+/)[0];
    const awbNumber = parseInt(lastShipment.awbNo.replace(/[^0-9]/g, ""), 10) + 1;
    const newAwbNo = `${awbPrefix}${awbNumber.toString().padStart(7, '0')}`;

    return NextResponse.json({ awbNo: newAwbNo });
  } catch (error) {
    return NextResponse.json({ message: "Error fetching shipment", error: error.message }, { status: 500 });
  }
}
