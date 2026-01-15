// new-sale-report/comparison/route.js
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import { NextResponse } from "next/server";

await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const rawMode =
      searchParams.get("mode") || searchParams.get("type") || "State";
    const mode = rawMode.trim().toLowerCase();

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing from/to dates" },
        { status: 400 }
      );
    }

    // ---------- Calculate previous month automatically ----------
    const fromDateObj = new Date(from);
    const toDateObj = new Date(to);
    const prevFromObj = new Date(fromDateObj);
    prevFromObj.setMonth(prevFromObj.getMonth() - 1);
    const prevToObj = new Date(toDateObj);
    prevToObj.setMonth(prevToObj.getMonth() - 1);

    const prevFrom = prevFromObj.toISOString().split("T")[0];
    const prevTo = prevToObj.toISOString().split("T")[0];

    // ---------- Aggregation helper ----------
    const buildAggregation = (
      start,
      end,
      groupByField,
      includeAccount = false
    ) => {
      const pipeline = [
        {
          $match: {
            date: { $gte: new Date(start), $lte: new Date(end + "T23:59:59") },
          },
        },
      ];

      if (includeAccount) {
        pipeline.push({
          $lookup: {
            from: "customeraccounts",
            localField: "accountCode",
            foreignField: "accountCode",
            as: "account",
          },
        });
        pipeline.push({
          $unwind: { path: "$account", preserveNullAndEmptyArrays: true },
        });
      }

      pipeline.push({
        $group: {
          _id: groupByField,
          awbCount: { $sum: 1 },
          chargeableWeight: { $sum: "$totalVolWt" },
          revenue: { $sum: "$basicAmt" },
          igst: { $sum: { $add: ["$sgst", "$cgst"] } },
          grandTotal: { $sum: "$totalAmt" },
          ...(includeAccount
            ? {
                customerSet: {
                  $addToSet: {
                    $cond: [
                      { $eq: ["$account.accountType", "customer"] },
                      "$accountCode",
                      null,
                    ],
                  },
                },
                agentSet: {
                  $addToSet: {
                    $cond: [
                      { $eq: ["$account.accountType", "agent"] },
                      "$accountCode",
                      null,
                    ],
                  },
                },
              }
            : {}),
        },
      });

      return pipeline;
    };

    let comparisonArray = [];

    if (mode === "state") {
      const currentAgg = await Shipment.aggregate(
        buildAggregation(
          from,
          to,
          { state: { $ifNull: ["$shipperState", "Unknown"] } },
          true
        )
      );

      const prevAgg = await Shipment.aggregate(
        buildAggregation(
          prevFrom,
          prevTo,
          { state: { $ifNull: ["$shipperState", "Unknown"] } },
          false
        )
      );

      const prevMap = {};
      prevAgg.forEach((p) => {
        prevMap[p._id.state.toLowerCase()] = p.grandTotal;
      });

      comparisonArray = currentAgg.map((r) => ({
        state: r._id.state,
        customerCount: r.customerSet.filter(Boolean).length,
        agentCount: r.agentSet.filter(Boolean).length,
        total:
          r.customerSet.filter(Boolean).length +
          r.agentSet.filter(Boolean).length,
        awbCount: r.awbCount,
        chargeableWeight: r.chargeableWeight,
        revenue: r.revenue,
        igst: r.igst,
        grandTotal: r.grandTotal,
        grandTotalRef: prevMap[r._id.state.toLowerCase()] || 0,
        diff: r.grandTotal - (prevMap[r._id.state.toLowerCase()] || 0),
      }));
    } else if (mode === "product") {
      const currentAgg = await Shipment.aggregate(
        buildAggregation(
          from,
          to,
          { product: { $ifNull: ["$goodsDesc", "$goodstype"] } },
          false
        )
      );

      const prevAgg = await Shipment.aggregate(
        buildAggregation(
          prevFrom,
          prevTo,
          { product: { $ifNull: ["$goodsDesc", "$goodstype"] } },
          false
        )
      );

      const prevMap = {};
      prevAgg.forEach((p) => {
        prevMap[(p._id.product || "unknown").toLowerCase()] = p.grandTotal;
      });

      comparisonArray = currentAgg.map((r) => ({
        product: r._id.product || "Unknown",
        awbCount: r.awbCount,
        chargeableWeight: r.chargeableWeight,
        revenue: r.revenue,
        igst: r.igst,
        grandTotal: r.grandTotal,
        grandTotalRef: prevMap[(r._id.product || "unknown").toLowerCase()] || 0,
        diff:
          r.grandTotal -
          (prevMap[(r._id.product || "unknown").toLowerCase()] || 0),
      }));
    } else if (mode === "hub") {
      // Optimized hub aggregation using MongoDB pipeline
      const currentAgg = await Shipment.aggregate([
        {
          $match: {
            date: { $gte: new Date(from), $lte: new Date(to + "T23:59:59") },
          },
        },
        {
          $lookup: {
            from: "customeraccounts",
            localField: "accountCode",
            foreignField: "accountCode",
            as: "account",
          },
        },
        {
          $addFields: {
            hubValue: {
              $trim: {
                input: {
                  $toString: {
                    $ifNull: [
                      { $arrayElemAt: ["$account.hub", 0] },
                      { $ifNull: ["$hub", "Unknown"] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: { $toLower: "$hubValue" },
            hub: { $first: "$hubValue" },
            awbCount: { $sum: 1 },
            chargeableWeight: { $sum: { $ifNull: ["$totalVolWt", 0] } },
            revenue: { $sum: { $ifNull: ["$basicAmt", 0] } },
            igst: {
              $sum: {
                $add: [{ $ifNull: ["$sgst", 0] }, { $ifNull: ["$cgst", 0] }],
              },
            },
            grandTotal: { $sum: { $ifNull: ["$totalAmt", 0] } },
          },
        },
      ]);

      const prevAgg = await Shipment.aggregate([
        {
          $match: {
            date: {
              $gte: new Date(prevFrom),
              $lte: new Date(prevTo + "T23:59:59"),
            },
          },
        },
        {
          $lookup: {
            from: "customeraccounts",
            localField: "accountCode",
            foreignField: "accountCode",
            as: "account",
          },
        },
        {
          $addFields: {
            hubValue: {
              $trim: {
                input: {
                  $toString: {
                    $ifNull: [
                      { $arrayElemAt: ["$account.hub", 0] },
                      { $ifNull: ["$hub", "Unknown"] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: { $toLower: "$hubValue" },
            grandTotal: { $sum: { $ifNull: ["$totalAmt", 0] } },
          },
        },
      ]);

      const prevMap = {};
      prevAgg.forEach((p) => {
        prevMap[p._id] = p.grandTotal;
      });

      comparisonArray = currentAgg.map((r) => ({
        hub: r.hub,
        awbCount: r.awbCount,
        chargeableWeight: r.chargeableWeight,
        revenue: r.revenue,
        igst: r.igst,
        grandTotal: r.grandTotal,
        grandTotalRef: prevMap[r._id] || 0,
        diff: r.grandTotal - (prevMap[r._id] || 0),
      }));
    } else if (mode.includes("sec")) {
      // Optimized sec&hub aggregation using MongoDB pipeline
      const currentAgg = await Shipment.aggregate([
        {
          $match: {
            date: { $gte: new Date(from), $lte: new Date(to + "T23:59:59") },
          },
        },
        {
          $lookup: {
            from: "customeraccounts",
            localField: "accountCode",
            foreignField: "accountCode",
            as: "account",
          },
        },
        {
          $addFields: {
            secValue: {
              $trim: {
                input: {
                  $toString: {
                    $ifNull: ["$sector", { $ifNull: ["$sec", "Unknown"] }],
                  },
                },
              },
            },
            hubValue: {
              $trim: {
                input: {
                  $toString: {
                    $ifNull: [
                      { $arrayElemAt: ["$account.hub", 0] },
                      { $ifNull: ["$hub", "Unknown"] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $facet: {
            secData: [
              {
                $group: {
                  _id: "$secValue",
                  sec: { $first: "$secValue" },
                  awbCount: { $sum: 1 },
                  chargeableWeight: { $sum: { $ifNull: ["$totalVolWt", 0] } },
                  revenue: { $sum: { $ifNull: ["$basicAmt", 0] } },
                  igst: {
                    $sum: {
                      $add: [
                        { $ifNull: ["$sgst", 0] },
                        { $ifNull: ["$cgst", 0] },
                      ],
                    },
                  },
                  grandTotal: { $sum: { $ifNull: ["$totalAmt", 0] } },
                },
              },
            ],
            hubData: [
              {
                $group: {
                  _id: {
                    sec: "$secValue",
                    hub: "$hubValue",
                  },
                  sec: { $first: "$secValue" },
                  hub: { $first: "$hubValue" },
                  awbCount: { $sum: 1 },
                  chargeableWeight: { $sum: { $ifNull: ["$totalVolWt", 0] } },
                  revenue: { $sum: { $ifNull: ["$basicAmt", 0] } },
                  igst: {
                    $sum: {
                      $add: [
                        { $ifNull: ["$sgst", 0] },
                        { $ifNull: ["$cgst", 0] },
                      ],
                    },
                  },
                  grandTotal: { $sum: { $ifNull: ["$totalAmt", 0] } },
                },
              },
            ],
          },
        },
      ]);

      const prevAgg = await Shipment.aggregate([
        {
          $match: {
            date: {
              $gte: new Date(prevFrom),
              $lte: new Date(prevTo + "T23:59:59"),
            },
          },
        },
        {
          $lookup: {
            from: "customeraccounts",
            localField: "accountCode",
            foreignField: "accountCode",
            as: "account",
          },
        },
        {
          $addFields: {
            secValue: {
              $trim: {
                input: {
                  $toString: {
                    $ifNull: ["$sector", { $ifNull: ["$sec", "Unknown"] }],
                  },
                },
              },
            },
            hubValue: {
              $trim: {
                input: {
                  $toString: {
                    $ifNull: [
                      { $arrayElemAt: ["$account.hub", 0] },
                      { $ifNull: ["$hub", "Unknown"] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $facet: {
            secData: [
              {
                $group: {
                  _id: "$secValue",
                  grandTotal: { $sum: { $ifNull: ["$totalAmt", 0] } },
                },
              },
            ],
            hubData: [
              {
                $group: {
                  _id: {
                    sec: "$secValue",
                    hub: "$hubValue",
                  },
                  grandTotal: { $sum: { $ifNull: ["$totalAmt", 0] } },
                },
              },
            ],
          },
        },
      ]);

      const prevSecMap = {};
      const prevHubMap = {};

      prevAgg[0].secData.forEach((p) => {
        prevSecMap[p._id] = p.grandTotal;
      });

      prevAgg[0].hubData.forEach((p) => {
        prevHubMap[`${p._id.sec}|${p._id.hub}`] = p.grandTotal;
      });

      // Build comparison array maintaining the same structure
      const secMap = {};

      // First, organize hub data by sec
      currentAgg[0].hubData.forEach((h) => {
        if (!secMap[h.sec]) {
          secMap[h.sec] = { hubs: [] };
        }
        secMap[h.sec].hubs.push(h);
      });

      comparisonArray = [];

      currentAgg[0].secData.forEach((secRow) => {
        // Add SEC row
        comparisonArray.push({
          rowType: "SEC",
          secHub: secRow.sec,
          awbCount: secRow.awbCount,
          chargeableWeight: secRow.chargeableWeight,
          revenue: secRow.revenue,
          igst: secRow.igst,
          grandTotal: secRow.grandTotal,
          grandTotalRef: prevSecMap[secRow.sec] || 0,
          diff: secRow.grandTotal - (prevSecMap[secRow.sec] || 0),
        });

        // Add HUB rows for this SEC
        if (secMap[secRow.sec] && secMap[secRow.sec].hubs) {
          secMap[secRow.sec].hubs.forEach((h) => {
            const prevHubTotal = prevHubMap[`${h.sec}|${h.hub}`] || 0;
            comparisonArray.push({
              rowType: "HUB",
              secHub: h.hub,
              parentSec: secRow.sec,
              hub: h.hub,
              awbCount: h.awbCount,
              chargeableWeight: h.chargeableWeight,
              revenue: h.revenue,
              igst: h.igst,
              grandTotal: h.grandTotal,
              grandTotalRef: prevHubTotal,
              diff: h.grandTotal - prevHubTotal,
            });
          });
        }
      });
    }

    const totalCount = comparisonArray.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const paginated = comparisonArray.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      data: paginated,
      page,
      limit,
      totalPages,
      totalCount,
    });
  } catch (err) {
    console.error("Error building comparison:", err);
    return NextResponse.json(
      { error: "Failed to build comparison" },
      { status: 500 }
    );
  }
}
