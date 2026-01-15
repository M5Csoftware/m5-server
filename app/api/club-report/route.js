// /api/club-report.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import Bagging from "@/app/model/bagging";

connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");
    const clubNo = searchParams.get("clubNo");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!runNo && !clubNo && !from && !to) {
      return NextResponse.json(
        { message: "At least one filter (runNo, clubNo, from, to) is required" },
        { status: 400 }
      );
    }

    const filter = {};

    if (runNo) filter.runNo = { $regex: `^${runNo}$`, $options: "i" };
    if (clubNo) filter.clubNo = { $regex: `^${clubNo}$`, $options: "i" };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const shipments = await Shipment.find(filter).lean();

    // Attach bag details from Bagging
    const updatedShipments = await Promise.all(
      shipments.map(async (shipment) => {
        const bagging = await Bagging.findOne({
          "rowData.awbNo": shipment.awbNo,
        }).lean();

        if (bagging) {
          const row = bagging.rowData.find((r) => r.awbNo === shipment.awbNo);
          if (row) {
            shipment.bagNo = row.bagNo;
            shipment.bag = row.bagWeight;
          }
        }

        return shipment;
      })
    );

    return NextResponse.json({ shipments: updatedShipments });
  } catch (err) {
    return NextResponse.json(
      { message: "Error fetching club report", error: err.message },
      { status: 500 }
    );
  }
}
