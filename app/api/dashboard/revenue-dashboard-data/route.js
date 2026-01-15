// app/api/monthly-data/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/db';
import Shipment from '@/app/model/portal/Shipment';
import CustomerAccount from '@/app/model/CustomerAccount';

export async function GET() {
    await connectDB();

    try {
        // Helper: safe date conversion stage to reuse in pipelines
        const addSafeDateStage = {
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
        };

        // --- Monthly Revenue & Weight ---
        const revenueResult = await Shipment.aggregate([
            addSafeDateStage,
            { $match: { dateForAgg: { $ne: null } } },
            {
                $group: {
                    _id: {
                        year: { $year: "$dateForAgg" },
                        month: { $month: "$dateForAgg" },
                    },
                    totalRevenue: { $sum: { $ifNull: ["$totalAmt", 0] } },
                    totalWeight: { $sum: { $ifNull: ["$totalActualWt", 0] } },
                },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]);

        const monthlyRevenueData = {};
        revenueResult.forEach((entry) => {
            const yearMonth = `${entry._id.year}-${String(entry._id.month).padStart(2, '0')}`;
            monthlyRevenueData[yearMonth] = {
                value1: { label: "Revenue", amount: entry.totalRevenue },
                value2: { label: "Weight", amount: entry.totalWeight },
            };
        });

        // --- Monthly State-wise Shipment Count ---
        const stateResult = await Shipment.aggregate([
            addSafeDateStage,
            { $match: { dateForAgg: { $ne: null } } },
            {
                $group: {
                    _id: {
                        year: { $year: "$dateForAgg" },
                        month: { $month: "$dateForAgg" },
                        state: "$shipperState"
                    },
                    total: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.state": 1 } }
        ]);

        const monthlyStateData = {};
        stateResult.forEach((entry) => {
            const yearMonth = `${entry._id.year}-${String(entry._id.month).padStart(2, '0')}`;
            if (!monthlyStateData[yearMonth]) monthlyStateData[yearMonth] = [];
            monthlyStateData[yearMonth].push({
                name: entry._id.state,
                value: entry.total
            });
        });

        // --- Monthly Sector-wise Shipment Count ---
        const predefinedSectors = ["UK", "USA", "Canada", "Europe", "Australia", "New Zealand"];

        const sectorResult = await Shipment.aggregate([
            addSafeDateStage,
            { $match: { dateForAgg: { $ne: null } } },
            {
                $group: {
                    _id: {
                        year: { $year: "$dateForAgg" },
                        month: { $month: "$dateForAgg" },
                        sector: "$sector"
                    },
                    total: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.sector": 1 } }
        ]);

        const monthlySectorData = {};
        sectorResult.forEach((entry) => {
            const yearMonth = `${entry._id.year}-${String(entry._id.month).padStart(2, '0')}`;
            if (!monthlySectorData[yearMonth]) {
                monthlySectorData[yearMonth] = predefinedSectors.map(sector => ({
                    name: sector,
                    value: 0
                }));
            }
            const sectorEntry = monthlySectorData[yearMonth].find(s => s.name === entry._id.sector);
            if (sectorEntry) {
                sectorEntry.value = entry.total;
            } else {
                // push unknown sectors too
                monthlySectorData[yearMonth].push({
                    name: entry._id.sector,
                    value: entry.total
                });
            }
        });

        // --- Top Sector-wise Shipment Weight + Most Common City ---
        const sectorCodeMapping = {
            "UK": { code: "UK", cityFallback: "London" },
            "USA": { code: "USA", cityFallback: "California" },
            "Canada": { code: "CA", cityFallback: "Vancouver" },
            "Europe": { code: "EU", cityFallback: "Paris" },
            "Australia": { code: "AUS", cityFallback: "Sydney" },
            "New Zealand": { code: "NZ", cityFallback: "Wellington" },
        };

        const sectorCityWeightResult = await Shipment.aggregate([
            {
                $group: {
                    _id: {
                        sector: "$sector",
                        receiverCity: "$receiverCity"
                    },
                    totalWeight: { $sum: { $ifNull: ["$totalActualWt", 0] } },
                    count: { $sum: 1 }
                }
            }
        ]);

        const sectorWiseData = {};
        sectorCityWeightResult.forEach((entry) => {
            const sector = entry._id.sector;
            const city = entry._id.receiverCity || 'Unknown';
            const weight = entry.totalWeight || 0;
            const count = entry.count || 0;

            if (!sectorWiseData[sector]) {
                sectorWiseData[sector] = { totalWeight: 0, cities: {} };
            }
            sectorWiseData[sector].totalWeight += weight;
            sectorWiseData[sector].cities[city] = (sectorWiseData[sector].cities[city] || 0) + count;
        });

        const topSectorsData = predefinedSectors.map(sector => {
            const data = sectorWiseData[sector] || { totalWeight: 0, cities: {} };
            let mostCommonCity = sectorCodeMapping[sector]?.cityFallback || "Unknown";

            if (Object.keys(data.cities).length > 0) {
                mostCommonCity = Object.entries(data.cities).sort((a, b) => b[1] - a[1])[0][0];
            }

            return {
                weight: data.totalWeight,
                city: mostCommonCity,
                sector: sector,
                code: sectorCodeMapping[sector]?.code || sector
            };
        });

        // --- Top customers (monthly) ---
        const topCustomersResult = await Shipment.aggregate([
            addSafeDateStage,
            { $match: { dateForAgg: { $ne: null } } },
            {
                $group: {
                    _id: {
                        year: { $year: "$dateForAgg" },
                        month: { $month: "$dateForAgg" },
                        accountCode: "$accountCode"
                    },
                    totalWeight: { $sum: { $ifNull: ["$totalActualWt", 0] } },
                    totalAmount: { $sum: { $ifNull: ["$totalAmt", 0] } },
                    lastBookingDate: { $max: "$dateForAgg" },
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
                            { $toString: "$_id.year" },
                            "-",
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

        // --- Top Sales Person Monthly ---
        const topSalesPersonMonthly = await Shipment.aggregate([
            addSafeDateStage,
            { $match: { dateForAgg: { $ne: null } } },
            {
                $lookup: {
                    from: "customeraccounts",
                    localField: "accountCode",
                    foreignField: "accountCode",
                    as: "customerInfo"
                }
            },
            { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: {
                        year: { $year: "$dateForAgg" },
                        month: { $month: "$dateForAgg" },
                        salesPerson: "$customerInfo.salesPersonName"
                    },
                    totalWeight: { $sum: { $ifNull: ["$totalActualWt", 0] } },
                    totalAmount: { $sum: { $ifNull: ["$totalAmt", 0] } }
                }
            },
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
                    name: "$_id.salesPerson",
                    state: { $literal: "Delhi" },
                    image: { $literal: "profile_customer.png" },
                    weight: "$totalWeight",
                    amount: "$totalAmount"
                }
            },
            { $match: { name: { $ne: null } } },
            { $sort: { yearMonth: 1, weight: -1 } }
        ]);

        const topSalesPersonsData = {};
        topSalesPersonMonthly.forEach(({ yearMonth, ...rest }) => {
            if (!topSalesPersonsData[yearMonth]) topSalesPersonsData[yearMonth] = [];
            topSalesPersonsData[yearMonth].push(rest);
        });
        Object.keys(topSalesPersonsData).forEach(month => {
            topSalesPersonsData[month] = topSalesPersonsData[month]
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 20);
        });

        // --- Hub Wise ---
        const hubWiseAggregation = await Shipment.aggregate([
            addSafeDateStage,
            { $match: { dateForAgg: { $ne: null } } },
            {
                $lookup: {
                    from: "customeraccounts",
                    localField: "accountCode",
                    foreignField: "accountCode",
                    as: "customerInfo"
                }
            },
            { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: {
                        year: { $year: "$dateForAgg" },
                        month: { $month: "$dateForAgg" },
                        branchName: "$customerInfo.branchName"
                    },
                    totalWt: { $sum: { $ifNull: ["$totalActualWt", 0] } }
                }
            },
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
                    name: "$_id.branchName",
                    value: "$totalWt"
                }
            },
            { $match: { name: { $ne: null } } },
            { $sort: { yearMonth: 1, value: -1 } }
        ]);
        const hubWiseData = {};
        hubWiseAggregation.forEach(({ yearMonth, name, value }) => {
            if (!hubWiseData[yearMonth]) hubWiseData[yearMonth] = [];
            hubWiseData[yearMonth].push({ name, value });
        });

        // --- Monthly Outstanding Data (skeleton using monthlyRevenueData) ---
        const monthlyOutstandingData = {};
        Object.entries(monthlyRevenueData).forEach(([yearMonth, revenueData]) => {
            monthlyOutstandingData[yearMonth] = {
                value1: { label: "Outstanding", amount: 0 },
                value2: { label: "Total Sales", amount: revenueData.value1.amount || 0 }
            };
        });

        return NextResponse.json({
            monthlyRevenueData,
            monthlyStateData,
            monthlySectorData,
            topSectorsData,
            topCustomersData,
            topSalesPersonsData,
            hubWiseData,
            monthlyOutstandingData
        }, { status: 200 });

    } catch (err) {
        console.error("Failed to fetch monthly data:", err);
        return NextResponse.json({ error: "Failed to fetch monthly data" }, { status: 500 });
    }
}
