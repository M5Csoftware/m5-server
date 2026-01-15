import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import RunEntry from "@/app/model/RunEntry";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const runNo = searchParams.get("runNo");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const awbNo = searchParams.get("awbNo");

    let query = {};

    // Build query based on filters
    if (runNo) {
      query.runNo = runNo;
    }
    if (awbNo) {
      query.awbNo = awbNo;
    }
    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        query.date.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        query.date.$lte = to;
      }
    }

    console.log("Query:", JSON.stringify(query, null, 2));

    // Fetch shipments with pagination/limit for large date ranges
    const shipments = await Shipment.find(query)
      .select(
        "awbNo date runNo bag manifestNo branch origin sector destination accountCode customerName salesPersonName receiverFullName receiverAddressLine1 receiverCity receiverState receiverPincode receiverPhoneNumber service shipmentType forwarder forwardingNo payment pcs goodstype totalActualWt totalVolWt volDisc content totalInvoiceValue currency clubNo holdReason otherHoldReason csb insertUser alMawb basicAmt discount discountAmt hikeAmt sgst cgst igst handlingAmount overWtHandling miscChg miscChgReason fuelAmt duty totalAmt billNo"
      )
      .lean()
      .limit(5000)
      .exec();

    if (!shipments || shipments.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "No shipments found",
          data: [],
        },
        { status: 200 }
      );
    }

    console.log(`Found ${shipments.length} shipments`);

    // Fetch flight date from RunEntry and customer details from CustomerAccount
    const shipmentsWithDetails = await Promise.all(
      shipments.map(async (shipment) => {
        let flightDate = "";
        let customerName = "";
        let branch = "";
        let salesPersonName = "";

        try {
          // Get flight date from RunEntry using runNo
          if (shipment.runNo) {
            try {
              const runEntry = await RunEntry.findOne({ runNo: shipment.runNo })
                .select("date")
                .lean()
                .exec();
              if (runEntry && runEntry.date) {
                flightDate = runEntry.date instanceof Date 
                  ? runEntry.date.toISOString().split('T')[0]
                  : runEntry.date;
              }
            } catch (error) {
              console.warn(
                `Could not fetch flight date for runNo ${shipment.runNo}:`,
                error.message
              );
            }
          }

          // Get customer details (name, branch, salesPersonName) from CustomerAccount using accountCode
          if (shipment.accountCode) {
            try {
              const customerAccount = await CustomerAccount.findOne({
                accountCode: shipment.accountCode,
              })
                .select("name branch salesPersonName")
                .lean()
                .exec();

              if (customerAccount) {
                customerName = customerAccount.name || "";
                branch = customerAccount.branch || "";
                salesPersonName = customerAccount.salesPersonName || "";
              }
            } catch (error) {
              console.warn(
                `Could not fetch customer details for accountCode ${shipment.accountCode}:`,
                error.message
              );
            }
          }

          // Fallback to shipment.customerName if not found
          if (!customerName && shipment.customerName) {
            customerName = shipment.customerName;
          }
        } catch (error) {
          console.error(
            `Error fetching details for shipment ${shipment.awbNo}:`,
            error
          );
        }

        // Format date if it's a Date object
        const formattedDate = shipment.date instanceof Date 
          ? shipment.date.toISOString().split('T')[0]
          : shipment.date;

        return {
          ...shipment,
          date: formattedDate,
          flightDate,
          customerName,
          branch,
          salesPersonName,
        };
      })
    );

    return NextResponse.json(
      {
        success: true,
        message: "Shipments fetched successfully",
        data: shipmentsWithDetails,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in GET /booking-with-sale:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error fetching shipments",
        error: error.message,
      },
      { status: 500 }
    );
  }
}