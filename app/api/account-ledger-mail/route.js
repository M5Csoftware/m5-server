import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";
import SalesTarget from "@/app/model/SalesTarget";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const salesPerson = searchParams.get("salesPerson");
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    if (!salesPerson) {
      return NextResponse.json(
        { success: false, message: "Sales Person is required" },
        { status: 400 }
      );
    }

    // Find ALL sales targets by userId or userName (case-insensitive search)
    const salesTargets = await SalesTarget.find({
      $or: [
        { userId: salesPerson.trim() },
        { userName: { $regex: new RegExp(`^${salesPerson.trim()}$`, "i") } }
      ]
    });

    if (!salesTargets || salesTargets.length === 0) {
      return NextResponse.json(
        { success: false, message: "Sales person not found in database" },
        { status: 404 }
      );
    }

    // Collect all unique customer codes and their names from all matching sales targets
    let allCustomerCodes = [];
    let customerNameMap = {};
    let salesPersonName = salesTargets[0].userName;

    salesTargets.forEach(target => {
      if (target.customersAssigned && target.customersAssigned.length > 0) {
        target.customersAssigned.forEach(customer => {
          if (customer.accountCode && !allCustomerCodes.includes(customer.accountCode)) {
            allCustomerCodes.push(customer.accountCode);
            customerNameMap[customer.accountCode] = customer.name || "";
          }
        });
      }
    });

    if (allCustomerCodes.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "No customers assigned to this sales person"
      });
    }

    // Determine which customers to show based on date filter
    let customerCodesToShow = [];

    if (fromDate || toDate) {
      // DATE FILTER PROVIDED: Show only customers who have shipments in the date range
      let shipmentQuery = {
        accountCode: { $in: allCustomerCodes }
      };

      // Add date filter to shipment query
      if (fromDate && toDate) {
        shipmentQuery.date = {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        };
      } else if (fromDate) {
        shipmentQuery.date = { $gte: new Date(fromDate) };
      } else if (toDate) {
        shipmentQuery.date = { $lte: new Date(toDate) };
      }

      // Find shipments in the date range
      const shipments = await Shipment.find(shipmentQuery).select("accountCode");
      
      // Get unique customer codes that have shipments in the date range
      customerCodesToShow = [...new Set(shipments.map(s => s.accountCode))];

      if (customerCodesToShow.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          message: `No customers with shipments found between ${fromDate || 'start'} and ${toDate || 'end'}`
        });
      }
    } else {
      // NO DATE FILTER: Show ALL assigned customers
      customerCodesToShow = allCustomerCodes;
    }

    // Fetch customer account details for the filtered customers
    const customerAccounts = await CustomerAccount.find({
      accountCode: { $in: customerCodesToShow }
    }).select("accountCode name email billingEmailId openingBalance branch");

    // Build response data
    const responseData = customerAccounts.map(account => ({
      customerCode: account.accountCode,
      customerName: customerNameMap[account.accountCode] || account.name || "",
      emailId: account.email || account.billingEmailId || "",
      openingBalance: account.openingBalance || "0",
      branch: account.branch || "",
      salePerson: salesPersonName
    }));

    // Sort by customer code
    responseData.sort((a, b) => a.customerCode.localeCompare(b.customerCode));

    // Generate appropriate message
    let message = "";
    if (fromDate || toDate) {
      message = `Found ${responseData.length} customer(s) with shipments between ${fromDate || 'start'} and ${toDate || 'end'}`;
    } else {
      message = `Found ${responseData.length} customer(s) - Full Ledger (All Assigned Customers)`;
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      count: responseData.length,
      message: message
    });

  } catch (error) {
    console.error("Error fetching account ledger data:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error", error: error.message },
      { status: 500 }
    );
  }
}