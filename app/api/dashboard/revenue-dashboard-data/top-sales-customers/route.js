// app/api/dashboard/revenue-dashboard-data/top-sales-customers/route.js
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    // Connect to database
    await connectDB();

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json(
        { success: false, error: "Month parameter is required" },
        { status: 400 },
      );
    }

    console.log("Fetching top sales/customers for month:", month);

    // Parse month to get start and end dates
    const [year, monthNum] = month.split("-").map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(year, monthNum, 0);
    endDate.setHours(23, 59, 59, 999);

    console.log("Date range:", startDate, "to", endDate);

    // =======================
    // 1. TOP CUSTOMERS - SIMPLIFIED APPROACH
    // =======================
    console.log("\n--- Finding Top Customers ---");

    // First get all shipments for the month
    const allShipments = await Shipment.find({
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      accountCode: { $exists: true, $ne: null, $ne: "" },
      status: { $nin: ["Cancelled", "Deleted"] },
    })
      .select("accountCode chargeableWt localMF")
      .lean();

    console.log(`Found ${allShipments.length} shipments for the month`);

    // Manually aggregate in JavaScript to avoid MongoDB conversion issues
    const customerStats = {};

    allShipments.forEach((shipment) => {
      const accountCode = shipment.accountCode;
      if (!accountCode) return;

      if (!customerStats[accountCode]) {
        customerStats[accountCode] = {
          totalWeight: 0,
          totalAmount: 0,
          shipmentCount: 0,
        };
      }

      // Add weight
      customerStats[accountCode].totalWeight += shipment.chargeableWt || 0;

      // Add amount - handle string conversion
      let amount = 0;
      if (shipment.localMF) {
        if (typeof shipment.localMF === "string") {
          amount = parseFloat(shipment.localMF) || 0;
        } else if (typeof shipment.localMF === "number") {
          amount = shipment.localMF;
        }
      }
      customerStats[accountCode].totalAmount += amount;

      customerStats[accountCode].shipmentCount++;
    });

    // Convert to array and sort by weight
    const topCustomersArray = Object.entries(customerStats)
      .map(([accountCode, stats]) => ({
        accountCode,
        ...stats,
      }))
      .filter((c) => c.totalWeight > 0) // Only customers with weight
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 10);

    console.log(`Aggregated ${topCustomersArray.length} top customers`);

    // Get customer details
    const customerCodes = topCustomersArray.map((c) => c.accountCode);

    const customers = await CustomerAccount.find({
      accountCode: { $in: customerCodes },
    })
      .select({
        accountCode: 1,
        name: 1,
        state: 1,
        branch: 1,
        image: 1,
        profilePic: 1,
        salesPersonName: 1,
      })
      .lean();

    // Create customer map
    const customerMap = {};
    customers.forEach((c) => {
      customerMap[c.accountCode] = c;
    });

    // Format top customers data
    const topCustomers = topCustomersArray.map((stats, index) => {
      const customer = customerMap[stats.accountCode] || {};
      return {
        id: stats.accountCode,
        name: customer.name || `Customer ${stats.accountCode}`,
        state: customer.state || customer.branch || "N/A",
        image: customer.image || customer.profilePic || "/default-avatar.png",
        weight: Math.round(stats.totalWeight * 100) / 100,
        amount: Math.round(stats.totalAmount * 100) / 100,
        shipmentCount: stats.shipmentCount,
      };
    });

    console.log(`Formatted ${topCustomers.length} top customers`);

    // =======================
    // 2. TOP SALES PERSONS
    // =======================
    console.log("\n--- Finding Top Sales Persons ---");

    // Get all customers with sales persons for the accounts that have shipments
    const allCustomersWithSales = await CustomerAccount.find({
      accountCode: { $in: Object.keys(customerStats) },
      salesPersonName: { $exists: true, $ne: null, $ne: "" },
    })
      .select({
        accountCode: 1,
        salesPersonName: 1,
        state: 1,
        branch: 1,
      })
      .lean();

    console.log(
      `Found ${allCustomersWithSales.length} customers with sales persons`,
    );

    // Aggregate sales by sales person
    const salesPersonStats = {};

    allCustomersWithSales.forEach((customer) => {
      const salesPersonName = customer.salesPersonName;
      const accountStats = customerStats[customer.accountCode];

      if (salesPersonName && accountStats) {
        if (!salesPersonStats[salesPersonName]) {
          salesPersonStats[salesPersonName] = {
            totalWeight: 0,
            totalAmount: 0,
            shipmentCount: 0,
            customerCount: 0,
            customerAccountCodes: new Set(),
          };
        }

        salesPersonStats[salesPersonName].totalWeight +=
          accountStats.totalWeight || 0;
        salesPersonStats[salesPersonName].totalAmount +=
          accountStats.totalAmount || 0;
        salesPersonStats[salesPersonName].shipmentCount +=
          accountStats.shipmentCount || 0;
        salesPersonStats[salesPersonName].customerAccountCodes.add(
          customer.accountCode,
        );
      }
    });

    // Convert to array and sort
    const topSalesPersons = Object.entries(salesPersonStats)
      .map(([salesPersonName, stats]) => {
        // Find a sample customer for this sales person
        const sampleCustomer = allCustomersWithSales.find(
          (c) => c.salesPersonName === salesPersonName,
        );

        return {
          id: salesPersonName,
          name: salesPersonName,
          state: sampleCustomer?.state || sampleCustomer?.branch || "N/A",
          image: "/default-avatar.png",
          weight: Math.round(stats.totalWeight * 100) / 100,
          amount: Math.round(stats.totalAmount * 100) / 100,
          shipmentCount: stats.shipmentCount,
          customerCount: stats.customerAccountCodes.size,
        };
      })
      .filter((sp) => sp.weight > 0) // Only sales persons with weight
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    console.log(`Formatted ${topSalesPersons.length} top sales persons`);

    // =======================
    // 3. RETURN RESULTS
    // =======================
    return NextResponse.json({
      success: true,
      month,
      topCustomers,
      topSalesPersons,
      count: {
        customers: topCustomers.length,
        salesPersons: topSalesPersons.length,
      },
      debug: {
        totalShipments: allShipments.length,
        uniqueAccounts: Object.keys(customerStats).length,
      },
    });
  } catch (error) {
    console.error("Error fetching top sales/customers:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch data",
        message: error.message,
      },
      { status: 500 },
    );
  }
}
