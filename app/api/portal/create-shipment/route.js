import Shipment from "@/app/model/portal/Shipment";
import User from "@/app/model/portal/User";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import AccountLedger from "@/app/model/AccountLedger";
import EventActivity from "@/app/model/EventActivity";
import { buildShipmentBookedNotification } from "@/app/lib/notificationPayload";
import Notification from "@/app/model/Notification";
import ChildShipment from "@/app/model/portal/ChildShipment";

// Ensure DB connection
connectDB();

// ============ FIXED BALANCE CALCULATION UTILITY FUNCTION ============
function calculateBalanceAndCredit(balance, credit, amount) {
  // If balance is positive (customer has wallet balance)
  if (balance >= 0) {
    if (balance >= amount) {
      // Deduct from wallet balance
      return {
        insufficient: false,
        newBalance: Number((balance - amount).toFixed(2)),
        newCredit: Number(credit.toFixed(2)),
        usedCredit: 0,
        usedBalance: amount,
        message: "Amount deducted from wallet balance",
      };
    } else {
      // Need to use credit for remaining amount
      const remainingAmount = Number((amount - balance).toFixed(2));

      if (credit >= remainingAmount) {
        // Enough credit available
        return {
          insufficient: false,
          newBalance: 0,
          newCredit: Number((credit - remainingAmount).toFixed(2)),
          usedCredit: remainingAmount,
          usedBalance: balance,
          message: `₹${balance} deducted from wallet, ₹${remainingAmount} from credit`,
        };
      } else {
        // Insufficient credit
        return {
          insufficient: true,
          newBalance: balance,
          newCredit: credit,
          deficit: Number((remainingAmount - credit).toFixed(2)),
          requiredAmount: amount,
          availableBalance: balance,
          availableCredit: credit,
          message: "Credit limit exceeded",
        };
      }
    }
  }
  // If balance is negative (customer owes money)
  else {
    const absoluteBalance = Math.abs(balance);

    if (absoluteBalance >= amount) {
      // Reduce the negative balance
      return {
        insufficient: false,
        newBalance: Number((balance + amount).toFixed(2)), // Moving towards zero
        newCredit: Number(credit.toFixed(2)),
        usedCredit: 0,
        usedBalance: amount,
        message: `Outstanding balance reduced by ₹${amount}`,
      };
    } else {
      // Need to use credit for remaining amount after clearing negative balance
      const remainingAfterClearance = Number(
        (amount - absoluteBalance).toFixed(2),
      );

      if (credit >= remainingAfterClearance) {
        return {
          insufficient: false,
          newBalance: 0,
          newCredit: Number((credit - remainingAfterClearance).toFixed(2)),
          usedCredit: remainingAfterClearance,
          usedBalance: absoluteBalance,
          message: `Outstanding balance cleared, ₹${remainingAfterClearance} deducted from credit`,
        };
      } else {
        // Insufficient credit
        return {
          insufficient: true,
          newBalance: balance,
          newCredit: credit,
          deficit: Number((remainingAfterClearance - credit).toFixed(2)),
          requiredAmount: amount,
          availableBalance: balance,
          availableCredit: credit,
          message:
            "Credit limit exceeded even after adjusting outstanding balance",
        };
      }
    }
  }
}

// ============ MAIN POST FUNCTION ============
export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const userId = body.userId;

    console.log("Incoming shipment payload:", {
      accountCode: body.accountCode,
      source: body.source,
      grandTotal: body.grandTotal || body.totalAmt,
      awbNo: body.awbNo,
    });

    // 1. Validate Customer
    const customer = await CustomerAccount.findOne({
      accountCode: body.accountCode.toUpperCase(),
    });

    if (!customer) {
      console.error("Customer not found:", body.accountCode);
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // 2. Calculate and Update Balance & Credit - FIXED
    const grandTotal = Number(body.grandTotal || body.totalAmt || 0);
    const currentBalance = Number(customer.leftOverBalance ?? 0);
    const currentCredit = Number(customer.creditLimit ?? 0);

    console.log("Financial Status:", {
      currentBalance: currentBalance.toFixed(2),
      currentCredit: currentCredit.toFixed(2),
      shipmentAmount: grandTotal.toFixed(2),
    });

    // Use the fixed utility function
    const creditResult = calculateBalanceAndCredit(
      currentBalance,
      currentCredit,
      grandTotal,
    );

    let isHold = false;
    let holdReason = "";
    let holdReasonDetail = "";

    if (creditResult.insufficient) {
      // 🔒 HOLD SHIPMENT - Insufficient credit
      isHold = true;
      holdReason = "Credit Limit Exceeded";
      holdReasonDetail = creditResult.message;

      // DO NOT update balance when putting on hold
      console.log("🚫 SHIPMENT ON HOLD:", {
        reason: holdReason,
        detail: holdReasonDetail,
        deficit: creditResult.deficit,
        requiredAmount: creditResult.requiredAmount,
        availableBalance: creditResult.availableBalance,
        availableCredit: creditResult.availableCredit,
      });
    } else {
      // ✅ NORMAL FLOW - Sufficient balance/credit
      isHold = false;
      holdReason = "";

      // Update customer balance and credit
      customer.leftOverBalance = creditResult.newBalance;
      customer.creditLimit = creditResult.newCredit;
      await customer.save();

      console.log("✅ Balance updated successfully:", {
        previousBalance: currentBalance.toFixed(2),
        previousCredit: currentCredit.toFixed(2),
        newBalance: creditResult.newBalance.toFixed(2),
        newCredit: creditResult.newCredit.toFixed(2),
        usedBalance: creditResult.usedBalance || 0,
        usedCredit: creditResult.usedCredit || 0,
        message: creditResult.message,
      });
    }

    // Set hold status in body
    body.isHold = isHold;
    body.holdReason = holdReason;
    body.holdReasonDetail = holdReasonDetail;
    body.eventCode = isHold ? "HOLD" : "SRD";
    body.status = isHold ? "Shipment put on Hold" : "Shipment Created!";

    // 3. ALWAYS Handle AWB FIRST
    let newAwbNo = (body.awbNo || "").trim();

    if (!newAwbNo) {
      // Auto-generate
      const lastShipment = await Shipment.findOne().sort({ createdAt: -1 });

      if (lastShipment?.awbNo) {
        const prefix = lastShipment.awbNo.match(/^[A-Z]+/)[0] || "MPL";
        let nextNumber =
          parseInt(lastShipment.awbNo.replace(/[^0-9]/g, ""), 10) + 1;

        newAwbNo = `${prefix}${String(nextNumber).padStart(7, "0")}`;

        while (await Shipment.findOne({ awbNo: newAwbNo })) {
          nextNumber++;
          newAwbNo = `${prefix}${String(nextNumber).padStart(7, "0")}`;
        }
      } else {
        newAwbNo = "MPL0000001";
      }
      console.log("Auto-generated AWB:", newAwbNo);
    } else {
      // Manual AWB → check duplicate
      const exists = await Shipment.findOne({ awbNo: newAwbNo });
      if (exists) {
        return NextResponse.json(
          { error: `AWB No ${newAwbNo} already exists` },
          { status: 400 },
        );
      }
      console.log("Manual AWB:", newAwbNo);
    }

    // 4. Prepare Ledger - ONLY for non-hold shipments
    if (!isHold) {
      try {
        const ledgerData =
          body.source === "Portal"
            ? {
                accountCode: body.accountCode,
                customer: customer.name,
                awbNo: newAwbNo,
                payment: "Credit",
                date: body.date ? new Date(body.date) : new Date(),
                isHold: false,
                operationRemark: body.operationRemark || "",
                leftOverBalance: customer.leftOverBalance,

                sector: body.sector,
                runNo: body.runNo || "",
                destination: body.destination,
                forwarder: body.forwarder || "",
                forwardingNo: body.forwardingNo || "",
                receiverCity: body.receiverCity,
                receiverPincode: body.receiverPincode,

                pcs: body.boxes?.length || 0,
                totalActualWt: body.totalActualWt || 0,
                totalVolWt: body.totalVolWt || 0,

                basicAmt: Number(body.totalInvoiceValue || body.basicAmt || 0),
                discount: Number(body.discount || 0),
                discountAmount: Number(body.discountAmt || 0),
                hikeAmt: Number(body.hikeAmt || 0),
                sgst: Number(body.sgst || 0),
                cgst: Number(body.cgst || 0),
                igst: Number(body.igst || 0),
                miscChg: Number(body.miscChg || 0),
                fuelAmt: Number(body.fuelAmt || 0),
                nonTaxable: Number(body.nonTaxable || 0),
                totalAmt: Number(
                  body.baseGrandTotal ||
                    body.grandTotal ||
                    body.totalInvoiceValue ||
                    0,
                ),
                reference: body.reference || body.referenceNo || "NA",
              }
            : {
                accountCode: body.accountCode,
                customer: customer.name,
                awbNo: newAwbNo,
                payment: body.payment || "Credit",
                date: body.date
                  ? new Date(body.date.split("/").reverse().join("-"))
                  : new Date(),
                isHold: false,
                operationRemark: body.operationRemark || "",
                leftOverBalance: customer.leftOverBalance,

                sector: body.sector,
                receiverFullName: body.consignee,
                runNo: body.runNo,
                destination: body.destination,
                forwarder: body.forwarder,
                forwardingNo: body.forwardingNo,
                receiverCity: body["consignee-city"],
                receiverPincode: body["consignee-zipcode"],
                service: body.service,

                pcs: Number(body.pcs || 0),
                totalActualWt: Number(body.actualWt || 0),
                totalVolWt: Number(body.totalVolWt || 0),
                basicAmt: Number(body.basicAmount || 0),
                discount: Number(body.discount || 0),
                discountAmount: Number(body.discountAmt || 0),
                hikeAmt: Number(body.hikeAmt || 0),
                sgst: Number(body.sgst || 0),
                cgst: Number(body.cgst || 0),
                igst: Number(body.igst || 0),
                miscChg: Number(body.miscChg || 0),
                fuelAmt: Number(body.fuelAmt || 0),
                nonTaxable: Number(body.nonTaxable || 0),
                totalAmt: Number(body.grandTotal || 0),
                reference: body.referenceNo || "NA",
              };

        await new AccountLedger(ledgerData).save();
        console.log("✅ Ledger entry created for AWB:", newAwbNo);
      } catch (ledgerError) {
        console.error("❌ Ledger creation error:", ledgerError);
        // Don't fail the shipment creation if ledger fails
      }
    }

    // 5. EVENT ACTIVITY HANDLING
    const eventCode = body.eventCode || (isHold ? "HOLD" : "SRD");
    const status =
      body.status || (isHold ? "Shipment put on Hold" : "Shipment Created!");
    const eventLocation = body.eventLocation || body.origin || "";
    const entryUser = body.entryUser || body.insertUser || "System";
    const eventAwbNo = newAwbNo;

    const currentDate = new Date();
    const formattedTime = currentDate.toTimeString().slice(0, 5);

    try {
      let eventActivity = await EventActivity.findOne({ awbNo: eventAwbNo });

      if (eventActivity) {
        await EventActivity.updateOne(
          { awbNo: eventAwbNo },
          {
            $push: {
              eventCode: eventCode,
              eventDate: currentDate,
              eventTime: formattedTime,
              status: status,
              eventUser: entryUser,
              eventLocation: eventLocation,
              eventLogTime: currentDate,
            },
          },
        );
      } else {
        eventActivity = new EventActivity({
          awbNo: eventAwbNo,
          eventCode: [eventCode],
          eventDate: [currentDate],
          eventTime: [formattedTime],
          status: [status],
          eventUser: [entryUser],
          eventLocation: [eventLocation],
          eventLogTime: [currentDate],
          remark: body.remarks || null,
          receiverName: body.customerName || body.consignee || null,
        });

        await eventActivity.save();
      }
      console.log(
        `✅ EventActivity saved for AWB:`,
        eventAwbNo,
        "Event:",
        eventCode,
      );
    } catch (eventError) {
      console.error("❌ EventActivity error:", eventError);
    }

    // 6. Notification - ONLY for non-hold shipments
    if (!isHold) {
      try {
        const notificationPayload = buildShipmentBookedNotification({
          accountCode: body.accountCode,
          type: "Shipment Booked",
          title: "Shipment Booked",
          awb: newAwbNo,
          address: body.pickupAddress || "",
        });
        await new Notification(notificationPayload).save();
        console.log("✅ Notification sent for AWB:", newAwbNo);
      } catch (notifError) {
        console.error("❌ Notification error:", notifError);
      }
    }

    // 7. Prepare Shipment Data (Unified)
    const shipmentData =
      body.source === "Portal"
        ? {
            ...body,
            awbNo: newAwbNo,
            customer: customer.name,
            isHold: isHold,
            holdReason: holdReason,
            holdReasonDetail: holdReasonDetail,
            status: isHold ? "Shipment put on Hold" : "Shipment Created!",
            eventCode: eventCode,
            chargeableWt: Number(body.chargeableWt || 0),
            totalAmt: Number(body.grandTotal || body.totalAmt || 0),
          }
        : {
            awbNo: newAwbNo,
            accountCode: body.accountCode,
            customer: customer.name,
            date: body.date
              ? new Date(body.date.split("/").reverse().join("-"))
              : new Date(),
            sector: body.sector,
            destination: body.destination || "",
            reference: body.referenceNo || "",
            forwardingNo: body.fwdNumber || "",
            goodstype: body.goodstype || "",
            payment: body.payment || "Credit",
            totalActualWt: Number(body.actualWt || 0),
            chargeableWt: Number(body.chargeableWt || 0),
            totalVolWt: Number(body.volWt || 0),
            totalInvoiceValue: Number(body.invoiceValue || 0),
            content: body.content || "",
            operationRemark: body.operationRemark || "",
            automation: body.automation || false,
            handling: body.handling || false,
            csb: body.csb || false,
            commercialShipment: body.commercialShipment || false,
            isHold: isHold,
            holdReason: holdReason,
            holdReasonDetail: holdReasonDetail,
            otherHoldReason: body.otherHoldReason || "",
            pcs: Number(body.pcs || 0),
            service: body.service || "",
            currency: body.currency || "",
            currencys: body.currencys || "",

            basicAmt: Number(body.basicAmount || 0),
            cgst: Number(body.cgst || 0),
            sgst: Number(body.sgst || 0),
            igst: Number(body.igst || 0),
            totalAmt: Number(body.grandTotal || 0),
            billNo: body.billNo || "",
            manifestNo: body.manifestNo || "",
            runNo: body.runNo || "",
            discount: Number(body.discount || 0),
            discountAmt: Number(body.discountAmt || 0),
            duty: Number(body.duty || 0),
            fuelAmt: Number(body.fuelAmt || 0),
            fuelPercentage: Number(body.fuelPercentage || 0),
            handlingAmount: Number(body.handlingAmount || 0),
            hikeAmt: Number(body.hikeAmt || 0),
            manualAmount: Number(body.manualAmount || 0),
            miscChg: Number(body.miscChg || 0),
            miscChgReason: body.miscChgReason || "",
            overWtHandling: Number(body.overWtHandling || 0),
            volDisc: Number(body.volDisc || 0),
            cashRecvAmount: Number(body.cashRecvAmount || 0),

            receiverFullName: body.consignee,
            receiverPhoneNumber: body["consignee-telephone"],
            receiverEmail: body["consignee-emailID"],
            receiverAddressLine1: body["consignee-addressLine1"],
            receiverAddressLine2: body["consignee-addressLine2"],
            receiverCity: body["consignee-city"],
            receiverState: body["consignee-state"],
            receiverPincode: body["consignee-zipcode"],

            shipperFullName: body.consignor,
            shipperPhoneNumber: body["consignor-telephone"],
            shipperEmail: body["consignor-emailID"],
            shipperAddressLine1: body["consignor-addressLine1"],
            shipperAddressLine2: body["consignor-addressLine2"],
            shipperCity: body["consignor-city"],
            shipperState: body["consignor-state"],
            shipperPincode: body["consignor-pincode"],
            shipperKycType: body["consignor-idType"] || "other",
            shipperKycNumber: body["consignor-idNumber"],

            shipmentAndPackageDetails: body.invoiceContent || {},
            boxes: body.volumeContent || [],
            coLoader: body.coLoader || "",
            coLoaderNumber: Number(body.coLoaderNumber || 0),
            origin: body.origin || "",
            status: isHold ? "Shipment put on Hold" : "Shipment Created!",
            eventCode: eventCode,
            insertUser: body.insertUser || "",
            updateUser: body.updateUser || "",
          };

    // 8. Save Shipment
    const shipment = new Shipment(shipmentData);
    const savedShipment = await shipment.save();
    console.log(
      `✅ Shipment saved:`,
      savedShipment.awbNo,
      "Hold Status:",
      isHold,
    );

    // 9. Update onboarding - ONLY for non-hold portal shipments
    if (body.source === "Portal" && !isHold && userId) {
      try {
        await User.findByIdAndUpdate(userId, {
          $set: { "onboardingProgress.shipmentCreated": true },
        });
        console.log("✅ User onboarding updated for user:", userId);
      } catch (userError) {
        console.error("❌ User onboarding error:", userError);
      }
    }

    // Return response with hold status
    return NextResponse.json(
      {
        ...savedShipment.toObject(),
        isHold,
        holdReason,
        message: isHold
          ? "Shipment created but placed on hold due to insufficient credit. Please recharge your account to release the shipment."
          : "Shipment created successfully",
        financialStatus: creditResult,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("❌ Shipment Creation Error:", err);
    return NextResponse.json(
      { error: "Failed to add shipment", details: err.message },
      { status: 400 },
    );
  }
}

// ============ GET FUNCTION ============
export async function GET(req) {
  try {
    const awbNo = req.nextUrl.searchParams.get("awbNo");
    const runNo = req.nextUrl.searchParams.get("runNo");

    if (!awbNo && !runNo) {
      const shipments = await Shipment.find({}).sort({ createdAt: -1 });
      return NextResponse.json(shipments, { status: 200 });
    }

    if (awbNo) {
      const shipment = await Shipment.findOne({ awbNo });
      if (!shipment) {
        return NextResponse.json(
          { error: "Shipment not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(shipment, { status: 200 });
    }

    if (runNo) {
      const shipments = await Shipment.find({ runNo }).sort({ createdAt: -1 });
      return NextResponse.json(shipments || [], { status: 200 });
    }
  } catch (error) {
    console.error("Error in fetching Shipment:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch Shipment", details: error.message },
      { status: 400 },
    );
  }
}

// ============ PUT FUNCTION ============
export async function PUT(req) {
  try {
    await connectDB();

    const body = await req.json();
    const awbNo = req.nextUrl.searchParams.get("awbNo");

    if (!awbNo) {
      return NextResponse.json({ error: "awbNo is required" }, { status: 400 });
    }

    // 1. Get existing shipment
    const shipment = await Shipment.findOne({ awbNo });

    if (!shipment) {
      return NextResponse.json(
        { error: "Shipment not found" },
        { status: 404 },
      );
    }

    // 2. Verify customer
    const customer = await CustomerAccount.findOne({
      accountCode: body.accountCode?.toUpperCase(),
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // 3. HANDLE HOLD REASON FROM BODY
    // Get hold reason from body, properly handling the dropdown selection
    let isHold = body.isHold !== undefined ? body.isHold : shipment.isHold;
    let holdReason = body.holdReason || shipment.holdReason || "";
    let otherHoldReason =
      body.otherHoldReason || shipment.otherHoldReason || "";

    // If hold is false, clear hold reasons
    if (!isHold) {
      holdReason = "";
      otherHoldReason = "";
    } else {
      // If hold reason is "Other" or empty, use otherHoldReason
      if (holdReason === "Other" || holdReason === " ") {
        holdReason = otherHoldReason || "Other";
      }
    }

    console.log("Hold status update:", {
      isHold,
      holdReason,
      otherHoldReason,
      fromBody: {
        isHold: body.isHold,
        holdReason: body.holdReason,
        otherHoldReason: body.otherHoldReason,
      },
    });

    // 4. Update Customer Balance & Credit using utility function (only if amount changed)
    const oldAmt = Number(shipment.totalAmt || 0);
    const newAmt = Number(body.grandTotal || body.totalAmt || 0);
    const diff = Number((newAmt - oldAmt).toFixed(2));

    if (diff !== 0) {
      if (diff < 0) {
        // 🔻 REFUND FLOW
        const refund = Math.abs(diff);
        customer.leftOverBalance = Number(
          (customer.leftOverBalance + refund).toFixed(2),
        );
        await customer.save();
        console.log(
          `💰 Refund of ₹${refund} applied. New balance: ${customer.leftOverBalance}`,
        );
      } else {
        // 🔺 EXTRA CHARGE FLOW
        const result = calculateBalanceAndCredit(
          customer.leftOverBalance,
          customer.creditLimit,
          diff,
        );

        if (result.insufficient) {
          // Auto-hold if credit insufficient
          isHold = true;
          holdReason = "Credit Limit Exceeded";
          console.log("🚫 Auto-placed on HOLD due to insufficient credit");

          // Add to balance (negative)
          customer.leftOverBalance = Number(
            (customer.leftOverBalance + diff).toFixed(2),
          );
          await customer.save();
        } else {
          // Sufficient credit
          customer.leftOverBalance = result.newBalance;
          customer.creditLimit = result.newCredit;
          await customer.save();
          console.log("✅ Balance updated for extra charge:", result);
        }
      }
    }

    // 5. Prepare ledger update - only for non-hold shipments
    if (!isHold) {
      try {
        const ledgerData =
          body.source === "Portal"
            ? {
                accountCode: body.accountCode,
                customer: body.customerName || customer.name,
                awbNo: awbNo,
                payment: "Credit",
                date: body.date ? new Date(body.date) : new Date(),
                isHold: false,
                operationRemark: body.operationRemark || "",
                leftOverBalance: customer.leftOverBalance,
                sector: body.sector,
                runNo: body.runNo || "",
                destination: body.destination,
                forwarder: body.forwarder || "",
                forwardingNo: body.forwardingNo || "",
                receiverCity: body.receiverCity,
                receiverPincode: body.receiverPincode,
                pcs: body.boxes?.length || 0,
                totalActualWt: body.totalActualWt || 0,
                totalVolWt: body.totalVolWt || 0,
                basicAmt: Number(body.totalInvoiceValue || body.basicAmt || 0),
                discount: Number(body.discount || 0),
                discountAmount: Number(body.discountAmt || 0),
                hikeAmt: Number(body.hikeAmt || 0),
                sgst: Number(body.sgst || 0),
                cgst: Number(body.cgst || 0),
                igst: Number(body.igst || 0),
                miscChg: Number(body.miscChg || 0),
                fuelAmt: Number(body.fuelAmt || 0),
                nonTaxable: Number(body.nonTaxable || 0),
                totalAmt: Number(
                  body.baseGrandTotal ||
                    body.grandTotal ||
                    body.totalInvoiceValue ||
                    0,
                ),
                reference: body.reference || body.referenceNo || "NA",
              }
            : {
                accountCode: body.accountCode,
                customer: body.customer || customer.name,
                awbNo: awbNo,
                payment: body.payment || "Credit",
                date: body.date
                  ? new Date(body.date.split("/").reverse().join("-"))
                  : new Date(),
                isHold: false,
                operationRemark: body.operationRemark || "",
                leftOverBalance: customer.leftOverBalance,
                sector: body.sector,
                runNo: body.runNo,
                destination: body.destination,
                forwarder: body.forwarder,
                forwardingNo: body.forwardingNo,
                receiverFullName: body.consignee,
                receiverCity: body["consignee-city"],
                receiverPincode: body["consignee-zipcode"],
                service: body.service,
                pcs: Number(body.pcs || 0),
                totalActualWt: Number(body.actualWt || 0),
                totalVolWt: Number(body.totalVolWt || 0),
                basicAmt: Number(body.basicAmount || 0),
                discount: Number(body.discount || 0),
                discountAmount: Number(body.discountAmt || 0),
                hikeAmt: Number(body.hikeAmt || 0),
                sgst: Number(body.sgst || 0),
                cgst: Number(body.cgst || 0),
                igst: Number(body.igst || 0),
                miscChg: Number(body.miscChg || 0),
                fuelAmt: Number(body.fuelAmt || 0),
                nonTaxable: Number(body.nonTaxable || 0),
                totalAmt: Number(body.grandTotal || 0),
                reference: body.referenceNo || "NA",
              };

        await AccountLedger.findOneAndUpdate({ awbNo }, ledgerData, {
          new: true,
          upsert: true,
        });
        console.log("✅ Ledger updated for AWB:", awbNo);
      } catch (ledgerError) {
        console.error("❌ Ledger update error:", ledgerError);
      }
    }

    // 6. HOLD/UNHOLD EVENT ACTIVITY - ONLY when hold status changes
    // NO OTHER MODIFICATIONS WILL CREATE EVENT ACTIVITY
    const previousHold = shipment.isHold;

    if (previousHold !== isHold) {
      const eventCode = isHold ? "HOLD" : "RELEASED";
      const status = isHold
        ? "Shipment put on Hold"
        : "Shipment Released from Hold";
      const eventLocation = body.eventLocation || body.origin || "";
      const entryUser = body.updateUser || "System";
      const holdReasonText = isHold ? holdReason : "";

      const now = new Date();
      const formattedTime = now.toTimeString().slice(0, 5);

      try {
        const eventActivity = await EventActivity.findOne({ awbNo });

        if (eventActivity) {
          await EventActivity.updateOne(
            { awbNo },
            {
              $push: {
                eventCode: eventCode,
                eventDate: now,
                eventTime: formattedTime,
                status: status,
                eventUser: entryUser,
                eventLocation: eventLocation,
                eventLogTime: now,
                holdReason: holdReasonText,
              },
            },
          );
        } else {
          const newEvent = new EventActivity({
            awbNo,
            eventCode: [eventCode],
            eventDate: [now],
            eventTime: [formattedTime],
            status: [status],
            eventUser: [entryUser],
            eventLocation: [eventLocation],
            eventLogTime: [now],
            holdReason: [holdReasonText],
            remark: body.remarks || null,
            receiverName: body.consignee || body.customerName || null,
          });

          await newEvent.save();
        }

        console.log(
          `📌 EventActivity added for ${eventCode} on AWB: ${awbNo} with reason: ${holdReasonText}`,
        );
      } catch (eventError) {
        console.error("❌ EventActivity error:", eventError);
      }
    } else {
      console.log("ℹ️ No hold status change - skipping event activity");
    }

    // 7. Map update fields to shipment schema
    const parseDate = (d) => {
      if (!d) return null;
      if (typeof d === "string" && d.includes("/")) {
        const [dd, mm, yyyy] = d.split("/");
        return new Date(`${yyyy}-${mm}-${dd}`);
      }
      return new Date(d);
    };

    // Prepare update data with proper hold fields
    const updateData = {
      ...(body.source === "Portal" ? body : {}),
      // Always include these fields
      isHold: isHold,
      holdReason: holdReason,
      otherHoldReason: otherHoldReason,
      status: isHold
        ? "Shipment put on Hold"
        : body.status || "Shipment Updated",
      // Non-portal fields
      accountCode: body.accountCode,
      date: parseDate(body.date),
      sector: body.sector,
      destination: body.destination || "",
      reference: body.referenceNo || "",
      forwardingNo: body.fwdNumber || "",
      goodstype: body.goodstype || "",
      payment: body.payment || "Credit",
      totalActualWt: Number(body.actualWt || 0),
      chargeableWt: Number(body.chargeableWt || 0),
      totalVolWt: Number(body.volWt || 0),
      totalInvoiceValue: Number(body.invoiceValue || 0),
      content: body.content || "",
      operationRemark: body.operationRemark,
      automation: body.automation || false,
      handling: body.handling || false,
      csb: body.csb || false,
      commercialShipment: body.commercialShipment || false,
      currency: body.currency || "",
      currencys: body.currencys || "",
      pcs: Number(body.pcs || 0),
      service: body.service || "",
      basicAmt: Number(body.basicAmount || 0),
      cgst: Number(body.cgst || 0),
      sgst: Number(body.sgst || 0),
      igst: Number(body.igst || 0),
      totalAmt: Number(body.grandTotal || 0),
      billNo: body.billNo,
      manifestNo: body.manifestNo,
      runNo: body.runNo,
      discount: Number(body.discount || 0),
      discountAmt: Number(body.discountAmt || 0),
      duty: Number(body.duty || 0),
      fuelAmt: Number(body.fuelAmt || 0),
      fuelPercentage: Number(body.fuelPercentage || 0),
      handlingAmount: Number(body.handlingAmount || 0),
      hikeAmt: Number(body.hikeAmt || 0),
      manualAmount: Number(body.manualAmount || 0),
      miscChg: Number(body.miscChg || 0),
      miscChgReason: body.miscChgReason || "",
      overWtHandling: Number(body.overWtHandling || 0),
      volDisc: Number(body.volDisc || 0),
      cashRecvAmount: Number(body.cashRecvAmount || 0),
      receiverFullName: body.consignee,
      receiverPhoneNumber: body["consignee-telephone"],
      receiverEmail: body["consignee-emailID"],
      receiverAddressLine1: body["consignee-addressLine1"],
      receiverAddressLine2: body["consignee-addressLine2"],
      receiverCity: body["consignee-city"],
      receiverState: body["consignee-state"],
      receiverPincode: body["consignee-zipcode"],
      shipperFullName: body.consignor,
      shipperPhoneNumber: body["consignor-telephone"],
      shipperEmail: body["consignor-emailID"],
      shipperAddressLine1: body["consignor-addressLine1"],
      shipperAddressLine2: body["consignor-addressLine2"],
      shipperCity: body["consignor-city"],
      shipperState: body["consignor-state"],
      shipperPincode: body["consignor-pincode"],
      shipperKycType: body["consignor-idType"] || "other",
      shipperKycNumber: body["consignor-idNumber"],
      shipmentAndPackageDetails: body.invoiceContent || {},
      boxes: body.volumeContent || [],
      coLoader: body.coLoader,
      coLoaderNumber: Number(body.coLoaderNumber || 0),
      origin: body.origin || "",
      forwarder: body.forwarder,
      // Don't update eventCode for non-hold changes
      eventCode: isHold
        ? "HOLD"
        : previousHold !== isHold
          ? isHold
            ? "HOLD"
            : "RELEASED"
          : shipment.eventCode,
      insertUser: shipment.insertUser,
      updateUser: body.updateUser || "",
    };

    // 8. Apply update
    const updatedShipment = await Shipment.findOneAndUpdate(
      { awbNo },
      updateData,
      { new: true },
    );

    console.log(
      `✅ Shipment updated:`,
      awbNo,
      "Hold Status:",
      isHold,
      "Hold Reason:",
      holdReason,
    );

    return NextResponse.json(
      {
        ...updatedShipment.toObject(),
        message: isHold
          ? "Shipment updated but is on hold"
          : "Shipment updated successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("❌ PUT Error:", error);
    return NextResponse.json(
      { error: "Failed to update shipment", details: error.message },
      { status: 400 },
    );
  }
}

// ============ DELETE FUNCTION ============
export async function DELETE(req) {
  try {
    await connectDB();

    const awbNo = req.nextUrl.searchParams.get("awbNo");

    if (!awbNo) {
      return NextResponse.json({ error: "awbNo is required" }, { status: 400 });
    }

    // 1. Get shipment
    const shipment = await Shipment.findOne({ awbNo });

    if (!shipment) {
      return NextResponse.json(
        { error: "Shipment not found" },
        { status: 404 },
      );
    }

    // 2. Get customer
    const customer = await CustomerAccount.findOne({
      accountCode: shipment.accountCode,
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    const refundAmount = Number(shipment.totalAmt || 0);

    // 3. REFUND LOGIC - FIXED
    if (!shipment.isHold) {
      // Only refund if shipment was NOT on hold

      if (customer.leftOverBalance < 0) {
        // Customer has outstanding balance
        customer.leftOverBalance = Number(
          (customer.leftOverBalance + refundAmount).toFixed(2),
        );

        // If balance becomes positive, restore credit
        if (customer.leftOverBalance > 0) {
          const excessAmount = customer.leftOverBalance;
          customer.leftOverBalance = 0;
          customer.creditLimit = Number(
            (customer.creditLimit + excessAmount).toFixed(2),
          );
        }
      } else {
        // Customer has positive balance
        customer.leftOverBalance = Number(
          (customer.leftOverBalance + refundAmount).toFixed(2),
        );
      }

      await customer.save();
      console.log(
        `💰 Refund of ₹${refundAmount} applied. New balance: ${customer.leftOverBalance}`,
      );
    } else {
      console.log(`🚫 Shipment was on hold, no refund applied`);
    }

    // 4. Delete ledger entries
    await AccountLedger.deleteMany({ awbNo });

    // 5. Delete childShipment entries
    await ChildShipment.deleteMany({ masterAwbNo: awbNo });

    // 6. Delete shipment
    await Shipment.deleteOne({ awbNo });

    console.log("🗑 Shipment deleted successfully:", awbNo);

    return NextResponse.json(
      {
        message: shipment.isHold
          ? "Shipment deleted successfully (no refund applied as shipment was on hold)"
          : "Shipment deleted and refund applied successfully",
        refundApplied: !shipment.isHold ? refundAmount : 0,
        newBalance: !shipment.isHold ? customer.leftOverBalance : null,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("❌ DELETE Error:", error);
    return NextResponse.json(
      { error: "Failed to delete shipment", details: error.message },
      { status: 400 },
    );
  }
}
