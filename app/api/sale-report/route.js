import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);

    const match = {};

    // Date range filter
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from && to) {
      match.date = { $gte: new Date(from), $lte: new Date(to) };
    }

    // Text filters (case-insensitive regex)
    const addRegexFilter = (field, param) => {
      const value = searchParams.get(param);
      if (value) match[field] = { $regex: value, $options: "i" };
    };

    addRegexFilter("runNo", "runNumber");
    addRegexFilter("customer", "customer");
    addRegexFilter("branch", "branch");
    addRegexFilter("origin", "origin");
    addRegexFilter("sector", "sector");
    addRegexFilter("destination", "destination");
    addRegexFilter("network", "network");
    addRegexFilter("counterPart", "counterPart");
    addRegexFilter("receiverState", "state");

    // Exact match filters
    const addExactFilter = (field, param) => {
      const value = searchParams.get(param);
      if (value) match[field] = value;
    };

    addExactFilter("payment", "payment");
    addExactFilter("forwarder", "shipmentForwarder");

    // Filters on joined customer account
    const accountManager = searchParams.get("accountManager");
    const salePerson = searchParams.get("salePerson");
    const saleRefPerson = searchParams.get("saleRefPerson");
    const company = searchParams.get("company");

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "customeraccounts",
          localField: "accountCode",
          foreignField: "accountCode",
          as: "customerDetails",
        },
      },
      {
        $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true },
      },
    ];

    // Add post-lookup filters
    const customerFilters = {};
    if (accountManager)
      customerFilters["customerDetails.accountManager"] = accountManager;
    if (salePerson)
      customerFilters["customerDetails.salesPersonName"] = salePerson;
    if (saleRefPerson)
      customerFilters["customerDetails.reference"] = saleRefPerson;
    if (company) customerFilters["customerDetails.companyName"] = company;

    if (Object.keys(customerFilters).length > 0) {
      pipeline.push({ $match: customerFilters });
    }

    pipeline.push({
      $project: {
        awbNo: 1,
        date: 1,
        runNo: 1,
        clubNo: 1,
        branch: 1,
        reference: 1,
        originName: "$origin",
        saleType: "$payment",
        sector: 1,
        destinationCode: "$destination",
        accountCode: 1,
        customer: 1,
        consigneeName: "$receiverFullName",
        consigneeAddressLine1: "$receiverAddressLine1",
        consigneeCity: "$receiverCity",
        consigneeState: "$receiverState",
        consigneeZipCode: "$receiverPincode",
        consigneePhoneNo: "$receiverPhoneNumber",
        serviceType: "$service",
        pcs: 1,
        actWeight: "$totalActualWt",
        goodsDesc: "$content",
        volWeight: "$totalVolWt",
        volDiscount: "$volDisc",
        chgWeight: {
          $cond: [
            { $gt: ["$totalVolWt", "$totalActualWt"] },
            "$totalVolWt",
            "$totalActualWt",
          ],
        },
        paymentType: "$payment",
        basicAmount: "$basicAmt",
        sgst: 1,
        cgst: 1,
        igst: 1,
        mischg: "$miscChg",
        miscRemark: "$miscChgReason",
        fuel: "$fuelAmt",
        grandTotal: "$totalAmt",
        currency: 1,
        billNo: 1,
        shipmentForwarder: "$forwarder",
        // customer account fields
        customerName: "$customerDetails.name",
        customerBranch: "$customerDetails.branch",
        companyName: "$customerDetails.companyName",
        customerAccountManager: "$customerDetails.accountManager",
        customerSalesPerson: "$customerDetails.salesPersonName",
        managedBy: "$customerDetails.managedBy",
        accountManager: "$customerDetails.accountManager",
        collectionBy: "$customerDetails.collectionBy",
        salePerson: "$customerDetails.salesPersonName",
        rateType: "$customerDetails.rateType",
      },
    });

    const shipments = await Shipment.aggregate(pipeline);

    return NextResponse.json({ success: true, data: shipments });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
