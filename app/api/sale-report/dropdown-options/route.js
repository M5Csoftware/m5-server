import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Employee from "@/app/model/Employee";
import Vendor from "@/app/model/Vendor"; // your Vendor model

export async function GET() {
  try {
    await connectDB();

    // 1️⃣ Customer accounts for Account Manager
    const accounts = await CustomerAccount.find(
      {},
      { accountManager: 1 }
    ).lean();
    const accountManagers = [
      ...new Set(accounts.map((a) => a.accountManager)),
    ].filter(Boolean);

    // 2️⃣ Sales employees for Sale Person
    const salesEmployees = await Employee.find(
      { department: "Sales" },
      { userName: 1 }
    ).lean();
    const salePersons = [
      ...new Set(salesEmployees.map((e) => e.userName)),
    ].filter(Boolean);

    // 3️⃣ Vendors for Company dropdown
    const vendors = await Vendor.find({}, { companyName: 1 }).lean(); // assuming vendor schema has companyName field
    const companies = [...new Set(vendors.map((v) => v.companyName))].filter(
      Boolean
    );

    return NextResponse.json({
      success: true,
      data: { accountManagers, companies, salePersons },
    });
  } catch (err) {
    console.error("Failed to fetch dropdown options:", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
