import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";

export async function GET() {
  try {
    await connectDB();

    const customers = await CustomerAccount.find().lean();

    const finalData = [];

    for (const c of customers) {
      // skip if no accountCode
      if (!c.accountCode) {
        finalData.push({
          name: c.name,
          accountCode: c.accountCode || "",
          salesPersonName: c.salesPersonName,
          email: c.email,
          telNo: c.telNo,
          accountType: c.accountType,
          pinCode: c.pinCode,
          state: c.state,
          city: c.city,
          creditLimit: c.creditLimit,
          gstNo: c.gstNo,
          totalSale: 0,
          monthWise: {},
        });
        continue;
      }

      // match accountCode in Shipments
      const shipments = await Shipment.find({
        accountCode: c.accountCode,
      }).lean();

      let totalSale = 0;
      const monthMap = {};

      shipments.forEach((s) => {
        // use totalAmt from shipment
        const sale = Number(s.totalAmt || 0);
        totalSale += sale;

        const month = new Date(s.createdAt).toISOString().slice(0, 7); // YYYY-MM
        monthMap[month] = (monthMap[month] || 0) + sale;
      });

      finalData.push({
        name: c.name,
        accountCode: c.accountCode,
        salesPersonName: c.salesPersonName,
        email: c.email,
        telNo: c.telNo,
        accountType: c.accountType,
        pinCode: c.pinCode,
        state: c.state,
        city: c.city,
        creditLimit: c.creditLimit,
        gstNo: c.gstNo,
        totalSale,
        monthWise: monthMap,
      });
    }

    return NextResponse.json(finalData);
  } catch (err) {
    console.log(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
