// File: app/api/booking-report-with-amount/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// Import existing schemas
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

// POST method - Get booking report data by date range with optional filters
export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { 
      fromDate, 
      toDate, 
      accountCode, 
      branch, 
      origin, 
      sector, 
      destination, 
      balanceShipment 
    } = body;

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
        error: "Invalid date format" 
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
      let shipmentQuery = {
        date: {
          $gte: startDate,
          $lte: endDate
        }
      };

      // OPTIONAL FILTERS: Add only if provided
      if (accountCode && accountCode.trim()) {
        shipmentQuery.accountCode = accountCode.trim();
      }

      if (origin && origin.trim()) {
        shipmentQuery.origin = { $regex: new RegExp(origin.trim(), 'i') };
      }

      if (sector && sector.trim()) {
        shipmentQuery.sector = { $regex: new RegExp(sector.trim(), 'i') };
      }

      if (destination && destination.trim()) {
        shipmentQuery.destination = { $regex: new RegExp(destination.trim(), 'i') };
      }

      // Balance shipment filter
      if (balanceShipment === true) {
        // Balance shipments are those without runNo or with empty runNo
        shipmentQuery.$or = [
          { runNo: { $exists: false } },
          { runNo: "" },
          { runNo: null }
        ];
      }

      console.log("Shipment Query:", JSON.stringify(shipmentQuery, null, 2));

      // Get customer accounts for branch filtering and customer name mapping
      let customerAccounts = [];
      let customerMap = {};
      
      try {
        customerAccounts = await CustomerAccount.find({}).lean();
        
        // Create maps for quick lookup
        customerAccounts.forEach(customer => {
          customerMap[customer.accountCode] = {
            name: customer.name || customer.customerName || '',
            branch: customer.branch || '',
            email: customer.email || ''
          };
        });
        
        console.log(`Loaded ${customerAccounts.length} customer accounts`);
      } catch (customerError) {
        console.error("Error fetching customer accounts:", customerError);
        // Continue without customer data
      }

      // If branch filter is specified, get matching account codes
      if (branch && branch.trim()) {
        const matchingCustomers = customerAccounts.filter(customer => 
          customer.branch && customer.branch.toLowerCase() === branch.trim().toLowerCase()
        );
        
        if (matchingCustomers.length === 0) {
          return NextResponse.json({
            success: true,
            data: {
              shipments: [],
              summary: {
                totalRecords: 0,
                message: "No customers found for the specified branch"
              }
            }
          });
        }
        
        const branchAccountCodes = matchingCustomers.map(customer => customer.accountCode);
        
        // Add branch filter to shipment query
        if (shipmentQuery.accountCode) {
          // If accountCode is already specified, check if it matches branch filter
          if (!branchAccountCodes.includes(shipmentQuery.accountCode)) {
            return NextResponse.json({
              success: true,
              data: {
                shipments: [],
                summary: {
                  totalRecords: 0,
                  message: "Specified account code doesn't match the branch filter"
                }
              }
            });
          }
        } else {
          // Apply branch filter
          shipmentQuery.accountCode = { $in: branchAccountCodes };
        }
      }

      // FETCH ALL SHIPMENTS WITHIN DATE RANGE (with optional filters)
      const shipments = await Shipment.find(shipmentQuery)
        .select(
          'awbNo accountCode date runNo flight manifestNo origin sector destination customer receiverFullName receiverAddressLine1 receiverCity receiverState receiverPincode receiverPhoneNumber service upsService pcs content totalActualWt basicAmt sgst cgst igst miscChg miscChgReason fuelAmt totalAmt currency billNo holdReason'
        )
        .sort({ date: -1, accountCode: 1 })
        .lean();

      console.log(`Found ${shipments.length} shipments`);

      // FORMAT SHIPMENTS FOR DISPLAY
      const formattedShipments = shipments.map(shipment => ({
        awbNo: shipment.awbNo || '',
        accountCode: shipment.accountCode || '',
        shipmentDate: shipment.date ? new Date(shipment.date).toLocaleDateString('en-IN') : '',
        runNo: shipment.runNo || '',
        flightDate: shipment.flight || '',
        manifestNumber: shipment.manifestNo || '',
        branch: customerMap[shipment.accountCode]?.branch || '',
        origin: shipment.origin || '',
        sector: shipment.sector || '',
        destination: shipment.destination || '',
        customer: customerMap[shipment.accountCode]?.name || shipment.customer || '',
        receiverFullName: shipment.receiverFullName || '',
        receiverAddressLine1: shipment.receiverAddressLine1 || '',
        receiverCity: shipment.receiverCity || '',
        receiverState: shipment.receiverState || '',
        receiverPincode: shipment.receiverPincode || '',
        receiverPhoneNumber: shipment.receiverPhoneNumber || '',
        service: shipment.service || '',
        upsService: shipment.upsService || '',
        pcs: shipment.pcs || 0,
        goodsDesc: shipment.content || '',
        totalActualWt: shipment.totalActualWt || 0,
        basicAmt: shipment.basicAmt || 0,
        sgst: shipment.sgst || 0,
        cgst: shipment.cgst || 0,
        igst: shipment.igst || 0,
        miscChg: shipment.miscChg || 0,
        miscChgReason: shipment.miscChgReason || '',
        fuelAmt: shipment.fuelAmt || 0,
        totalAmt: shipment.totalAmt || 0,
        currency: shipment.currency || '',
        billNo: shipment.billNo || '',
        awbCheck: '',
        shipmentContent: shipment.content || '',
        holdReason: shipment.holdReason || ''
      }));

      // CALCULATE TOTALS
      const totals = formattedShipments.reduce((acc, shipment) => {
        acc.totalPcs += shipment.pcs || 0;
        acc.totalWeight += shipment.totalActualWt || 0;
        acc.totalBasicAmt += shipment.basicAmt || 0;
        acc.totalSGST += shipment.sgst || 0;
        acc.totalCGST += shipment.cgst || 0;
        acc.totalIGST += shipment.igst || 0;
        acc.totalMiscChg += shipment.miscChg || 0;
        acc.totalFuelAmt += shipment.fuelAmt || 0;
        acc.totalAmt += shipment.totalAmt || 0;
        return acc;
      }, {
        totalPcs: 0,
        totalWeight: 0,
        totalBasicAmt: 0,
        totalSGST: 0,
        totalCGST: 0,
        totalIGST: 0,
        totalMiscChg: 0,
        totalFuelAmt: 0,
        totalAmt: 0
      });

      // GET SUMMARY STATISTICS
      const uniqueAccounts = [...new Set(formattedShipments.map(s => s.accountCode).filter(Boolean))];
      const uniqueBranches = [...new Set(formattedShipments.map(s => s.branch).filter(Boolean))];
      const uniqueOrigins = [...new Set(formattedShipments.map(s => s.origin).filter(Boolean))];
      const uniqueSectors = [...new Set(formattedShipments.map(s => s.sector).filter(Boolean))];
      const uniqueDestinations = [...new Set(formattedShipments.map(s => s.destination).filter(Boolean))];
      const balanceShipmentsCount = formattedShipments.filter(s => !s.runNo || s.runNo.trim() === '').length;

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
            branch: branch || null,
            origin: origin || null,
            sector: sector || null,
            destination: destination || null,
            balanceShipment: balanceShipment || false
          },
          summary: {
            totalRecords: formattedShipments.length,
            dateRange: `${startDate.toLocaleDateString('en-IN')} to ${endDate.toLocaleDateString('en-IN')}`,
            uniqueAccounts: uniqueAccounts.length,
            uniqueBranches: uniqueBranches.length,
            uniqueOrigins: uniqueOrigins.length,
            uniqueSectors: uniqueSectors.length,
            uniqueDestinations: uniqueDestinations.length,
            balanceShipmentsCount: balanceShipmentsCount,
            appliedFilters: {
              dateFilter: true,
              accountFilter: accountCode ? true : false,
              branchFilter: branch ? true : false,
              originFilter: origin ? true : false,
              sectorFilter: sector ? true : false,
              destinationFilter: destination ? true : false,
              balanceFilter: balanceShipment || false
            }
          },
          metadata: {
            query: shipmentQuery,
            executionTime: new Date().toISOString(),
            dataSource: "Shipments, CustomerAccount collections"
          }
        }
      });

    } catch (error) {
      console.error("Error processing booking report:", error);
      return NextResponse.json({ 
        success: false,
        error: "Error processing booking report data",
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

// GET method - For fetching account details and supporting data
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get('accountCode');
    const action = searchParams.get('action');

    // Handle account details lookup
    if (accountCode) {
      try {
        const customer = await CustomerAccount.findOne({ 
          accountCode: accountCode.trim() 
        }).select('name customerName email branch').lean();

        if (customer) {
          return NextResponse.json({
            success: true,
            data: {
              name: customer.name || customer.customerName || '',
              email: customer.email || '',
              branch: customer.branch || '',
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

    if (action === 'customers') {
      try {
        // Get all customer accounts
        const customers = await CustomerAccount.find({})
          .select('accountCode name customerName branch email')
          .sort({ accountCode: 1 })
          .lean();

        return NextResponse.json({
          success: true,
          data: {
            customers: customers.map(customer => ({
              accountCode: customer.accountCode,
              name: customer.name || customer.customerName || '',
              branch: customer.branch || '',
              email: customer.email || ''
            })),
            total: customers.length
          }
        });
      } catch (error) {
        console.error("Error fetching customers:", error);
        return NextResponse.json({ 
          success: false,
          error: "Error fetching customers" 
        }, { status: 500 });
      }
    }

    if (action === 'filters') {
      try {
        // Get unique filter values from shipments
        const filterData = await Shipment.aggregate([
          {
            $group: {
              _id: null,
              branches: { $addToSet: "$branch" },
              origins: { $addToSet: "$origin" },
              sectors: { $addToSet: "$sector" },
              destinations: { $addToSet: "$destination" }
            }
          }
        ]);

        // Get branches from customer accounts as well
        const customerBranches = await CustomerAccount.aggregate([
          {
            $group: {
              _id: null,
              branches: { $addToSet: "$branch" }
            }
          }
        ]);

        const allBranches = [
          ...(filterData[0]?.branches || []),
          ...(customerBranches[0]?.branches || [])
        ].filter(Boolean);

        return NextResponse.json({
          success: true,
          data: {
            branches: [...new Set(allBranches)].sort(),
            origins: (filterData[0]?.origins || []).filter(Boolean).sort(),
            sectors: (filterData[0]?.sectors || []).filter(Boolean).sort(),
            destinations: (filterData[0]?.destinations || []).filter(Boolean).sort()
          }
        });
      } catch (error) {
        console.error("Error fetching filter data:", error);
        return NextResponse.json({ 
          success: false,
          error: "Error fetching filter data" 
        }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: false,
      error: "Invalid request. Provide accountCode or action parameter" 
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