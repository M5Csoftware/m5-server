import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = parseInt(searchParams.get("month"));
    const year = parseInt(searchParams.get("year"));

    // sectors
    let sectorList = searchParams.get("sectors")?.split(",") || [];

    // REMOVE empty strings
    sectorList = sectorList.filter((s) => s && s.trim() !== "");

    // date range
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const filter = {
      isHold: true,
      date: { $gte: start, $lt: end },
    };

    // sector filter
    if (sectorList.length > 0) {
      filter.sector = { $in: sectorList };
    }

    const shipments = await Shipment.find(filter);

    const grouped = {};

    shipments.forEach((s) => {
      const reason = s.holdReason || "Unknown";

      const actual = Number(s.totalActualWt || 0);
      const vol = Number(s.totalVolWt || 0);
      const chargeable = Math.max(actual, vol);

      if (!grouped[reason]) {
        grouped[reason] = {
          reason,
          awb: 0,
          weight: 0,
        };
      }

      grouped[reason].awb += 1;
      grouped[reason].weight += chargeable;
    });

    return NextResponse.json(Object.values(grouped));
  } catch (err) {
    console.log("Reason-wise error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
