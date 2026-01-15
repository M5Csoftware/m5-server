import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "today";

    // sectors from frontend
    let sectorList = searchParams.get("sectors")?.split(",") || [];

    // remove empty entries → ensures empty = show all sectors
    sectorList = sectorList.filter((s) => s && s.trim() !== "");

    const now = new Date();
    let start;

    if (range === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === "7") {
      start = new Date(now.setDate(now.getDate() - 7));
    } else if (range === "30") {
      start = new Date(now.setDate(now.getDate() - 30));
    }

    // ----------------------
    // 1️⃣ FINALIZED BAGS
    // ----------------------

    const bagFilter = {
      isFinal: true,
      date: { $gte: start },
    };

    // if sector filter exists, filter bag items also by destination
    // (we can't filter bags directly because Bagging doesn't have sector)
    const bags = await Bagging.find(bagFilter);

    const baggedAwbs = new Set();

    bags.forEach((bag) => {
      bag.rowData.forEach((item) => {
        if (item.awbNo) baggedAwbs.add(item.awbNo);
        if (item.childShipment) baggedAwbs.add(item.childShipment);
      });
    });

    const baggedList = Array.from(baggedAwbs);

    // ----------------------
    // 2️⃣ READY TO FLY SHIPMENTS
    // ----------------------

    const shipmentFilter = {
      isHold: false,
      date: { $gte: start },
      awbNo: { $nin: baggedList },
      $or: [{ runNo: "" }, { runNo: null }],
    };

    // add sector filter
    if (sectorList.length > 0) {
      shipmentFilter.sector = { $in: sectorList };
    }

    const readyToFly = await Shipment.find(shipmentFilter);

    let count = 0;
    let weight = 0;

    readyToFly.forEach((s) => {
      const actual = Number(s.totalActualWt || 0);
      const vol = Number(s.totalVolWt || 0);
      const chargeable = Math.max(actual, vol);
      count++;
      weight += chargeable;
    });

    return NextResponse.json({
      totalReady: count,
      totalWeight: weight,
    });
  } catch (err) {
    console.log("READY TO FLY ERROR:", err);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
