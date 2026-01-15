import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/db';
import Shipment from '@/app/model/portal/Shipment';
import CustomerAccount from '@/app/model/CustomerAccount';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function GET(request) {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const title = searchParams.get('title');

    if (!month || !title) {
        return NextResponse.json({ error: "Month and title query params are required." }, { status: 400 });
    }

    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
        return NextResponse.json({ error: "Invalid month parameter. Expect YYYY-MM." }, { status: 400 });
    }

    try {
        const start = new Date(year, monthNum - 1, 1);
        const end = new Date(year, monthNum, 1);

        // Shared stage to convert date fields safely to real Date objects for aggregation
        const addSafeDatesStage = {
            $addFields: {
                dateForAgg: {
                    $convert: { input: "$date", to: "date", onError: null, onNull: null }
                },
                createdAtForAgg: {
                    $convert: { input: "$createdAt", to: "date", onError: null, onNull: null }
                }
            }
        };

        // Match on the converted date
        const dateMatchStage = { $match: { dateForAgg: { $gte: start, $lt: end } } };

        if (title === "OUTSTANDING") {
            const shipments = await Shipment.aggregate([
                addSafeDatesStage,
                dateMatchStage,
                {
                    $lookup: {
                        from: "customeraccounts",
                        localField: "accountCode",
                        foreignField: "accountCode",
                        as: "customer"
                    }
                },
                { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        accountCode: "$accountCode",
                        name: { $ifNull: ["$customer.name", "$accountCode"] },
                        awbNo: 1,
                        dateForAgg: 1,
                        createdAtForAgg: 1,
                        creditLimitUsed: { $literal: 0 },
                        totalAmt: 1
                    }
                }
            ]);

            const headers = [
                "Account Code", "Name", "AWB No", "Date", "Time", "Credit Limit Used", "Total Amount"
            ];
            const csvRows = [headers.join(',')];

            let totalCredit = 0, totalAmt = 0;

            shipments.forEach(s => {
                // use converted date fields
                const dateVal = s.dateForAgg ? dayjs(s.dateForAgg).tz('Asia/Kolkata').format('DD-MM-YYYY') : '';
                const timeVal = s.createdAtForAgg ? dayjs(s.createdAtForAgg).tz('Asia/Kolkata').format('HH:mm:ss') : '';

                const creditUsed = Number(s.creditLimitUsed || 0);
                const amount = Number(s.totalAmt || 0);

                // Quote string fields to be CSV-safe
                const row = [
                    `"${String(s.accountCode || '')}"`,
                    `"${String(s.name || '')}"`,
                    `"${String(s.awbNo || '')}"`,
                    `"${dateVal}"`,
                    `"${timeVal}"`,
                    creditUsed.toFixed(2),
                    amount.toFixed(2)
                ];

                csvRows.push(row.join(','));

                totalCredit += creditUsed;
                totalAmt += amount;
            });

            csvRows.push("");
            csvRows.push(["", `"TOTALS"`, "", "", "", totalCredit.toFixed(2), totalAmt.toFixed(2)].join(','));

            return new Response(csvRows.join('\n'), {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="outstanding_report_${month}.csv"`
                }
            });
        } else {
            // TOTAL REVENUE
            const shipments = await Shipment.aggregate([
                addSafeDatesStage,
                dateMatchStage,
                {
                    $lookup: {
                        from: "customeraccounts",
                        localField: "accountCode",
                        foreignField: "accountCode",
                        as: "customer"
                    }
                },
                { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        accountCode: "$accountCode",
                        name: { $ifNull: ["$customer.name", "$accountCode"] },
                        awbNo: 1,
                        dateForAgg: 1,
                        createdAtForAgg: 1,
                        sector: 1,
                        destination: "$receiverCity",
                        basicAmt: { $ifNull: ["$basicAmt", 0] },
                        cgst: { $ifNull: ["$cgst", 0] },
                        sgst: { $ifNull: ["$sgst", 0] },
                        totalAmt: { $ifNull: ["$totalAmt", 0] },
                        totalActualWt: { $ifNull: ["$totalActualWt", 0] },
                        totalVolWt: { $ifNull: ["$totalVolWt", 0] }
                    }
                }
            ]);

            const headers = [
                "Account Code", "Name", "AWB No", "Date", "Time", "Sector", "Destination",
                "Basic Amount", "CGST", "SGST", "Total Amount", "Total Actual Weight", "Total Volumetric Weight"
            ];
            const csvRows = [headers.join(',')];

            let totals = { basicAmt: 0, cgst: 0, sgst: 0, totalAmt: 0, totalActualWt: 0, totalVolWt: 0 };

            shipments.forEach(s => {
                const dateVal = s.dateForAgg ? dayjs(s.dateForAgg).tz('Asia/Kolkata').format('YYYY-MM-DD') : '';
                const timeVal = s.createdAtForAgg ? dayjs(s.createdAtForAgg).tz('Asia/Kolkata').format('HH:mm:ss') : '';

                const basicAmt = Number(s.basicAmt || 0);
                const cgst = Number(s.cgst || 0);
                const sgst = Number(s.sgst || 0);
                const totalAmt = Number(s.totalAmt || 0);
                const totalActualWt = Number(s.totalActualWt || 0);
                const totalVolWt = Number(s.totalVolWt || 0);

                const row = [
                    `"${String(s.accountCode || '')}"`,
                    `"${String(s.name || '')}"`,
                    `"${String(s.awbNo || '')}"`,
                    `"${dateVal}"`,
                    `"${timeVal}"`,
                    `"${String(s.sector || '')}"`,
                    `"${String(s.destination || '')}"`,
                    basicAmt.toFixed(2),
                    cgst.toFixed(2),
                    sgst.toFixed(2),
                    totalAmt.toFixed(2),
                    totalActualWt.toFixed(2),
                    totalVolWt.toFixed(2)
                ];

                csvRows.push(row.join(','));

                totals.basicAmt += basicAmt;
                totals.cgst += cgst;
                totals.sgst += sgst;
                totals.totalAmt += totalAmt;
                totals.totalActualWt += totalActualWt;
                totals.totalVolWt += totalVolWt;
            });

            csvRows.push("");
            csvRows.push([
                "", `"TOTALS"`, "", "", "", "", "",
                totals.basicAmt.toFixed(2),
                totals.cgst.toFixed(2),
                totals.sgst.toFixed(2),
                totals.totalAmt.toFixed(2),
                totals.totalActualWt.toFixed(2),
                totals.totalVolWt.toFixed(2)
            ].join(','));

            return new Response(csvRows.join('\n'), {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="revenue_report_${month}.csv"`
                }
            });
        }
    } catch (err) {
        console.error("Failed to generate CSV:", err);
        return NextResponse.json({ error: "Failed to generate CSV data" }, { status: 500 });
    }
}
