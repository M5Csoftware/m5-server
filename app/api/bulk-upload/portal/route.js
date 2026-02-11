import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import AccountLedger from "@/app/model/AccountLedger";
import CustomerAccount from "@/app/model/CustomerAccount";
import Zone from "@/app/model/Zone";

/**
 * Helper function to clean field values
 */
const cleanFieldValue = (value, fieldName) => {
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  if (/_\d+$/.test(str) || str === fieldName) {
    return undefined;
  }
  return str || undefined;
};

/**
 * POST /api/portal/bulk-upload
 * Upload shipments from portal bulk upload WITH RATE CALCULATION
 */
export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { shipments, accountCode } = body;

    console.log("Portal Bulk Upload request received:", {
      totalShipments: shipments?.length,
      accountCode,
    });

    // Validate input
    if (!shipments || !Array.isArray(shipments) || shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments data provided" },
        { status: 400 },
      );
    }

    if (!accountCode || accountCode.trim() === "") {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 },
      );
    }

    // Get customer for balance update
    const customer = await CustomerAccount.findOne({
      accountCode: accountCode.toUpperCase(),
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer account not found" },
        { status: 400 },
      );
    }

    // Check for existing shipments by AWB numbers (since references might be empty)
    const awbNumbers = shipments
      .map((s) => s.awbNo?.toString().trim())
      .filter((awb) => awb && awb !== "");

    let existingShipments = [];
    if (awbNumbers.length > 0) {
      existingShipments = await Shipment.find({
        awbNo: { $in: awbNumbers },
        accountCode: accountCode.toUpperCase(),
      }).select("awbNo reference");
    }

    const existingAwbSet = new Set(
      existingShipments.map((shipment) => shipment.awbNo),
    );

    // Filter out shipments with existing AWB numbers
    const newShipments = shipments.filter(
      (shipment) => !existingAwbSet.has(shipment.awbNo?.toString().trim()),
    );

    let newRecordsCount = 0;
    let duplicatesCount = shipments.length - newShipments.length;
    let errors = [];
    let oldBalance = customer.leftOverBalance || 0;
    let totalAmountAdded = 0;

    console.log("New shipments to insert:", newShipments.length);
    console.log("Duplicates to skip:", duplicatesCount);
    console.log("Old customer balance:", oldBalance);

    // Validate zone combinations for all new shipments
    const zoneValidationErrors = [];
    for (const [index, shipment] of newShipments.entries()) {
      const sector = cleanFieldValue(shipment.sector, "sector") || "DEFAULT";
      const destination =
        cleanFieldValue(shipment.destination, "destination") || "";
      const service = cleanFieldValue(shipment.service, "service") || "";

      if (sector && destination && service) {
        const zoneExists = await Zone.findOne({
          sector: sector,
          destination: destination,
          service: service,
        });

        if (!zoneExists) {
          zoneValidationErrors.push({
            index: index,
            awbNo: shipment.awbNo?.toString().trim() || "Unknown",
            sector: sector,
            destination: destination,
            service: service,
            error: "Zone combination not found",
          });
        }
      }
    }

    if (zoneValidationErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Zone validation failed",
          errors: zoneValidationErrors,
          totalErrors: zoneValidationErrors.length,
        },
        { status: 400 },
      );
    }

    // Insert only new shipments if there are any
    if (newShipments.length > 0) {
      // Prepare shipments data for insertion
      const shipmentsToInsert = newShipments
        .map((shipment, index) => {
          try {
            // Use provided AWB or generate temporary one
            const awbNo =
              shipment.awbNo?.toString().trim() ||
              `PORTAL-${Date.now()}-${index}`;

            // Ensure weights are numbers
            const totalActualWt = Number(shipment.totalActualWt) || 0;
            const totalVolWt = Number(shipment.totalVolWt) || 0;
            const chargeableWt = Number(shipment.chargeableWt) || 0;

            // Use calculated financial amounts if provided, otherwise 0
            const basicAmt = Number(shipment.basicAmt) || 0;
            const sgst = Number(shipment.sgst) || 0;
            const cgst = Number(shipment.cgst) || 0;
            const igst = Number(shipment.igst) || 0;
            const totalAmt = Number(shipment.totalAmt) || 0;

            // Update total amount for balance calculation
            totalAmountAdded += totalAmt;

            // Parse date correctly
            let shipmentDate;
            if (shipment.date) {
              if (shipment.date instanceof Date) {
                shipmentDate = shipment.date;
              } else if (typeof shipment.date === "string") {
                shipmentDate = new Date(shipment.date);
              } else {
                shipmentDate = new Date();
              }
            } else {
              shipmentDate = new Date();
            }

            const cleanShipment = {
              // AWB number
              awbNo: awbNo,

              // Account code
              accountCode: accountCode.toUpperCase(),

              // Basic shipment info
              sector: cleanFieldValue(shipment.sector, "sector") || "DEFAULT",
              origin: cleanFieldValue(shipment.origin, "origin") || "DEFAULT",
              destination:
                cleanFieldValue(shipment.destination, "destination") || "",
              reference: cleanFieldValue(shipment.reference, "reference") || "",
              service: cleanFieldValue(shipment.service, "service") || "",

              // Weights
              boxes:
                Array.isArray(shipment.boxes) && shipment.boxes.length > 0
                  ? shipment.boxes.map((box) => ({
                      ...box,
                      actualWt: Number(box.actualWt) || 0,
                      volumeWeight: Number(box.volumeWeight) || 0,
                    }))
                  : [],
              totalActualWt: totalActualWt,
              totalVolWt: totalVolWt,
              chargeableWt: chargeableWt,
              pcs: Number(shipment.pcs) || 0,

              // FINANCIAL AMOUNTS - CALCULATED
              basicAmt: basicAmt,
              sgst: sgst,
              cgst: cgst,
              igst: igst,
              totalAmt: totalAmt,

              // Other financial fields
              totalInvoiceValue: Number(shipment.totalInvoiceValue) || 0,
              currency: cleanFieldValue(shipment.currency, "currency") || "INR",
              currencys:
                cleanFieldValue(shipment.currencys, "currencys") || "INR",
              discount: Number(shipment.discount) || 0,
              discountAmt: Number(shipment.discountAmt) || 0,
              duty: Number(shipment.duty) || 0,
              fuelAmt: Number(shipment.fuelAmt) || 0,
              fuelPercentage: Number(shipment.fuelPercentage) || 0,
              handlingAmount: Number(shipment.handlingAmount) || 0,
              hikeAmt: Number(shipment.hikeAmt) || 0,
              manualAmount: Number(shipment.manualAmount) || 0,
              miscChg: Number(shipment.miscChg) || 0,
              overWtHandling: Number(shipment.overWtHandling) || 0,
              volDisc: Number(shipment.volDisc) || 0,
              cashRecvAmount: Number(shipment.cashRecvAmount) || 0,

              // Content
              content: Array.isArray(shipment.content)
                ? shipment.content
                : shipment.content
                  ? [shipment.content]
                  : [],
              shipmentAndPackageDetails:
                shipment.shipmentAndPackageDetails || {},

              // Portal specific settings
              csb: shipment.csb === true || shipment.csb === "Yes",
              isHold: false, // Portal shipments don't go on hold
              payment: cleanFieldValue(shipment.payment, "payment") || "Credit",

              // Dates
              date: shipmentDate,

              // Status
              status: "Shipment Created!",

              // Other fields
              operationRemark:
                cleanFieldValue(shipment.operationRemark, "operationRemark") ||
                "",
              automation: Boolean(shipment.automation),
              handling: Boolean(shipment.handling),
              commercialShipment: Boolean(shipment.commercialShipment),
              holdReason: "",
              otherHoldReason: "",
              billNo: cleanFieldValue(shipment.billNo, "billNo") || "",
              manifestNo:
                cleanFieldValue(shipment.manifestNo, "manifestNo") || "",
              runNo: cleanFieldValue(shipment.runNo, "runNo") || "",
              alMawb: cleanFieldValue(shipment.alMawb, "alMawb") || "",
              bag: cleanFieldValue(shipment.bag, "bag") || "",
              clubNo: cleanFieldValue(shipment.clubNo, "clubNo") || "",
              company: cleanFieldValue(shipment.company, "company") || "",
              customer:
                cleanFieldValue(shipment.customer, "customer") ||
                customer.name ||
                "",
              flight: cleanFieldValue(shipment.flight, "flight") || "",
              network: cleanFieldValue(shipment.network, "network") || "",
              networkName:
                cleanFieldValue(shipment.networkName, "networkName") || "",
              obc: cleanFieldValue(shipment.obc, "obc") || "",
              localMF: cleanFieldValue(shipment.localMF, "localMF") || "",
              coLoader: cleanFieldValue(shipment.coLoader, "coLoader") || "",
              coLoaderNumber: Number(shipment.coLoaderNumber) || 0,
              insertUser:
                cleanFieldValue(shipment.insertUser, "insertUser") ||
                "11111111",
              updateUser:
                cleanFieldValue(shipment.updateUser, "updateUser") ||
                "11111111",
              billingLocked: Boolean(shipment.billingLocked),
              awbStatus: cleanFieldValue(shipment.awbStatus, "awbStatus") || "",
              isBilled: Boolean(shipment.isBilled),
              notifType: cleanFieldValue(shipment.notifType, "notifType") || "",
              notifMsg: cleanFieldValue(shipment.notifMsg, "notifMsg") || "",
              runDate: shipment.runDate || null,
              completeDataLock: Boolean(shipment.completeDataLock),
              gstNumber: cleanFieldValue(shipment.gstNumber, "gstNumber") || "",
              adCode: cleanFieldValue(shipment.adCode, "adCode") || "",
              termsOfInvoice:
                cleanFieldValue(shipment.termsOfInvoice, "termsOfInvoice") ||
                "",
              crnNumber: cleanFieldValue(shipment.crnNumber, "crnNumber") || "",
              mhbsNumber:
                cleanFieldValue(shipment.mhbsNumber, "mhbsNumber") || "",
              exportThroughEcommerce: Boolean(shipment.exportThroughEcommerce),
              meisScheme: Boolean(shipment.meisScheme),
              shipmentType: "Non-Document",

              // Receiver details
              receiverFullName:
                cleanFieldValue(
                  shipment.receiverFullName,
                  "receiverFullName",
                ) || "",
              receiverPhoneNumber:
                cleanFieldValue(
                  shipment.receiverPhoneNumber,
                  "receiverPhoneNumber",
                ) || "",
              receiverEmail:
                cleanFieldValue(shipment.receiverEmail, "receiverEmail") || "",
              receiverAddressLine1:
                cleanFieldValue(
                  shipment.receiverAddressLine1,
                  "receiverAddressLine1",
                ) || "",
              receiverAddressLine2:
                cleanFieldValue(
                  shipment.receiverAddressLine2,
                  "receiverAddressLine2",
                ) || "",
              receiverCity:
                cleanFieldValue(shipment.receiverCity, "receiverCity") || "",
              receiverState:
                cleanFieldValue(shipment.receiverState, "receiverState") || "",
              receiverCountry:
                cleanFieldValue(shipment.receiverCountry, "receiverCountry") ||
                "",
              receiverPincode:
                cleanFieldValue(shipment.receiverPincode, "receiverPincode") ||
                "",

              // Shipper details
              shipperFullName:
                cleanFieldValue(shipment.shipperFullName, "shipperFullName") ||
                "",
              shipperPhoneNumber:
                cleanFieldValue(
                  shipment.shipperPhoneNumber,
                  "shipperPhoneNumber",
                ) || "",
              shipperEmail:
                cleanFieldValue(shipment.shipperEmail, "shipperEmail") || "",
              shipperAddressLine1:
                cleanFieldValue(
                  shipment.shipperAddressLine1,
                  "shipperAddressLine1",
                ) || "",
              shipperAddressLine2:
                cleanFieldValue(
                  shipment.shipperAddressLine2,
                  "shipperAddressLine2",
                ) || "",
              shipperCity:
                cleanFieldValue(shipment.shipperCity, "shipperCity") || "",
              shipperState:
                cleanFieldValue(shipment.shipperState, "shipperState") || "",
              shipperCountry:
                cleanFieldValue(shipment.shipperCountry, "shipperCountry") ||
                "",
              shipperPincode:
                cleanFieldValue(shipment.shipperPincode, "shipperPincode") ||
                "",
              shipperKycType:
                cleanFieldValue(shipment.shipperKycType, "shipperKycType") ||
                "other",
              shipperKycNumber:
                cleanFieldValue(
                  shipment.shipperKycNumber,
                  "shipperKycNumber",
                ) || "",

              // Timestamps
              createdAt: new Date(),
              updatedAt: new Date(),
              __v: 0,
            };

            // Remove undefined values
            Object.keys(cleanShipment).forEach((key) => {
              if (cleanShipment[key] === undefined) {
                delete cleanShipment[key];
              }
            });

            console.log(
              `Prepared shipment ${index + 1}/${newShipments.length}:`,
              {
                awbNo: cleanShipment.awbNo,
                totalAmt: cleanShipment.totalAmt,
                chargeableWt: cleanShipment.chargeableWt,
              },
            );

            return cleanShipment;
          } catch (error) {
            console.error(`Error preparing shipment ${index}:`, error);
            errors.push({
              index: index,
              error: error.message,
            });
            return null;
          }
        })
        .filter((shipment) => shipment !== null);

      console.log("Total valid shipments to insert:", shipmentsToInsert.length);
      console.log("Total amount to add to balance:", totalAmountAdded);

      try {
        // Bulk insert shipments
        const result = await Shipment.insertMany(shipmentsToInsert, {
          ordered: false,
        });

        newRecordsCount = Array.isArray(result) ? result.length : 0;

        // Create AccountLedger entries for each shipment
        const ledgerEntries = shipmentsToInsert.map((shipment) => ({
          accountCode: shipment.accountCode,
          customer: shipment.customer || customer.name,
          awbNo: shipment.awbNo,
          payment: shipment.payment || "Credit",
          date: shipment.date,
          receiverFullName: shipment.receiverFullName,
          forwarder: shipment.forwarder || "",
          forwardingNo: shipment.forwardingNo || "",
          runNo: shipment.runNo || "",
          sector: shipment.sector,
          destination: shipment.destination,
          receiverCity: shipment.receiverCity,
          receiverPincode: shipment.receiverPincode,
          service: shipment.service,
          pcs: shipment.pcs,
          totalActualWt: shipment.totalActualWt,
          totalVolWt: shipment.totalVolWt,
          basicAmt: shipment.basicAmt,
          discount: shipment.discount,
          discountAmount: shipment.discountAmt || 0,
          hikeAmt: shipment.hikeAmt,
          sgst: shipment.sgst,
          cgst: shipment.cgst,
          igst: shipment.igst,
          miscChg: shipment.miscChg,
          fuelAmt: shipment.fuelAmt,
          nonTaxable: 0,
          totalAmt: shipment.totalAmt,
          debitAmount: shipment.totalAmt, // Debit the customer
          creditAmount: 0,
          operationRemark: shipment.operationRemark,
          reference: shipment.reference,
          leftOverBalance: oldBalance - totalAmountAdded,
          receivedAmount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        // Bulk insert ledger entries
        if (ledgerEntries.length > 0) {
          await AccountLedger.insertMany(ledgerEntries, { ordered: false });
          console.log("Created", ledgerEntries.length, "AccountLedger entries");
        }

        // Update customer balance
        const newBalance = oldBalance - totalAmountAdded;
        customer.leftOverBalance = newBalance;
        await customer.save();

        console.log("Successfully inserted:", newRecordsCount, "records");
        console.log("Updated customer balance:", {
          oldBalance: oldBalance,
          amountAdded: totalAmountAdded,
          newBalance: newBalance,
        });
      } catch (insertError) {
        console.error("Insert error:", insertError);

        if (insertError.writeErrors && insertError.writeErrors.length > 0) {
          insertError.writeErrors.forEach((err, index) => {
            console.error(`Write error ${index + 1}:`, {
              index: err.index,
              code: err.code,
              errmsg: err.errmsg,
              document: shipmentsToInsert[err.index]?.awbNo,
            });
            errors.push({
              awbNo: shipmentsToInsert[err.index]?.awbNo,
              error: err.errmsg,
            });
          });

          const totalErrors = insertError.writeErrors.length;
          newRecordsCount = shipmentsToInsert.length - totalErrors;
        } else {
          throw insertError;
        }
      }
    }

    const newBalance = oldBalance - totalAmountAdded;

    return NextResponse.json({
      success: true,
      message: `Portal bulk upload completed successfully`,
      newRecords: newRecordsCount,
      duplicates: duplicatesCount,
      totalProcessed: shipments.length,
      balanceUpdate: {
        oldBalance: oldBalance,
        newBalance: newBalance,
        difference: totalAmountAdded,
      },
      errors: errors.length > 0 ? errors : undefined,
      details: {
        totalReceived: shipments.length,
        newRecordsAdded: newRecordsCount,
        duplicatesSkipped: duplicatesCount,
        accountCode: accountCode,
        failedRecords: errors.length,
      },
    });
  } catch (error) {
    console.error("Portal Bulk Upload error:", error);

    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "Duplicate AWB numbers detected",
          error: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Error uploading shipments to portal",
        error: error.message,
        errorName: error.name,
      },
      { status: 500 },
    );
  }
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
