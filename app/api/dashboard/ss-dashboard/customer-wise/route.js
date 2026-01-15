import { NextResponse } from "next/server";

import CustomerAccount from "@/app/model/CustomerAccount";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = parseInt(searchParams.get("month"));
    const year = parseInt(searchParams.get("year"));

    // sectors
    let sectorList = searchParams.get("sectors")?.split(",") || [];

    // remove empty entries → ensures empty = show all sectors
    sectorList = sectorList.filter((s) => s && s.trim() !== "");

    // date filter
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const filter = {
      isHold: true,
      date: { $gte: start, $lt: end },
    };

    // apply sector filter
    if (sectorList.length > 0) {
      filter.sector = { $in: sectorList };
    }

    const shipments = await Shipment.find(filter);

    // customer accounts mapping
    const accounts = await CustomerAccount.find(
      {},
      { accountCode: 1, name: 1 }
    );

    const customerMap = {};
    accounts.forEach((a) => {
      customerMap[a.accountCode] = a.name || "Unknown";
    });

    const grouped = {};

    shipments.forEach((s) => {
      const customerName = customerMap[s.accountCode] || "Unknown";

      const actual = Number(s.totalActualWt || 0);
      const vol = Number(s.totalVolWt || 0);
      const chargeable = Math.max(actual, vol);

      if (!grouped[customerName]) {
        grouped[customerName] = {
          id: s.accountCode,
          customerName,
          awb: 0,
          weight: 0,
        };
      }

      grouped[customerName].awb += 1;
      grouped[customerName].weight += chargeable;
    });

    return NextResponse.json(Object.values(grouped));
  } catch (err) {
    console.log("Customer-wise hold error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
