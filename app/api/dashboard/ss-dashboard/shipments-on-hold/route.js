import { NextResponse } from "next/server";
import Shipment from "@/app/model/portal/Shipment";
import connectDB from "@/app/lib/db";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "today";

    // sectors from query
    let sectorList = searchParams.get("sectors")?.split(",") || [];

    // remove empty entries → ensures empty = show all sectors
    sectorList = sectorList.filter((s) => s && s.trim() !== "");

    // date filter
    const now = new Date();
    let start;

    if (range === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === "7") {
      start = new Date(now.setDate(now.getDate() - 7));
    } else if (range === "30") {
      start = new Date(now.setDate(now.getDate() - 30));
    }

    const filter = {
      isHold: true,
      date: { $gte: start },
    };

    // add sector filter if present
    if (sectorList.length > 0) {
      filter.sector = { $in: sectorList };
    }

    const shipments = await Shipment.find(filter);

    const totalHold = shipments.length;

    const totalWeight = shipments.reduce((sum, s) => {
      const actual = Number(s.totalActualWt || 0);
      const vol = Number(s.totalVolWt || 0);
      return sum + Math.max(actual, vol);
    }, 0);

    return NextResponse.json({
      totalHold,
      totalWeight,
    });
  } catch (err) {
    console.error("Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
