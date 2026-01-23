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

    // Build date filter (applies to both queries)
    let dateFilter = {};
    const today = new Date();

    if (dateRange) {
      switch (dateRange) {
        case "7":
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(today.getDate() - 7);
          dateFilter = { date: { $gte: sevenDaysAgo } };
          break;
        case "30":
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(today.getDate() - 30);
          dateFilter = { date: { $gte: thirtyDaysAgo } };
          break;
        case "90":
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(today.getDate() - 90);
          dateFilter = { date: { $gte: ninetyDaysAgo } };
          break;
      }
    }

    // Apply from/to date filters
    if (from || to) {
      dateFilter.date = dateFilter.date || {};

      if (from) {
        const fromDate = new Date(from);
        dateFilter.date.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        const endDate = new Date(toDate);
        endDate.setDate(endDate.getDate() + 1);
        dateFilter.date.$lt = endDate;
      }
    }

    // Query 1: Get hold shipments (isHold: true)
    const holdQuery = { isHold: true, ...dateFilter };

    // Query 2: Get ready to fly shipments (forwardingNo exists, runNo empty, billNo empty)
    const readyToFlyQuery = {
      forwardingNo: { $exists: true, $ne: "" },
      $or: [{ runNo: { $exists: false } }, { runNo: "" }, { runNo: null }],
      $and: [
        {
          $or: [
            { billNo: { $exists: false } },
            { billNo: "" },
            { billNo: null },
          ],
        },
      ],
      ...dateFilter,
    };

    const selectFields = {
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
      runNo: 1,
      billNo: 1,
      pcs: 1,
      totalActualWt: 1,
      chargeableWt: 1,
      holdReason: 1,
      otherHoldReason: 1,
      localMF: 1,
      operationRemark: 1,
      isHold: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    // Fetch both types of shipments
    const [holdShipments, readyToFlyShipments] = await Promise.all([
      Shipment.find(holdQuery).select(selectFields).lean(),
      Shipment.find(readyToFlyQuery).select(selectFields).lean(),
    ]);

    // Combine and deduplicate shipments (in case a shipment matches both criteria)
    const shipmentMap = new Map();

    [...holdShipments, ...readyToFlyShipments].forEach((shipment) => {
      if (!shipmentMap.has(shipment._id.toString())) {
        shipmentMap.set(shipment._id.toString(), shipment);
      }
    });

    const shipments = Array.from(shipmentMap.values());

    console.log(`Found ${holdShipments.length} hold shipments`);
    console.log(`Found ${readyToFlyShipments.length} ready to fly shipments`);
    console.log(`Total unique shipments: ${shipments.length}`);

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

    // Helper function to check if shipment is ready to fly
    const isReadyToFly = (shipment) => {
      return (
        shipment.forwardingNo &&
        shipment.forwardingNo.trim() !== "" &&
        (!shipment.runNo || shipment.runNo.trim() === "") &&
        (!shipment.billNo || shipment.billNo.trim() === "")
      );
    };

    // Process shipments: add branch info and prepare for sorting
    const processedShipments = shipments.map((shipment) => {
      const customerAccount = shipment.accountCode
        ? customerAccounts[shipment.accountCode]
        : null;

      // Determine priority for sorting
      let priority = 2; // Default for "other reasons"
      let category = "Other Reasons";

      // Check if ready to fly first (takes precedence)
      if (isReadyToFly(shipment)) {
        priority = 3; // Lowest priority
        category = "Ready to Fly";
      } else if (
        shipment.holdReason &&
        shipment.holdReason.toLowerCase().includes("credit limit exceeded")
      ) {
        priority = 0; // Highest priority
        category = "Credit Limit Exceeded";
      } else if (shipment.holdReason || shipment.isHold) {
        priority = 1; // Other reasons (middle priority)
        category = "Other Reasons";
      }

      return {
        ...shipment,
        branch: customerAccount?.branch || shipment.company || "",
        priority: priority,
        category: category,
        isReadyToFly: isReadyToFly(shipment),
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
