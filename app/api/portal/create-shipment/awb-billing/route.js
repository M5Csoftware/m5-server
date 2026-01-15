import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import AccountLedger from "@/app/model/AccountLedger";
import EventActivity from "@/app/model/EventActivity";

// Ensure DB connection
connectDB();

// BALANCE CALCULATION UTILITY FUNCTION - KEEPING FOR OTHER USES
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

        // 3. Update Customer Balance - NO CREDIT LIMIT CHECKS
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

            // Restore credit if it was used
            if (!shipment.isHold || shipment.holdReason !== "Credit Limit Exceeded") {
                customer.creditLimit += refund;
            }

            await customer.save();
        } else {
            // 🔺 EXTRA CHARGE FLOW (diff > 0) - NO CREDIT LIMIT CHECKS
            const diffAmount = diff;

            console.log(`Processing extra charge: ${diffAmount}`);
            console.log(`Current balance: ${customer.leftOverBalance}, Credit limit: ${customer.creditLimit}`);

            // ALWAYS ADD TO BALANCE - NO CREDIT LIMIT CHECKS
            customer.leftOverBalance += diffAmount;
            await customer.save();

            console.log(`Updated balance: ${customer.leftOverBalance}`);
            
            // If shipment was previously on hold for credit limit, release it
            if (shipment.isHold && shipment.holdReason === "Credit Limit Exceeded") {
                body.isHold = false;
                body.holdReason = "";
                console.log("Released hold for credit limit");
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
                    isHold: body.isHold || false,
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

        // 5. HOLD / UNHOLD EVENT ACTIVITY (only for manual holds, not credit limit)
        const previousHold = shipment.isHold;
        const newHold = body.isHold || false;

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
                    isHold: body.isHold || false,
                    holdReason: body.holdReason || "",
                    otherHoldReason: body.otherHoldReason || "",
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

                    billingLocked: true,
                };

        // 7. Apply update
        const updatedShipment = await Shipment.findOneAndUpdate(
            { awbNo },
            updateData,
            { new: true }
        );

        console.log(`✅ Shipment updated for AWB: ${awbNo}`);
        console.log(`📊 Customer ${customer.accountCode} - New balance: ${customer.leftOverBalance}`);
        console.log(`📦 Shipment hold status: ${updatedShipment.isHold ? 'ON HOLD (manual)' : 'ACTIVE'}`);

        return NextResponse.json(updatedShipment, { status: 200 });
    } catch (error) {
        console.error("PUT Error:", error);
        return NextResponse.json(
            { error: "Failed to update shipment", details: error.message },
            { status: 400 }
        );
    }
}