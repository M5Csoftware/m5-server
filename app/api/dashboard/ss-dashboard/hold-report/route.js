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
    const dateRange = searchParams.get("dateRange");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    console.log("Hold Report API called with:", { dateRange, from, to });

    // Build query for hold shipments
    let query = { isHold: true };

    // Apply date filters
    const today = new Date();

    if (dateRange) {
      switch (dateRange) {
        case "7":
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(today.getDate() - 7);
          query.date = { $gte: sevenDaysAgo };
          break;
        case "30":
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(today.getDate() - 30);
          query.date = { $gte: thirtyDaysAgo };
          break;
        case "90":
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(today.getDate() - 90);
          query.date = { $gte: ninetyDaysAgo };
          break;
      }
    }

    // Apply from/to date filters
    if (from || to) {
      query.date = query.date || {};

      if (from) {
        const fromDate = new Date(from);
        query.date.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        const endDate = new Date(toDate);
        endDate.setDate(endDate.getDate() + 1);
        query.date.$lt = endDate;
      }
    }

    // Fetch hold shipments with all necessary fields
    const shipments = await Shipment.find(query)
      .select({
        awbNo: 1,
        date: 1,
        company: 1,
        origin: 1,
        sector: 1,
        destination: 1,
        accountCode: 1,
        customer: 1,
        receiverFullName: 1,
        service: 1,
        forwardingNo: 1,
        pcs: 1,
        totalActualWt: 1,
        chargeableWt: 1,
        holdReason: 1,
        otherHoldReason: 1,
        localMF: 1,
        operationRemark: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .lean();

    console.log(`Found ${shipments.length} hold shipments`);

    // Get all unique account codes from shipments
    const accountCodes = [
      ...new Set(shipments.map((s) => s.accountCode).filter(Boolean)),
    ];

    // Fetch customer accounts for branch information
    let customerAccounts = {};
    if (accountCodes.length > 0) {
      const accounts = await CustomerAccount.find({
        accountCode: { $in: accountCodes },
      })
        .select({
          accountCode: 1,
          branch: 1,
          name: 1,
        })
        .lean();

      // Create a map for quick lookup
      accounts.forEach((account) => {
        customerAccounts[account.accountCode] = account;
      });
    }

    // Process shipments: add branch info and prepare for sorting
    const processedShipments = shipments.map((shipment) => {
      const customerAccount = shipment.accountCode
        ? customerAccounts[shipment.accountCode]
        : null;

      // Determine priority for sorting
      let priority = 2; // Default for "other reasons"

      if (
        shipment.holdReason &&
        shipment.holdReason.toLowerCase().includes("credit limit exceeded")
      ) {
        priority = 0; // Highest priority
      } else if (
        shipment.holdReason &&
        shipment.holdReason.toLowerCase().includes("ready to fly")
      ) {
        priority = 3; // Lowest priority
      } else if (shipment.holdReason) {
        priority = 1; // Other reasons (middle priority)
      }

      return {
        ...shipment,
        branch: customerAccount?.branch || shipment.company || "",
        priority: priority,
      };
    });

    // Sort shipments: credit limit exceeded first, then other reasons, then ready to fly
    const sortedShipments = processedShipments.sort((a, b) => {
      // First sort by priority
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by date (most recent first)
      return new Date(b.date) - new Date(a.date);
    });

    return NextResponse.json({
      success: true,
      data: sortedShipments,
      count: sortedShipments.length,
      filters: { dateRange, from, to },
    });
  } catch (error) {
    console.error("Error fetching hold report:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch hold report",
        message: error.message,
      },
      { status: 500 },
    );
  }
}
