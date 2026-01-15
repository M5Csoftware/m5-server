import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET(req) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  const monthIndex = new Date(`${month} 1, ${year}`).getMonth();
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);

  // Aggregate shipments by accountCode
  const data = await Shipment.aggregate([
    {
      $match: {
        $or: [
          { date: { $gte: start, $lt: end } },
          { createdAt: { $gte: start, $lt: end } },
        ],
      },
    },
    {
      $group: {
        _id: "$accountCode",
        shipments: { $push: "$$ROOT" },
      },
    },
  ]);

  // Extract all unique account codes
  const codes = data.map((d) => d._id);

  // Fetch customer accounts in one go
  const accounts = await CustomerAccount.find({
    accountCode: { $in: codes },
  }).lean();

  // Convert list to map for quick access
  const accMap = {};
  accounts.forEach((a) => (accMap[a.accountCode] = a));

  const result = data.map((c) => {
    const acc = accMap[c._id] || {};

    const row = {
      clientCode: c._id,
      clientName: acc.name || "",
      company: acc.companyName || "",
      branch: acc.branch || "",
      referenceBy: acc.referenceBy || "",
      currency: acc.currency || acc.currencys || "",
      salesPersonName: acc.salesPersonName || "",
      openingBalance: acc.openingBalance || 0,
      collectionBy: acc.collectionBy || "",
      creditLimit: acc.creditLimit || "",
    };

    let total = 0;

    // day1 → day31
    for (let i = 1; i <= 31; i++) {
      const daySum = c.shipments
        .filter((s) => new Date(s.createdAt || s.date).getDate() === i)
        .reduce((sum, s) => sum + (s.totalAmt || 0), 0);

      row[`day${i}`] = daySum;
      total += daySum;
    }

    row.total = total;
    return row;
  });

  return NextResponse.json({ ok: true, records: result });
}
