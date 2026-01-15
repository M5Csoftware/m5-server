import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    console.log("Fetching Shipments on Hold summary...");

    // 🔹 Find all shipments on hold
    const holdShipments = await Shipment.find({ isHold: true });

    // Count total shipments
    const shipmentCount = holdShipments.length;

    // Sum all totalActualWt values
    const totalWeight = holdShipments.reduce((sum, s) => {
      const wt = Number(s.totalActualWt) || 0;
      return sum + wt;
    }, 0);

    const result = {
      shipmentCount,
      totalWeight,
    };

    console.log("Hold summary result:", result);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error fetching hold summary:", error);
    return NextResponse.json(
      {
        message: "Error fetching hold summary",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
