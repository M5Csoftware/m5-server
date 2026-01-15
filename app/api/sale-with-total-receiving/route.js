import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// Import existing schemas
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import PaymentEntry from "@/app/model/PaymentEntry";

// GET method - Fetch account details or other utility endpoints
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    
    // Get query parameters
    const accountCode = searchParams.get('accountCode');
    const action = searchParams.get('action');

    // Handle different GET actions
    if (action === 'accounts') {
      try {
        const accountStats = await Shipment.aggregate([
          {
            $match: {
              accountCode: { $exists: true, $ne: "" }
            }
          },
          {
            $group: {
              _id: "$accountCode",
              shipmentCount: { $sum: 1 },
              lastShipmentDate: { $max: "$date" }
            }
          },
          {
            $sort: { shipmentCount: -1, _id: 1 }
          }
        ]);

        const accounts = accountStats.map(stat => ({
          accountCode: stat._id,
          shipmentCount: stat.shipmentCount,
          lastShipmentDate: stat.lastShipmentDate
        }));

        return NextResponse.json({
          success: true,
          data: {
            accounts: accounts,
            total: accounts.length,
            summary: `Found ${accounts.length} unique account codes`
          }
        });
      } catch (error) {
        console.error("Error fetching account codes:", error);
        return NextResponse.json({ 
          success: false,
          error: "Error fetching account codes" 
        }, { status: 500 });
      }
    }

    if (action === 'date-range') {
      try {
        const dateRange = await Shipment.aggregate([
          {
            $group: {
              _id: null,
              minDate: { $min: "$date" },
              maxDate: { $max: "$date" },
              totalShipments: { $sum: 1 }
            }
          }
        ]);

        return NextResponse.json({
          success: true,
          data: {
            minDate: dateRange[0]?.minDate || null,
            maxDate: dateRange[0]?.maxDate || null,
            totalShipments: dateRange[0]?.totalShipments || 0
          }
        });
      } catch (error) {
        console.error("Error fetching date range:", error);
        return NextResponse.json({ 
          success: false,
          error: "Error fetching date range" 
        }, { status: 500 });
      }
    }

    if (action === 'stats') {
      try {
        const stats = await Promise.all([
          Shipment.countDocuments(),
          PaymentEntry.countDocuments(),
          CustomerAccount.countDocuments()
        ]);

        return NextResponse.json({
          success: true,
          data: {
            totalShipments: stats[0],
            totalPaymentEntries: stats[1],
            totalCustomerAccounts: stats[2],
            generatedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error("Error fetching statistics:", error);
        return NextResponse.json({ 
          success: false,
          error: "Error fetching statistics" 
        }, { status: 500 });
      }
    }

    // Handle single account details lookup
    if (accountCode) {
      try {
        const customer = await CustomerAccount.findOne({ 
          accountCode: accountCode.trim() 
        }).select('name email openingBalance').lean();

        if (customer) {
          return NextResponse.json({
            success: true,
            data: {
              name: customer.name || '',
              email: customer.email || '',
              openingBalance: customer.openingBalance || 0,
              accountCode: accountCode
            }
          });
        } else {
          return NextResponse.json({ 
            success: false,
            error: "Account not found" 
          }, { status: 404 });
        }
      } catch (error) {
        console.error("Error fetching account details:", error);
        return NextResponse.json({ 
          success: false,
          error: "Error fetching account details" 
        }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: false,
      error: "Invalid GET request parameters" 
    }, { status: 400 });

  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json({ 
      success: false,
      error: "Database connection failed",
      details: error.message 
    }, { status: 500 });
  }
}

// POST method - Fetch shipments by date range with optional filters
export async function POST(request) {
  try {
    await connectDB();

    // Parse request body
    const body = await request.json();
    const { fromDate, toDate, accountCode, withHoldAWB } = body;

    console.log("POST Request Body:", body);

    // Validate required date parameters
    if (!fromDate || !toDate) {
      return NextResponse.json({ 
        success: false,
        error: "From date and To date are required" 
      }, { status: 400 });
    }

    // Validate date format and logic
    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ 
        success: false,
        error: "Invalid date format. Use YYYY-MM-DD" 
      }, { status: 400 });
    }

    if (startDate > endDate) {
      return NextResponse.json({ 
        success: false,
        error: "From date cannot be later than To date" 
      }, { status: 400 });
    }

    try {
      // Set time to start and end of day for accurate filtering
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      // PRIMARY FILTER: Date range (mandatory)
      const primaryDateFilter = {
        date: {
          $gte: startDate,
          $lte: endDate
        }
      };

      // BUILD SHIPMENT QUERY - Start with date filter
      let shipmentQuery = { ...primaryDateFilter };

      // OPTIONAL FILTERS: Add only if provided
      if (accountCode && accountCode.trim()) {
        shipmentQuery.accountCode = accountCode.trim();
      }

      // Only apply hold filter when checkbox is explicitly checked (true)
      if (withHoldAWB === true) {
        shipmentQuery.isHold = true;
      }

      console.log("Shipment Query:", JSON.stringify(shipmentQuery, null, 2));
      console.log("Hold Filter Applied:", withHoldAWB ? "Yes - Hold AWBs Only" : "No - All AWBs");

      // FETCH ALL SHIPMENTS WITHIN DATE RANGE (with optional filters)
      const shipments = await Shipment.find(shipmentQuery)
        .select(
          'awbNo accountCode shipmentType date receiverFullName forwarder sector destination receiverCity receiverPincode service pcs totalActualWt totalVolWt basicAmt totalAmt sgst cgst igst miscChg fuelAmt operationRemark isHold'
        )
        .sort({ date: -1, accountCode: 1 })
        .lean();

      console.log(`Found ${shipments.length} shipments`);

      // FORMAT SHIPMENTS FOR DISPLAY
      const formattedShipments = shipments.map(shipment => ({
        awbNo: shipment.awbNo || '',
        accountCode: shipment.accountCode || '',
        shipmentType: shipment.shipmentType || '',
        shipmentDate: shipment.date ? new Date(shipment.date).toLocaleDateString('en-IN') : '',
        receiverFullName: shipment.receiverFullName || '',
        forwarder: shipment.forwarder || '',
        sector: shipment.sector || '',
        destination: shipment.destination || '',
        receiverCity: shipment.receiverCity || '',
        receiverPincode: shipment.receiverPincode || '',
        service: shipment.service || '',
        pcs: shipment.pcs || 0,
        totalActualWt: shipment.totalActualWt || 0,
        totalVolWt: shipment.totalVolWt || 0,
        basicAmt: shipment.basicAmt || 0,
        saleAmount: shipment.totalAmt || 0,
        sgst: shipment.sgst || 0,
        cgst: shipment.cgst || 0,
        igst: shipment.igst || 0,
        miscChg: shipment.miscChg || 0,
        fuelAmt: shipment.fuelAmt || 0,
        totalAmt: shipment.totalAmt || 0,
        operationRemark: shipment.operationRemark || '',
        isHold: shipment.isHold || false
      }));

      // CALCULATE PAYMENT TOTALS FOR THE SAME DATE RANGE AND ACCOUNT (if specified)
      let paymentQuery = { ...primaryDateFilter };
      
      if (accountCode && accountCode.trim()) {
        paymentQuery.customerCode = accountCode.trim();
      }

      console.log("Payment Query:", JSON.stringify(paymentQuery, null, 2));

      // PAYMENT ENTRY TOTALS
      const paymentTotals = await PaymentEntry.aggregate([
        {
          $match: paymentQuery
        },
        {
          $group: {
            _id: null,
            totalReceiving: { $sum: "$amount" },
            totalDebit: { $sum: "$debitAmount" },
            totalCredit: { $sum: "$creditAmount" },
            paymentCount: { $sum: 1 }
          }
        }
      ]);

      // SHIPMENT TOTALS
      const shipmentTotals = await Shipment.aggregate([
        {
          $match: shipmentQuery
        },
        {
          $group: {
            _id: null,
            totalSale: { $sum: "$totalAmt" },
            totalShipments: { $sum: 1 },
            totalPcs: { $sum: "$pcs" },
            totalActualWeight: { $sum: "$totalActualWt" },
            totalVolumeWeight: { $sum: "$totalVolWt" }
          }
        }
      ]);

      // COMPILE TOTALS
      const totals = {
        totalReceiving: paymentTotals[0]?.totalReceiving || 0,
        totalSale: shipmentTotals[0]?.totalSale || 0,
        totalDebit: paymentTotals[0]?.totalDebit || 0,
        totalCredit: paymentTotals[0]?.totalCredit || 0,
        totalShipments: shipmentTotals[0]?.totalShipments || 0,
        totalPcs: shipmentTotals[0]?.totalPcs || 0,
        totalActualWeight: shipmentTotals[0]?.totalActualWeight || 0,
        totalVolumeWeight: shipmentTotals[0]?.totalVolumeWeight || 0,
        paymentEntries: paymentTotals[0]?.paymentCount || 0
      };

      // GET SUMMARY STATISTICS
      const holdShipments = formattedShipments.filter(s => s.isHold).length;
      const nonHoldShipments = formattedShipments.filter(s => !s.isHold).length;
      const uniqueAccounts = [...new Set(formattedShipments.map(s => s.accountCode).filter(Boolean))];
      const uniqueSectors = [...new Set(formattedShipments.map(s => s.sector).filter(Boolean))];

      // PREPARE COMPREHENSIVE RESPONSE
      return NextResponse.json({
        success: true,
        data: {
          shipments: formattedShipments,
          totals: totals,
          filters: {
            fromDate,
            toDate,
            accountCode: accountCode || null,
            withHoldAWB: withHoldAWB || false,
            holdFilterStatus: withHoldAWB ? 'Hold AWBs Only' : 'All AWBs'
          },
          summary: {
            totalRecords: formattedShipments.length,
            dateRange: `${startDate.toLocaleDateString('en-IN')} to ${endDate.toLocaleDateString('en-IN')}`,
            uniqueAccounts: uniqueAccounts.length,
            accountsList: uniqueAccounts.slice(0, 10),
            uniqueSectors: uniqueSectors.length,
            holdShipments: holdShipments,
            nonHoldShipments: nonHoldShipments,
            appliedFilters: {
              dateFilter: true,
              accountFilter: accountCode ? true : false,
              holdFilter: withHoldAWB || false
            }
          },
          metadata: {
            query: shipmentQuery,
            executionTime: new Date().toISOString(),
            dataSource: "Shipments, PaymentEntry collections"
          }
        }
      });

    } catch (error) {
      console.error("Error processing shipments by date:", error);
      return NextResponse.json({ 
        success: false,
        error: "Error processing shipments data",
        details: error.message 
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json({ 
      success: false,
      error: "Database connection failed",
      details: error.message 
    }, { status: 500 });
  }
}