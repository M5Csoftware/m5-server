import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";
import Employee from "@/app/model/Employee";
import { NextResponse } from "next/server";

await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // 🔹 1. Fetch dropdowns
    if (searchParams.get("dropdowns") === "true") {
      const uniqueCompanies = await Shipment.distinct("company");
      const uniqueRefPersons = await Shipment.distinct("reference");

      const salesPersons = await Employee.find({ department: "Sales" })
        .select("userId userName -_id")
        .lean();

      return NextResponse.json({
        dropdowns: {
          companies: uniqueCompanies.sort(),
          refPersons: uniqueRefPersons.sort(),
          salesPersons: salesPersons.sort((a, b) =>
            a.userName.localeCompare(b.userName)
          ),
        },
      });
    }

    // 🔹 2. Fetch customer by accountCode
    const accountCode = searchParams.get("accountCode");
    if (!accountCode) {
      return NextResponse.json(
        { error: "accountCode query parameter is required", data: null },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({
      accountCode: { $regex: `^${accountCode}$`, $options: "i" },
    }).select("accountCode name salesPersonName referenceBy");

    // 🔹 3. Optionally fetch salesPerson by code
    const salesPersonCode = searchParams.get("salesPersonCode");
    let salesPerson = null;
    if (salesPersonCode) {
      salesPerson = await Employee.findOne({ userId: salesPersonCode })
        .select("userId userName -_id")
        .lean();
    }

    return NextResponse.json({
      data: customer || null,
      salesPerson: salesPerson || null,
    });
  } catch (err) {
    console.error("Error fetching customer:", err);
    return NextResponse.json(
      { error: err.message, data: null },
      { status: 500 }
    );
  }
}
