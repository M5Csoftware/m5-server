import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const salePerson = searchParams.get("salePerson");
    const company = searchParams.get("company")?.trim();
    const year = searchParams.get("year");

    // Validate required fields
    if (!salePerson || !year) {
      return NextResponse.json(
        { error: "Sale Person and Year are mandatory fields" },
        { status: 400 }
      );
    }

    // Build customer filter
    const customerFilter = {
      salesPersonName: { $regex: salePerson, $options: "i" }
    };

    // Apply company filter ONLY if entered
    if (company) {
      customerFilter.companyCode = { $regex: company, $options: "i" };
    }

    // Fetch matching customer accounts
    const customerAccounts = await CustomerAccount.find(customerFilter).lean();

    if (customerAccounts.length === 0) {
      return NextResponse.json(
        { message: "No customer accounts found", data: [] },
        { status: 200 }
      );
    }

    // Extract customer codes
    const accountCodes = customerAccounts.map((c) => c.accountCode);

    // Build date range for full year
    const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${year}-12-31T23:59:59.999Z`);

    // Aggregate shipments for all customers
    const shipmentAggregation = await Shipment.aggregate([
      {
        $match: {
          accountCode: { $in: accountCodes },
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            accountCode: "$accountCode",
            month: { $month: "$date" }
          },
          totalAmount: {
            $sum: { $toDouble: { $ifNull: ["$totalAmt", 0] } }
          }
        }
      }
    ]);

    // Build map for fast lookup
    const shipmentMap = new Map();
    shipmentAggregation.forEach((item) => {
      const key = `${item._id.accountCode}-${item._id.month}`;
      shipmentMap.set(key, item.totalAmount || 0);
    });

    // Build per-customer data rows
    const processedData = customerAccounts.map((account) => {
      const monthlyData = {};
      let yearTotal = 0;

      for (let month = 1; month <= 12; month++) {
        const key = `${account.accountCode}-${month}`;
        const amount = shipmentMap.get(key) || 0;
        monthlyData[`month${month}`] = Number(amount.toFixed(2));
        yearTotal += amount;
      }

      return {
        accountCode: account.accountCode || "",
        name: account.name || "",
        branch: account.branch || "",
        salesPersonName: account.salesPersonName || "",
        referenceBy: account.referenceBy || "",
        collectionBy: account.collectionBy || "",
        accountManager: account.accountManager || "",
        openingBalance: account.openingBalance || 0,
        creditLimit: account.creditLimit || 0,
        ...monthlyData,
        yearTotal: Number(yearTotal.toFixed(2))
      };
    });

    // Build totals row
    const monthlyTotals = {};
    let grandTotal = 0;

    for (let month = 1; month <= 12; month++) {
      const total = processedData.reduce(
        (sum, acc) => sum + acc[`month${month}`],
        0
      );
      monthlyTotals[`month${month}`] = Number(total.toFixed(2));
      grandTotal += total;
    }

    processedData.push({
      accountCode: "TOTAL",
      name: "TOTAL",
      ...monthlyTotals,
      yearTotal: Number(grandTotal.toFixed(2))
    });

    return NextResponse.json({
      success: true,
      data: processedData,
      totalRecords: processedData.length - 1
    });

  } catch (error) {
    console.error("Month-sale API error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
