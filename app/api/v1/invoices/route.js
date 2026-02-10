import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import { validateApiKey } from "@/app/lib/Apikeymiddleware";
import Invoice from "@/app/model/Invoice";
import Shipment from "@/app/model/portal/Shipment";

/**
 * Invoice API
 * GET /api/v1/invoices
 * 
 * Query Parameters:
 * - invoiceNumber: Get specific invoice with merged shipment details
 * - fromDate: Start date for filtering (YYYY-MM-DD or ISO format)
 * - toDate: End date for filtering (YYYY-MM-DD or ISO format)
 * - branch: Filter by branch
 * - month: Filter by month (1-12) - optional if fromDate/toDate provided
 * - year: Filter by year (e.g., 2024) - optional if fromDate/toDate provided
 */

await connectDB();

export async function GET(req) {
    try {
        // Validate API key
        const validation = await validateApiKey(req, {
            requiredEndpoint: "/v1/invoices",
            requiredMethod: "GET"
        });

        if (!validation.valid) {
            return validation.response;
        }

        const { apiKey, customer, usage } = validation.data;

        // Extract query parameters
        const { searchParams } = new URL(req.url);
        const invoiceNumber = searchParams.get("invoiceNumber");
        const fromDate = searchParams.get("fromDate");
        const toDate = searchParams.get("toDate");
        const month = searchParams.get("month");
        const year = searchParams.get("year");
        const branch = searchParams.get("branch");

        // ===================================
        // SCENARIO 1: Get Specific Invoice by Invoice Number
        // ===================================
        if (invoiceNumber) {
            console.log(`🔍 API: Searching for invoice: ${invoiceNumber} for accountCode: ${customer.code}`);

            // FIXED: Use correct schema path for accountCode
            const invoice = await Invoice.findOne({ 
                invoiceNumber,
                "customer.accountCode": customer.code // CORRECTED: nested path
            }).lean(); // Use lean() for better performance

            if (!invoice) {
                console.log(`❌ Invoice not found: ${invoiceNumber} for accountCode: ${customer.code}`);

                return NextResponse.json(
                    {
                        success: false,
                        error: "Invoice not found",
                        message: `No invoice found with number: ${invoiceNumber}`,
                        code: "INVOICE_NOT_FOUND"
                    },
                    { status: 404 }
                );
            }

            // Merge shipment details with invoice shipments
            const awbList = (invoice.shipments || [])
                .map((s) => s.awbNo)
                .filter(Boolean);

            let detailedShipments = [];
            if (awbList.length > 0) {
                // FIXED: Use correct field name from Shipment model
                detailedShipments = await Shipment.find({ 
                    awbNo: { $in: awbList },
                    accountCode: customer.code
                }).lean();
            }

            // Create lookup map
            const detailByAwb = detailedShipments.reduce((acc, s) => {
                acc[s.awbNo] = s;
                return acc;
            }, {});

            // Merge invoice shipments with detailed shipment data
            const mergedShipments = (invoice.shipments || []).map((invShip) => {
                const d = detailByAwb[invShip.awbNo] || {};
                
                return {
                    awbNo: invShip.awbNo,
                    date: invShip.date || d.date || null,
                    destination: invShip.destination || d.destination || "",
                    origin: d.origin || "",
                    state: invShip.state || d.state || "",
                    
                    // Receiver details
                    receiverFullName: invShip.receiverFullName || d.receiverFullName || "",
                    receiverCity: invShip.receiverCity || d.receiverCity || "",
                    receiverState: invShip.receiverState || d.receiverState || "",
                    receiverPincode: invShip.receiverPincode || d.receiverPincode || "",
                    receiverAddressLine1: invShip.receiverAddressLine1 || d.receiverAddressLine1 || "",
                    receiverAddressLine2: invShip.receiverAddressLine2 || d.receiverAddressLine2 || "",
                    receiverPhoneNumber: d.receiverPhoneNumber || "",
                    
                    // Shipper details
                    shipperFullName: d.shipperFullName || "",
                    shipperCity: d.shipperCity || "",
                    
                    // Weight details
                    pcs: invShip.pcs || d.pcs || 0,
                    totalActualWt: invShip.totalActualWt || d.totalActualWt || invShip.weight || 0,
                    chargeableWt: d.chargeableWt || 0,
                    totalVolWt: invShip.totalVolWt || d.totalVolWt || 0,
                    
                    // Product/Service details
                    product: invShip.product || d.product || "",
                    service: d.service || "",
                    payment: invShip.payment || d.payment || "",
                    shipmentType: invShip.shipmentType || d.shipmentType || "",
                    goodstype: invShip.goodstype || d.goodstype || "",
                    content: d.content || "",
                    sector: invShip.sector || d.sector || "",
                    
                    // Financial details
                    amount: invShip.amount ?? d.basicAmt ?? d.totalAmt ?? 0,
                    discount: invShip.discount ?? d.discountAmt ?? d.discount ?? 0,
                    miscCharge: invShip.miscCharge ?? d.miscChg ?? 0,
                    taxableAmount: invShip.taxableAmount ?? 
                        ((invShip.amount ?? d.basicAmt ?? 0) - 
                         (invShip.discount ?? d.discountAmt ?? 0)),
                    
                    cgst: d.cgst || 0,
                    sgst: d.sgst || 0,
                    igst: d.igst || 0,
                    fuelAmt: d.fuelAmt || 0,
                    
                    totalAmount: d.totalAmt || 0,
                    
                    // Additional details
                    reference: d.reference || "",
                    status: d.status || "",
                };
            });

            console.log(`✅ Invoice found: ${invoice.invoiceNumber} with ${mergedShipments.length} shipments`);

            // FIXED: Use correct schema paths
            const invoiceData = {
                invoiceNumber: invoice.invoiceNumber,
                invoiceSrNo: invoice.invoiceSrNo,
                accountCode: invoice.customer?.accountCode || customer.code,
                customerName: invoice.customer?.name || customer.name,
                customerDetails: {
                    name: invoice.customer?.name || "",
                    address1: invoice.customer?.address1 || "",
                    address2: invoice.customer?.address2 || "",
                    city: invoice.customer?.city || "",
                    pincode: invoice.customer?.pincode || "",
                    state: invoice.customer?.state || "",
                    country: invoice.customer?.country || "",
                    phone: invoice.customer?.phone || "",
                    gstNo: invoice.customer?.gstNo || "",
                    panNo: invoice.customer?.panNo || "",
                },
                branch: invoice.branch,
                invoiceDate: invoice.invoiceDate,
                fromDate: invoice.fromDate,
                toDate: invoice.toDate,
                financialYear: invoice.financialYear,
                placeOfSupply: invoice.placeOfSupply,
                createdBy: invoice.createdBy,
                
                // Summary
                totalAwb: invoice.totalAwb || mergedShipments.length,
                invoiceSummary: {
                    nonTaxableAmount: invoice.invoiceSummary?.nonTaxableAmount || 0,
                    basicAmount: invoice.invoiceSummary?.basicAmount || 0,
                    discountAmount: invoice.invoiceSummary?.discountAmount || 0,
                    miscChg: invoice.invoiceSummary?.miscChg || 0,
                    fuelChg: invoice.invoiceSummary?.fuelChg || 0,
                    cgst: invoice.invoiceSummary?.cgst || 0,
                    sgst: invoice.invoiceSummary?.sgst || 0,
                    igst: invoice.invoiceSummary?.igst || 0,
                    grandTotal: invoice.invoiceSummary?.grandTotal || 0,
                },
                
                // Shipments with merged details
                shipments: mergedShipments,
                
                // QR Code data
                qrCodeData: invoice.qrCodeData || [],
                
                // Metadata
                createdAt: invoice.createdAt,
                updatedAt: invoice.updatedAt,
            };

            return NextResponse.json(
                {
                    success: true,
                    data: invoiceData,
                    meta: {
                        apiVersion: "v1",
                        endpoint: "/invoices",
                        timestamp: new Date().toISOString(),
                        requestId: generateRequestId(),
                        customer: {
                            code: customer.code,
                            name: customer.name,
                        },
                        usage: {
                            remaining: {
                                hourly: apiKey.rateLimit.requestsPerHour - usage.hourly,
                                daily: apiKey.rateLimit.requestsPerDay - usage.daily,
                            }
                        }
                    }
                },
                { 
                    status: 200,
                    headers: getRateLimitHeaders(apiKey, usage)
                }
            );
        }

        // ===================================
        // SCENARIO 2: List Invoices with Date Range Filter
        // ===================================
        console.log(`📋 API: Fetching invoices for accountCode: ${customer.code}`);

        // FIXED: Build query with correct schema path
        const query = {
            "customer.accountCode": customer.code // CORRECTED: nested path
        };

        // Apply date filters
        let dateFilter = null;

        // Priority 1: fromDate and toDate parameters
        if (fromDate || toDate) {
            dateFilter = {};
            
            if (fromDate) {
                const startDate = new Date(fromDate);
                startDate.setHours(0, 0, 0, 0);
                dateFilter.$gte = startDate;
                console.log(`📅 Filtering from date: ${startDate.toISOString()}`);
            }
            
            if (toDate) {
                const endDate = new Date(toDate);
                endDate.setHours(23, 59, 59, 999);
                dateFilter.$lte = endDate;
                console.log(`📅 Filtering to date: ${endDate.toISOString()}`);
            }
            
            query.invoiceDate = dateFilter;
        }
        // Priority 2: month and year parameters
        else if (month && year) {
            const monthNum = parseInt(month);
            const yearNum = parseInt(year);
            
            if (monthNum >= 1 && monthNum <= 12) {
                const startOfMonth = new Date(yearNum, monthNum - 1, 1, 0, 0, 0, 0);
                const endOfMonth = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
                
                query.invoiceDate = {
                    $gte: startOfMonth,
                    $lte: endOfMonth
                };
                
                console.log(`📅 Filtering by month: ${monthNum}/${yearNum}`);
            }
        }
        // Priority 3: year only
        else if (year) {
            const yearNum = parseInt(year);
            const startOfYear = new Date(yearNum, 0, 1, 0, 0, 0, 0);
            const endOfYear = new Date(yearNum, 11, 31, 23, 59, 59, 999);
            
            query.invoiceDate = {
                $gte: startOfYear,
                $lte: endOfYear
            };
            
            console.log(`📅 Filtering by year: ${yearNum}`);
        }

        // Apply branch filter
        if (branch) {
            query.branch = branch;
            console.log(`🏢 Filtering by branch: ${branch}`);
        }

        console.log('🔍 Query:', JSON.stringify(query, null, 2));

        // FIXED: Fetch invoices with correct field projections
        const invoices = await Invoice.find(query)
            .select({
                invoiceNumber: 1,
                invoiceSrNo: 1,
                branch: 1,
                invoiceDate: 1,
                fromDate: 1,
                toDate: 1,
                totalAwb: 1,
                financialYear: 1,
                "customer.name": 1,
                "customer.accountCode": 1,
                "invoiceSummary.grandTotal": 1,
                "invoiceSummary.basicAmount": 1,
                "invoiceSummary.discountAmount": 1,
                "invoiceSummary.cgst": 1,
                "invoiceSummary.sgst": 1,
                "invoiceSummary.igst": 1,
                createdAt: 1,
                updatedAt: 1
            })
            .sort({ invoiceDate: -1 })
            .limit(100)
            .lean();

        console.log(`✅ Found ${invoices.length} invoices for accountCode: ${customer.code}`);

        if (!invoices.length) {
            return NextResponse.json(
                {
                    success: true,
                    data: {
                        invoices: [],
                        branches: [],
                        totalCount: 0,
                        summary: {
                            totalInvoices: 0,
                            totalAmount: 0,
                            totalShipments: 0,
                            totalTax: 0
                        }
                    },
                    message: "No invoices found for the specified filters",
                    meta: {
                        apiVersion: "v1",
                        endpoint: "/invoices",
                        timestamp: new Date().toISOString(),
                        requestId: generateRequestId(),
                        customer: {
                            code: customer.code,
                            name: customer.name,
                        },
                        filters: {
                            fromDate: fromDate || null,
                            toDate: toDate || null,
                            month: month || null,
                            year: year || null,
                            branch: branch || null
                        },
                        usage: {
                            remaining: {
                                hourly: apiKey.rateLimit.requestsPerHour - usage.hourly,
                                daily: apiKey.rateLimit.requestsPerDay - usage.daily,
                            }
                        }
                    }
                },
                { 
                    status: 200,
                    headers: getRateLimitHeaders(apiKey, usage)
                }
            );
        }

        // Extract unique branches from results
        const uniqueBranches = [
            ...new Set(
                invoices
                    .map((i) => i.branch)
                    .filter((branch) => branch != null && branch !== "")
            ),
        ];

        // Calculate summary statistics
        const summary = {
            totalInvoices: invoices.length,
            totalAmount: invoices.reduce((sum, inv) => 
                sum + (inv.invoiceSummary?.grandTotal || 0), 0
            ),
            totalShipments: invoices.reduce((sum, inv) => 
                sum + (inv.totalAwb || 0), 0
            ),
            totalTax: invoices.reduce((sum, inv) => {
                const cgst = inv.invoiceSummary?.cgst || 0;
                const sgst = inv.invoiceSummary?.sgst || 0;
                const igst = inv.invoiceSummary?.igst || 0;
                return sum + cgst + sgst + igst;
            }, 0)
        };

        // Format invoice list for response
        const formattedInvoices = invoices.map(inv => ({
            invoiceNumber: inv.invoiceNumber,
            invoiceSrNo: inv.invoiceSrNo,
            branch: inv.branch,
            invoiceDate: inv.invoiceDate,
            fromDate: inv.fromDate,
            toDate: inv.toDate,
            financialYear: inv.financialYear,
            customerName: inv.customer?.name || "",
            totalAwb: inv.totalAwb,
            grandTotal: inv.invoiceSummary?.grandTotal || 0,
            basicAmount: inv.invoiceSummary?.basicAmount || 0,
            discountAmount: inv.invoiceSummary?.discountAmount || 0,
            cgst: inv.invoiceSummary?.cgst || 0,
            sgst: inv.invoiceSummary?.sgst || 0,
            igst: inv.invoiceSummary?.igst || 0,
            createdAt: inv.createdAt,
            updatedAt: inv.updatedAt
        }));

        return NextResponse.json(
            {
                success: true,
                data: {
                    invoices: formattedInvoices,
                    branches: uniqueBranches,
                    totalCount: invoices.length,
                    summary: summary
                },
                meta: {
                    apiVersion: "v1",
                    endpoint: "/invoices",
                    timestamp: new Date().toISOString(),
                    requestId: generateRequestId(),
                    customer: {
                        code: customer.code,
                        name: customer.name,
                    },
                    filters: {
                        fromDate: fromDate || null,
                        toDate: toDate || null,
                        month: month || null,
                        year: year || null,
                        branch: branch || null,
                        appliedFilter: fromDate || toDate ? "date_range" : 
                                      month && year ? "month_year" :
                                      year ? "year" : "all"
                    },
                    usage: {
                        remaining: {
                            hourly: apiKey.rateLimit.requestsPerHour - usage.hourly,
                            daily: apiKey.rateLimit.requestsPerDay - usage.daily,
                        }
                    }
                }
            },
            { 
                status: 200,
                headers: getRateLimitHeaders(apiKey, usage)
            }
        );

    } catch (error) {
        console.error("❌ Invoice API Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Internal server error",
                message: "An error occurred while fetching invoices",
                code: "INTERNAL_ERROR",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            },
            { status: 500 }
        );
    }
}

// Helper functions
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function getRateLimitHeaders(apiKey, usage) {
    return {
        'X-Rate-Limit-Hourly': apiKey.rateLimit.requestsPerHour.toString(),
        'X-Rate-Limit-Remaining-Hourly': (apiKey.rateLimit.requestsPerHour - usage.hourly).toString(),
        'X-Rate-Limit-Daily': apiKey.rateLimit.requestsPerDay.toString(),
        'X-Rate-Limit-Remaining-Daily': (apiKey.rateLimit.requestsPerDay - usage.daily).toString(),
    };
}