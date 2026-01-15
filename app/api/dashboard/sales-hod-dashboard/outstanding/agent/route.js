import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const hub = searchParams.get("hub");

    // 🔥 Build date filter
    let dateFilter = {};
    if (month) {
      const [y, m] = month.split("-");
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
      dateFilter = {
        date: { $gte: start, $lte: end },
      };
    }

    // 🔥 Hub filter inside shipment
    let hubFilter = {};
    if (hub && hub !== "Hub" && hub !== "") {
      hubFilter.origin = hub; // <-- hub = shipment.origin
    }

    // 1️⃣ All agents/customers
    const customers = await CustomerAccount.find(
      {},
      { name: 1, accountCode: 1 }
    ).lean();

    if (!customers.length) return NextResponse.json([]);

    const allCodes = customers.map((c) => c.accountCode);

    // 2️⃣ Shipments per customer (WITH date + hub filter)
    const shipAgg = await Shipment.aggregate([
      {
        $match: {
          accountCode: { $in: allCodes },
          ...dateFilter,
          ...hubFilter,
        },
      },
      {
        $group: {
          _id: "$accountCode",
          count: { $sum: 1 },
        },
      },
    ]);

    const codeToShipments = new Map();
    shipAgg.forEach((row) => codeToShipments.set(row._id, row.count));

    // 3️⃣ Outstanding (WITH date + hub filter)
    const outstandingAgg = await Shipment.aggregate([
      {
        $match: {
          accountCode: { $in: allCodes },
          isHold: true,
          holdReason: "Credit Limit Exceeded",
          ...dateFilter,
          ...hubFilter,
        },
      },
      {
        $group: {
          _id: "$accountCode",
          outstandingTotal: { $sum: "$totalAmt" },
        },
      },
    ]);

    const codeToOutstanding = new Map();
    outstandingAgg.forEach((row) =>
      codeToOutstanding.set(row._id, row.outstandingTotal)
    );

    // 4️⃣ Final result
    const result = customers.map((c) => ({
      agent: `${c.name} ( ${c.accountCode} )`,
      shipments: codeToShipments.get(c.accountCode) || 0,
      outstanding: codeToOutstanding.get(c.accountCode) || 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Agent-wise outstanding error:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent wise outstanding" },
      { status: 500 }
    );
  }
}
