import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import dayjs from "dayjs";

export async function GET(req) {
  await connectDB();

  const { searchParams } = new URL(req.url);

  const month = searchParams.get("month");
  const hub = searchParams.get("hub");

  if (!month) return NextResponse.json([]);

  const start = dayjs(month).startOf("month").toDate();
  const end = dayjs(month).endOf("month").toDate();

  // 🚀 Filter rules:
  const filter = {
    isHold: true,
    date: { $gte: start, $lte: end },

    // NOT Cred Limit
    $or: [
      { holdReason: { $ne: "Credit Limit Exceeded" } },
      { otherHoldReason: { $exists: true, $ne: "" } },
    ],
  };

  if (hub) filter.origin = hub;

  const shipments = await Shipment.find(filter);

  const grouped = {};

  shipments.forEach((s) => {
    const name = s.customer?.trim() || "Unknown";

    // pick reason
    const reason =
      s.otherHoldReason?.trim() || s.holdReason?.trim() || "Unknown";

    if (!grouped[name]) {
      grouped[name] = {
        customer: name,
        shipmentsOnHold: 0,
        reason,
        outstanding: 0,
      };
    }

    grouped[name].shipmentsOnHold++;
    grouped[name].outstanding += Number(s.totalAmt || 0);
  });

  return NextResponse.json(Object.values(grouped));
}
