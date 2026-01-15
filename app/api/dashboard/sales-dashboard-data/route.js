import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/db';
import CustomerAccount from '@/app/model/CustomerAccount';
import Shipment from '@/app/model/portal/Shipment';

export async function GET() {
    await connectDB();

    try {
        // --- Customer Activation Status ---
        const activeCount = await CustomerAccount.countDocuments({ account: "Activate" });
        const nonActiveCount = await CustomerAccount.countDocuments({ account: "Deactivate" });

        const accountStatusData = [
            { name: 'Active', value: activeCount, color: '#EA1B40' },
            { name: 'Non-Active', value: nonActiveCount, color: '#FFBF00' }
        ];

        // --- Top Customers ---
        // convert `date` into a safe date field `dateForAgg` and drop docs that can't be converted
        const topCustomersResult = await Shipment.aggregate([
            {
                $addFields: {
                    dateForAgg: {
                        $convert: {
                            input: "$date",
                            to: "date",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            {
                // keep only docs with a valid dateForAgg
                $match: {
                    dateForAgg: { $ne: null }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$dateForAgg" },
                        month: { $month: "$dateForAgg" },
                        accountCode: "$accountCode"
                    },
                    totalWeight: { $sum: { $ifNull: ["$totalActualWt", 0] } },
                    totalAmount: { $sum: { $ifNull: ["$totalAmt", 0] } },
                    lastBookingDate: { $max: "$dateForAgg" }
                }
            },
            {
                $lookup: {
                    from: "customeraccounts",
                    localField: "_id.accountCode",
                    foreignField: "accountCode",
                    as: "customerInfo"
                }
            },
            { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    yearMonth: {
                        $concat: [
                            { $toString: "$_id.year" }, "-",
                            {
                                $cond: [
                                    { $gte: ["$_id.month", 10] },
                                    { $toString: "$_id.month" },
                                    { $concat: ["0", { $toString: "$_id.month" }] }
                                ]
                            }
                        ]
                    },
                    id: "$_id.accountCode",
                    name: { $ifNull: ["$customerInfo.name", "$_id.accountCode"] },
                    image: { $literal: "customer_logo.png" },
                    weight: "$totalWeight",
                    amount: "$totalAmount",
                    date: "$lastBookingDate"
                }
            },
            { $sort: { yearMonth: 1, weight: -1 } }
        ]);

        const topCustomersData = {};
        topCustomersResult.forEach((entry) => {
            if (!topCustomersData[entry.yearMonth]) topCustomersData[entry.yearMonth] = [];
            topCustomersData[entry.yearMonth].push(entry);
        });
        Object.keys(topCustomersData).forEach(month => {
            topCustomersData[month] = topCustomersData[month]
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 20);
        });

        // --- Sector-wise Revenue ---
        const now = new Date();
        const periods = {
            'Last 7 Days': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            'Last 30 Days': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
            'Last Year': new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
        };

        const sectorList = ['UK', 'USA', 'Australia', 'Europe', 'Canada', 'New Zealand'];
        const sectorWiseData = {};
        for (const [label, startDate] of Object.entries(periods)) {
            const result = await Shipment.aggregate([
                {
                    $addFields: {
                        dateForAgg: {
                            $convert: {
                                input: "$date",
                                to: "date",
                                onError: null,
                                onNull: null
                            }
                        }
                    }
                },
                {
                    $match: {
                        dateForAgg: { $ne: null },
                        dateForAgg: { $gte: startDate, $lte: now },
                        sector: { $in: sectorList }
                    }
                },
                {
                    $group: {
                        _id: "$sector",
                        totalAmount: { $sum: { $ifNull: ["$totalAmt", 0] } }
                    }
                }
            ]);

            const formatted = sectorList.map(sector => {
                const found = result.find(r => r._id === sector);
                return {
                    label: sector,
                    value: found ? found.totalAmount : 0
                };
            });

            sectorWiseData[label] = formatted;
        }

        // --- Service-wise Revenue ---
        const serviceWiseData = {};
        for (const [label, startDate] of Object.entries(periods)) {
            const result = await Shipment.aggregate([
                {
                    $addFields: {
                        dateForAgg: {
                            $convert: {
                                input: "$date",
                                to: "date",
                                onError: null,
                                onNull: null
                            }
                        }
                    }
                },
                {
                    $match: {
                        dateForAgg: { $ne: null },
                        dateForAgg: { $gte: startDate, $lte: now }
                    }
                },
                {
                    $group: {
                        _id: "$service",
                        totalAmount: { $sum: { $ifNull: ["$totalAmt", 0] } }
                    }
                },
                {
                    $project: {
                        label: "$_id",
                        value: "$totalAmount",
                        _id: 0
                    }
                }
            ]);

            const formatted = result.map(service => ({
                label: service.label || 'Unknown',
                value: service.value || 0
            }));

            serviceWiseData[label] = formatted;
        }

        // --- Final Response ---
        return NextResponse.json({
            accountStatusData,
            topCustomersData,
            sectorWiseData,
            serviceWiseData
        }, { status: 200 });

    } catch (error) {
        console.error("Error fetching sales dashboard data:", error);
        return NextResponse.json({ error: "Failed to fetch sales dashboard data" }, { status: 500 });
    }
}
