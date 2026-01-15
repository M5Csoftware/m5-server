import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import SalesTarget from "@/app/model/SalesTarget";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

// Month parser
function getMonthRange(monthStr) {
  if (!monthStr) return null;

  let start, end;

  // Case: YYYY-MM
  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    start = new Date(`${monthStr}-01`);
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  // Case: Month-YYYY
  const parts = monthStr.split("-");
  if (parts.length === 2) {
    const [m, y] = parts;
    const monthIndex = new Date(`${m} 1, ${y}`).getMonth();

    if (!isNaN(monthIndex)) {
      start = new Date(y, monthIndex, 1);
      end = new Date(y, monthIndex + 1, 1);
      return { start, end };
    }
  }

  return null;
}

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const range = getMonthRange(month);

    // 1️⃣ Fetch sales employees
    const employees = await Employee.find(
      { deactivated: false },
      { userId: 1, userName: 1 }
    ).lean();

    if (!employees.length) return NextResponse.json([]);

    const userIds = employees.map((e) => e.userId);

    // 2️⃣ Fetch SalesTarget
    const targets = await SalesTarget.find(
      { userId: { $in: userIds } },
      { userId: 1, userName: 1, customersAssigned: 1 }
    ).lean();

    if (!targets.length) return NextResponse.json([]);

    // 3️⃣ Map user → { name, accountCodes }
    const dataMap = new Map();

    for (const e of employees) {
      dataMap.set(e.userId, {
        name: e.userName,
        accountCodes: new Set(),
      });
    }

    for (const t of targets) {
      const entry = dataMap.get(t.userId);
      if (!entry) continue;

      if (t.userName) entry.name = t.userName;

      if (Array.isArray(t.customersAssigned)) {
        for (const cust of t.customersAssigned) {
          if (cust?.accountCode) {
            entry.accountCodes.add(cust.accountCode);
          }
        }
      }
    }

    const salesPersons = Array.from(dataMap.entries())
      .map(([userId, d]) => ({
        userId,
        name: d.name,
        accountCodes: Array.from(d.accountCodes),
      }))
      .filter((x) => x.accountCodes.length > 0);

    if (!salesPersons.length) return NextResponse.json([]);

    // 4️⃣ All account codes
    const allCodes = [...new Set(salesPersons.flatMap((s) => s.accountCodes))];

    // 5️⃣ Build match query
    const matchQuery = {
      accountCode: { $in: allCodes },
    };

    if (range) {
      matchQuery.date = { $gte: range.start, $lt: range.end };
    }

    // 6️⃣ Aggregate shipments
    const shipmentsAgg = await Shipment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$accountCode",
          awb: { $sum: 1 },
          chgWt: { $sum: "$chargeableWt" },
          total: { $sum: "$totalAmt" },
        },
      },
    ]);

    const codeToSummary = new Map();
    shipmentsAgg.forEach((r) => {
      codeToSummary.set(r._id, {
        awb: r.awb,
        chgWt: r.chgWt,
        total: r.total,
      });
    });

    // 7️⃣ Build response
    const result = salesPersons.map((sp) => {
      let awb = 0,
        chgWt = 0,
        total = 0;

      for (const code of sp.accountCodes) {
        const d = codeToSummary.get(code);
        if (d) {
          awb += d.awb;
          chgWt += d.chgWt;
          total += d.total;
        }
      }

      return {
        salePerson: sp.name,
        awb,
        chgWt,
        total,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Sales person summary error:", err);
    return NextResponse.json(
      { error: "Failed to fetch sales person summary" },
      { status: 500 }
    );
  }
}
