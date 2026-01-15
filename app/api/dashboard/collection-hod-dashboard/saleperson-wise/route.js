import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import SalesTarget from "@/app/model/SalesTarget";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    let dateFilter = {};

    if (month && year) {
      const start = new Date(year, Number(month) - 1, 1);
      const end = new Date(year, Number(month), 1);

      dateFilter = {
        createdAt: { $gte: start, $lt: end },
      };
    }

    const employees = await Employee.find(
      { department: "Sales", deactivated: false },
      { userName: 1, userId: 1 }
    );

    const results = [];

    for (const emp of employees) {
      const target = await SalesTarget.findOne(
        { userId: emp.userId },
        { customersAssigned: 1 }
      );

      const assignedAccounts =
        target?.customersAssigned?.map((c) => c.accountCode) || [];

      if (assignedAccounts.length === 0) {
        results.push({
          salePerson: `${emp.userName} [${emp.userId}]`,
          shipments: 0,
          saleAmt: 0,
          shipmentsOnHold: 0,
          outstanding: 0,
        });
        continue;
      }

      const shipments = await Shipment.find({
        accountCode: { $in: assignedAccounts },
        ...dateFilter,
      });

      let saleAmt = 0;
      let outstanding = 0;
      let shipmentsOnHold = 0;

      shipments.forEach((s) => {
        const amount = Number(s.totalAmt || 0);

        if (!s.isHold) {
          saleAmt += amount;
        }

        // FIXED
        if (s.isHold && s.holdReason === "Credit Limit Exceeded") {
          shipmentsOnHold++;
          outstanding += amount;
        }
      });

      results.push({
        salePerson: `${emp.userName} [${emp.userId}]`,
        shipments: shipments.length,
        saleAmt,
        shipmentsOnHold,
        outstanding,
      });
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error("SalesPersonWise Error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
