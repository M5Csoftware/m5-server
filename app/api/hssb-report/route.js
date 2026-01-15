import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import SalesTarget from "@/app/model/SalesTarget";


export async function GET(req) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from"); // "2025-09"
  const to = searchParams.get("to"); // "2025-12"
  const userId = searchParams.get("user");

  // Helper: get month list between range
  function getMonthList(from, to) {
    const out = [];
    let [fy, fm] = from.split("-").map(Number);
    let [ty, tm] = to.split("-").map(Number);

    while (fy < ty || (fy === ty && fm <= tm)) {
      out.push(`${fy}-${String(fm).padStart(2, "0")}`);
      fm++;
      if (fm === 13) {
        fm = 1;
        fy++;
      }
    }
    return out;
  }

  const months = getMonthList(from, to);

  const monthly = {};

  // Loop each month
  for (const ym of months) {
    try {
      const [year, month] = ym.split("-");

      const targetMonthName = new Date(`${ym}-01`).toLocaleString("en-US", {
        month: "long",
      });

      const targetMonthStr = `${targetMonthName}-${year}`;

      console.log("Checking target for:", targetMonthStr);

      const target = await SalesTarget.findOne({
        userId,
        month: targetMonthStr,
      });

      console.log("Found target:", target);

      if (!target || !target.customersAssigned?.length) {
        monthly[ym] = 0;
        continue;
      }

      const assignedCodes = target.customersAssigned.map((c) => c.accountCode);

      const startDate = new Date(`${ym}-01T00:00:00Z`);
      const endDate = new Date(`${ym}-31T23:59:59Z`);

      console.log("Query shipments for:", assignedCodes);

      const shipments = await Shipment.find({
        accountCode: { $in: assignedCodes },
        date: { $gte: startDate, $lte: endDate },
      });

      console.log("Found shipments:", shipments.length);

      monthly[ym] = shipments.reduce((sum, s) => sum + (s.chargeableWt || 0), 0);
    } catch (err) {
      console.error("🔥 ERROR PROCESSING MONTH:", ym, err);
    }
  }

  return NextResponse.json({
    salesperson: userId,
    monthly,
  });
}
