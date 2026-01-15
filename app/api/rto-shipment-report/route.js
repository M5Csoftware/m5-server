// app/api/rto-shipment-report/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    
    // Get query parameters
    const branch = searchParams.get("branch");
    const origin = searchParams.get("origin");
    const sector = searchParams.get("sector");
    const destination = searchParams.get("destination");
    const accountCode = searchParams.get("accountCode");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Build query object with payment = "rto" filter
    let query = {
      payment: "RTO" // CRITICAL: Only fetch RTO shipments
    };

    // Add filters if provided
    if (accountCode) {
      query.accountCode = accountCode;
    }

    if (origin) {
      query.origin = { $regex: origin, $options: "i" };
    }

    if (sector) {
      query.sector = { $regex: sector, $options: "i" };
    }

    if (destination) {
      query.destination = { $regex: destination, $options: "i" };
    }

    // Date range filter
    if (from || to) {
      query.date = {};
      
      if (from) {
        query.date.$gte = new Date(from);
      }
      
      if (to) {
        // Add one day to include the entire 'to' date
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() + 1);
        query.date.$lt = toDate;
      }
    }

    console.log("RTO Shipment Report Query:", query);

    // Create indexes for better performance (if not exists)
    try {
      await Shipment.collection.createIndex({ date: -1 });
      await Shipment.collection.createIndex({ payment: 1 }); // Index on payment field
    } catch (indexError) {
      console.log("Index already exists or creation failed:", indexError.message);
    }

    // Fetch shipments with limit and allowDiskUse for large datasets
    const shipments = await Shipment.find(query)
      .sort({ date: -1 })
      .limit(10000) // Limit to 10k records to prevent memory issues
      .lean()
      .allowDiskUse(true); // Allow MongoDB to use disk for sorting large datasets

    if (shipments.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          message: "No RTO shipments found for the given criteria",
        },
        { status: 200 }
      );
    }

    console.log(`Found ${shipments.length} RTO shipments`);

    // Get unique account codes
    const accountCodes = [...new Set(shipments.map(s => s.accountCode))];

    // Fetch customer accounts for branch and name
    const customers = await CustomerAccount.find({
      accountCode: { $in: accountCodes }
    }).lean();

    // Create a map for quick lookup
    const customerMap = {};
    customers.forEach(customer => {
      customerMap[customer.accountCode] = {
        branch: customer.branch || "",
        name: customer.name || "",
      };
    });

    // Filter by branch if provided
    let filteredShipments = shipments;
    if (branch) {
      filteredShipments = shipments.filter(shipment => {
        const customer = customerMap[shipment.accountCode];
        return customer && customer.branch && 
               customer.branch.toLowerCase().includes(branch.toLowerCase());
      });
    }

    console.log(`After branch filter: ${filteredShipments.length} RTO shipments`);

    // Merge shipment data with customer data
    const enrichedData = filteredShipments.map(shipment => ({
      awbNo: shipment.awbNo || "",
      date: shipment.date ? new Date(shipment.date).toISOString().split('T')[0] : "",
      branch: customerMap[shipment.accountCode]?.branch || "",
      origin: shipment.origin || "",
      sector: shipment.sector || "",
      destination: shipment.destination || "",
      accountCode: shipment.accountCode || "",
      name: customerMap[shipment.accountCode]?.name || "",
      receiverFullName: shipment.receiverFullName || "",
      receiverAddressLine1: shipment.receiverAddressLine1 || "",
      pcs: shipment.pcs || 0,
      goodstype: shipment.content || "",
      totalActualWt: shipment.totalActualWt || 0,
      content: shipment.content || "",
      shipmentRemark: shipment.operationRemark || "",
      payment: shipment.payment || "", // Include payment field
    }));

    return NextResponse.json(
      {
        success: true,
        data: enrichedData,
        count: enrichedData.length,
        total: shipments.length,
        limited: shipments.length >= 10000,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("RTO Shipment Report Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch RTO shipment report",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// GET customer name by account code
export async function POST(req) {
  try {
    await connectDB();

    const { accountCode } = await req.json();

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({
      accountCode: accountCode
    }).lean();

    if (!customer) {
      return NextResponse.json(
        {
          success: false,
          message: "Customer not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          name: customer.name || "",
          branch: customer.branch || "",
        },
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Get Customer Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch customer details",
      },
      { status: 500 }
    );
  }
}