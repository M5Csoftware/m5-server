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

// BALANCE CALCULATION UTILITY FUNCTION
function calculateBalanceAndCredit(balance, credit, amount) {
  let newBalance = balance;
  let newCredit = credit;

  if (balance < 0) {
    const wallet = Math.abs(balance);

    if (wallet >= amount) {
      newBalance = balance + amount;
    } else {
      const creditNeeded = amount - wallet;
      if (credit < creditNeeded) {
        return { insufficient: true };
      }
      newBalance = 0;
      newCredit = credit - creditNeeded;
    }
  } else {
    if (credit < amount) {
      return { insufficient: true };
    }
    newBalance = balance + amount;
    newCredit = credit - amount;
  }

  return { insufficient: false, newBalance, newCredit };
}

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const userId = body.userId;

    console.log("Incoming shipment payload:", body);

    // 1. Validate Customer
    const customer = await CustomerAccount.findOne({
      accountCode: body.accountCode.toUpperCase(),
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // 2. Calculate and Update Balance & Credit
    const grandTotal = Number(body.grandTotal || body.totalAmt || 0);
    const currentBalance = Number(customer.leftOverBalance ?? 0);
    const currentCredit = Number(customer.creditLimit ?? 0);

    console.log(
      "Current - Balance:",
      currentBalance,
      "Credit:",
      currentCredit,
      "Amount:",
      grandTotal
    );

    // Use the utility function
    const creditResult = calculateBalanceAndCredit(
      currentBalance,
      currentCredit,
      grandTotal
    );

    if (creditResult.insufficient) {
      // 🔒 HOLD SHIPMENT
      body.isHold = true;
      body.holdReason = "Credit Limit Exceeded";
      body.eventCode = "HOLD";
      body.status = "Shipment put on Hold";

      // ✅ FIXED: Only increment by grandTotal (MongoDB $inc does the addition)
      await CustomerAccount.updateOne(
        { _id: customer._id },
        { $inc: { leftOverBalance: grandTotal } }
      );

      // Update local reference for ledger
      customer.leftOverBalance = currentBalance + grandTotal;

    } else {
      // ✅ NORMAL FLOW
      customer.leftOverBalance = creditResult.newBalance;
      customer.creditLimit = creditResult.newCredit;
      await customer.save();
    }

    // 3. Prepare Ledger
    let ledgerData =
      body.source === "Portal"
        ? {
          accountCode: body.accountCode,
          customer: customer.name,
          awbNo: body.awbNo,
          payment: "Credit",
          date: new Date(body.date),
          isHold: body.isHold || false,
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
          totalActualWt: body.totalActualWt,
          totalVolWt: body.totalVolWt,

          basicAmt: body.totalInvoiceValue || 0,
          discount: body.discount || 0,
          discountAmount: body.discountAmt || 0,
          hikeAmt: body.hikeAmt || 0,
          sgst: body.sgst || 0,
          cgst: body.cgst || 0,
          igst: body.igst || 0,
          miscChg: body.miscChg || 0,
          fuelAmt: body.fuelAmt || 0,
          nonTaxable: body.nonTaxable || 0,
          totalAmt: body.baseGrandTotal || body.grandTotal || body.totalInvoiceValue,
          reference: body.reference || body.referenceNo || "NA",
        }
        : {
          accountCode: body.accountCode,
          customer: customer.name,
          awbNo: body.awbNo,
          payment: body.payment,
          date: new Date(body.date.split("/").reverse().join("-")),
          isHold: body.isHold,
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

          pcs: body.pcs,
          totalActualWt: body.actualWt,
          totalVolWt: body.totalVolWt,
          basicAmt: body.basicAmount,
          discount: body.discount,
          discountAmount: body.discountAmt,
          hikeAmt: body.hikeAmt,
          sgst: body.sgst,
          cgst: body.cgst,
          igst: body.igst,
          miscChg: body.miscChg,
          fuelAmt: body.fuelAmt,
          nonTaxable: body.nonTaxable,
          totalAmt: body.grandTotal,
          reference: body.referenceNo,
        };

    await new AccountLedger(ledgerData).save();

    // 4. ALWAYS Handle AWB FIRST
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
    } else {
      // Manual AWB → check duplicate
      const exists = await Shipment.findOne({ awbNo: newAwbNo });
      if (exists) {
        return NextResponse.json(
          { error: `AWB No ${newAwbNo} already exists` },
          { status: 400 }
        );
      }
    }

    // 5. EVENT ACTIVITY HANDLING
    const eventCode = body.eventCode || "SRD";
    const status = body.status || "Shipment Created!";
    const eventLocation = body.eventLocation || body.origin || "";
    const entryUser = body.entryUser || body.insertUser || "System";
    const eventAwbNo = newAwbNo;

    const currentDate = new Date();
    const formattedTime = currentDate.toTimeString().slice(0, 5);

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
        }
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

    console.log("✅ EventActivity saved/updated for AWB:", eventAwbNo);

    const notificationPayload = buildShipmentBookedNotification({
      accountCode: body.accountCode,
      type: "Shipment Booked",
      title: "Shipment Booked",
      awb: newAwbNo,
      address: body.pickupAddress || "",
    });

    await new Notification(notificationPayload).save();

    // 6. Prepare Shipment Data (Unified)
    const shipmentData =
      body.source === "Portal"
        ? {
          ...body,
          awbNo: newAwbNo,
          customer: customer.name,
        }
        : {
          awbNo: newAwbNo,
          accountCode: body.accountCode,
          customer: customer.name,
          date: new Date(body.date.split("/").reverse().join("-")),
          sector: body.sector,
          destination: body.destination || "",
          reference: body.referenceNo || "",
          forwardingNo: body.fwdNumber || "",
          goodstype: body.goodstype || "",
          payment: body.payment || "",
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
          isHold: body.isHold || false,
          holdReason: body.holdReason || "",
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
          status: body.status || "Shipment Created!",
          insertUser: body.insertUser || "",
          updateUser: body.updateUser || "",
        };

    // 7. Save Shipment Once
    const shipment = new Shipment(shipmentData);
    const savedShipment = await shipment.save();

    // 8. Only update onboarding if source === "Portal"
    if (body.source === "Portal") {
      await User.findByIdAndUpdate(userId, {
        $set: { "onboardingProgress.shipmentCreated": true },
      });
    }

    console.log("Shipment saved:", savedShipment);
    return NextResponse.json(savedShipment, { status: 201 });
  } catch (err) {
    console.error("Shipment Error:", err);
    return NextResponse.json(
      { error: "Failed to add shipment", details: err.message },
      { status: 400 }
    );
  }
}

export async function GET(req) {
  try {
    const awbNo = req.nextUrl.searchParams.get("awbNo");
    const runNo = req.nextUrl.searchParams.get("runNo");

    if (!awbNo && !runNo) {
      const shipments = await Shipment.find({});
      return NextResponse.json(shipments, { status: 200 });
    }

    if (awbNo) {
      const shipment = await Shipment.findOne({ awbNo });
      if (!shipment) {
        return NextResponse.json(
          { error: "Shipment not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(shipment, { status: 200 });
    }

    if (runNo) {
      const shipments = await Shipment.find({ runNo });
      return NextResponse.json(shipments || [], { status: 200 });
    }
  } catch (error) {
    console.error("Error in fetching Shipment:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch Shipment", details: error.message },
      { status: 400 }
    );
  }
}

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
        { status: 404 }
      );
    }

    // 2. Verify customer
    const customer = await CustomerAccount.findOne({
      accountCode: body.accountCode?.toUpperCase(),
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // 3. Update Customer Balance & Credit using utility function
    const oldAmt = Number(shipment.totalAmt || 0);
    const newAmt = Number(body.grandTotal || 0);
    const diff = newAmt - oldAmt;

    // ✅ FIXED: Return proper response when no amount change
    if (diff === 0) {
      console.log("No amount change detected, skipping financial updates");
      // Continue to update other fields below
    } else if (diff < 0) {
      // 🔻 REFUND FLOW
      const refund = Math.abs(diff);

      // Always reduce outstanding
      customer.leftOverBalance -= refund;

      // Restore credit ONLY if credit was actually consumed
      if (
        !shipment.isHold ||
        shipment.holdReason !== "Credit Limit Exceeded"
      ) {
        customer.creditLimit += refund;
      }

      await customer.save();
    } else {
      // 🔺 EXTRA CHARGE FLOW (diff > 0)

      // Case 1️⃣ Shipment is HOLD due to credit
      if (
        shipment.isHold &&
        shipment.holdReason === "Credit Limit Exceeded"
      ) {
        customer.leftOverBalance += diff;
        await customer.save();
      } else {
        // Case 2️⃣ Normal shipment → apply credit rules
        const result = calculateBalanceAndCredit(
          customer.leftOverBalance,
          customer.creditLimit,
          diff
        );

        if (result.insufficient) {
          body.isHold = true;
          body.holdReason = "Credit Limit Exceeded";
          body.eventCode = "HOLD";
          body.status = "Shipment put on Hold";

          customer.leftOverBalance += diff;
          await customer.save();
        } else {
          customer.leftOverBalance = result.newBalance;
          customer.creditLimit = result.newCredit;
          await customer.save();
        }
      }
    }

    // 4. Prepare ledger update
    const ledgerData =
      body.source === "Portal"
        ? {
          accountCode: body.accountCode,
          customer: body.customerName,
          awbNo: awbNo,
          payment: "Credit",
          date: new Date(body.date),
          isHold: body.isHold || false,
          operationRemark: body.operationRemark || "",
          leftOverBalance: customer.leftOverBalance,

          sector: body.sector,
          runNo: body.runNo,
          destination: body.destination,
          forwarder: body.forwarder,
          forwardingNo: body.forwardingNo,

          receiverCity: body.receiverCity,
          receiverPincode: body.receiverPincode,

          pcs: body.boxes?.length || 0,
          totalActualWt: body.totalActualWt,
          totalVolWt: body.totalVolWt,

          basicAmt: body.totalInvoiceValue || 0,
          discount: body.discount,
          discountAmount: body.discountAmt,
          sgst: body.sgst,
          cgst: body.cgst,
          igst: body.igst,
          fuelAmt: body.fuelAmt,
          miscChg: body.miscChg,
          nonTaxable: body.nonTaxable,
          hikeAmt: body.hikeAmt,
          totalAmt: body.baseGrandTotal || body.grandTotal || body.totalInvoiceValue,
          reference: body.reference || body.referenceNo || "NA",
        }
        : {
          accountCode: body.accountCode,
          customer: body.customer,
          awbNo: awbNo,
          payment: body.payment || "Credit",
          date: new Date(body.date.split("/").reverse().join("-")),
          isHold: body.isHold,
          operationRemark: body.operationRemark,
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

          pcs: body.pcs,
          totalActualWt: body.actualWt,
          totalVolWt: body.totalVolWt,

          basicAmt: body.basicAmount,
          discount: body.discount,
          discountAmount: body.discountAmt,
          sgst: body.sgst,
          cgst: body.cgst,
          igst: body.igst,
          miscChg: body.miscChg,
          fuelAmt: body.fuelAmt,
          nonTaxable: body.nonTaxable,
          hikeAmt: body.hikeAmt,
          totalAmt: body.grandTotal,
          reference: body.referenceNo,
        };

    // ✅ FIXED: Use upsert to create if doesn't exist
    await AccountLedger.findOneAndUpdate(
      { awbNo },
      ledgerData,
      { new: true, upsert: true }
    );

    // 5. HOLD / UNHOLD EVENT ACTIVITY
    const previousHold = shipment.isHold;
    const newHold = body.isHold;

    if (previousHold !== newHold) {
      const eventCode = newHold ? "HOLD" : "UNHOLD";
      const status = newHold
        ? "Shipment put on Hold"
        : "Shipment Released from Hold";
      const eventLocation = body.eventLocation || body.origin || "";
      const entryUser = body.updateUser || "System";

      const now = new Date();
      const formattedTime = now.toTimeString().slice(0, 5);

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
            },
          }
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
          remark: body.remarks || null,
          receiverName: body.consignee || body.customerName || null,
        });

        await newEvent.save();
      }

      console.log(`📌 EventActivity added for ${eventCode} on AWB: ${awbNo}`);
    }

    // 6. Map update fields to shipment schema
    const parseDate = (d) => {
      if (!d) return null;
      if (typeof d === "string" && d.includes("/")) {
        const [dd, mm, yyyy] = d.split("/");
        return new Date(`${yyyy}-${mm}-${dd}`);
      }
      return new Date(d);
    };

    const updateData =
      body.source === "Portal"
        ? { ...body }
        : {
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
          isHold: body.isHold,
          holdReason: body.holdReason,
          otherHoldReason: body.otherHoldReason,
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
          status: body.status || shipment.status,

          insertUser: shipment.insertUser,
          updateUser: body.updateUser || "",
        };

    // 7. Apply update
    const updatedShipment = await Shipment.findOneAndUpdate(
      { awbNo },
      updateData,
      { new: true }
    );

    return NextResponse.json(updatedShipment, { status: 200 });
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json(
      { error: "Failed to update shipment", details: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(req) {
  try {
    await connectDB();

    const awbNo = req.nextUrl.searchParams.get("awbNo");

    if (!awbNo) {
      return NextResponse.json(
        { error: "awbNo is required" },
        { status: 400 }
      );
    }

    // 1️ Get shipment
    const shipment = await Shipment.findOne({ awbNo });

    if (!shipment) {
      return NextResponse.json(
        { error: "Shipment not found" },
        { status: 404 }
      );
    }

    // 2️ Get customer
    const customer = await CustomerAccount.findOne({
      accountCode: shipment.accountCode,
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const refundAmount = Number(shipment.totalAmt || 0);

    /**
     * ===============================
     * 3️ REFUND LOGIC (FIXED)
     * ===============================
     */

    // Step 1: Always rollback wallet
    customer.leftOverBalance -= refundAmount;

    /**
     * Step 2: Restore credit ONLY if it was consumed
     * Credit was used only when balance went above zero
     */
    if (
      customer.leftOverBalance > 0   // indicates credit usage
    ) {
      const creditRestore = Math.min(
        refundAmount,
        customer.leftOverBalance
      );

      customer.creditLimit += creditRestore;
      customer.leftOverBalance -= creditRestore;
    }

    await customer.save();

    // 4️ Delete ledger entries
    await AccountLedger.deleteMany({ awbNo });

    // 5 Delete childShipment entries
    await ChildShipment.deleteMany({ masterAwbNo: awbNo });

    // 6 Delete shipment
    await Shipment.deleteOne({ awbNo });

    console.log("🗑 Shipment deleted & amount refunded correctly:", awbNo);

    return NextResponse.json(
      { message: "Shipment deleted and refund applied correctly" },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE Error:", error);
    return NextResponse.json(
      { error: "Failed to delete shipment", details: error.message },
      { status: 400 }
    );
  }
}

