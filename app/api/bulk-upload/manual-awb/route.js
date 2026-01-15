import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import AccountLedger from "@/app/model/AccountLedger";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function POST(request) {
  try {
    // Connect to database
    await connectDB();

    // Parse request body
    const { shipments, flightDate, csbChecked } = await request.json();

    console.log("Bulk upload request received:", {
      totalShipments: shipments?.length,
      flightDate,
      csbChecked,
    });

    // Validate input
    if (!shipments || !Array.isArray(shipments) || shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments data provided" },
        { status: 400 }
      );
    }

    if (!flightDate) {
      return NextResponse.json(
        { success: false, message: "Flight date is required" },
        { status: 400 }
      );
    }

    // Extract all AWB numbers from the uploaded data
    const awbNumbers = shipments
      .map((shipment) => shipment.awbNo)
      .filter((awb) => awb); // Filter out any undefined/null values

    if (awbNumbers.length === 0) {
      return NextResponse.json(
        { success: false, message: "No valid AWB numbers found in the data" },
        { status: 400 }
      );
    }

    console.log("Processing AWB numbers:", awbNumbers.length);

    // Check which AWB numbers already exist in the database
    const existingShipments = await Shipment.find({
      awbNo: { $in: awbNumbers },
    }).select("awbNo");

    console.log("Existing shipments found:", existingShipments.length);

    // Create a Set of existing AWB numbers for faster lookup
    const existingAwbSet = new Set(
      existingShipments.map((shipment) => shipment.awbNo)
    );

    // Filter out shipments with existing AWB numbers
    const newShipments = shipments.filter(
      (shipment) => shipment.awbNo && !existingAwbSet.has(shipment.awbNo)
    );

    let newRecordsCount = 0;
    let duplicatesCount = shipments.length - newShipments.length;
    let errors = [];

    console.log("New shipments to insert:", newShipments.length);
    console.log("Duplicates to skip:", duplicatesCount);

    // Insert only new shipments if there are any
    if (newShipments.length > 0) {
      // Helper function to clean field values
      const cleanFieldValue = (value, fieldName) => {
        if (value === null || value === undefined) return undefined;
        const str = String(value).trim();
        // Check if it's a placeholder/header value (contains underscore followed by number)
        if (/_\d+$/.test(str) || str === fieldName) {
          return undefined;
        }
        return str || undefined;
      };

      // Prepare shipments data for insertion
      const shipmentsToInsert = newShipments
        .map(({ id, ...shipment }) => {
          // CRITICAL: Ensure awbNo is not empty (unique constraint issue)
          if (!shipment.awbNo || shipment.awbNo.trim() === "") {
            console.error("Empty AWB number found, skipping:", shipment);
            return null;
          }

          const totalActualWt = Number(shipment.totalActualWt) || 0;
          const totalVolWt = Number(shipment.totalVolWt) || 0;
          const chargeableWt = Math.ceil(Math.max(totalActualWt, totalVolWt));

          // Create clean shipment object with proper data types
          const cleanShipment = {
            // Ensure awbNo is trimmed
            awbNo: shipment.awbNo.trim(),

            // Clean text fields (remove placeholder values like "fieldName_1")
            accountCode:
              cleanFieldValue(shipment.accountCode, "accountCode") || "DEFAULT",
            sector: cleanFieldValue(shipment.sector, "sector") || "DEFAULT",
            origin: cleanFieldValue(shipment.origin, "origin") || "DEFAULT",
            destination:
              cleanFieldValue(shipment.destination, "destination") || "",
            reference: cleanFieldValue(shipment.reference, "reference") || "",
            forwardingNo:
              cleanFieldValue(shipment.forwardingNo, "forwardingNo") || "",
            forwarder: cleanFieldValue(shipment.forwarder, "forwarder") || "",
            goodstype: cleanFieldValue(shipment.goodstype, "goodstype") || "",
            payment: cleanFieldValue(shipment.payment, "payment") || "Credit",
            operationRemark:
              cleanFieldValue(shipment.operationRemark, "operationRemark") ||
              "",

            // ========== CRITICAL FIXES START ==========
            // PRESERVE boxes array (was being lost!)
            boxes:
              Array.isArray(shipment.boxes) && shipment.boxes.length > 0
                ? shipment.boxes
                : [],

            // PRESERVE shipmentAndPackageDetails (was being lost!)
            shipmentAndPackageDetails: shipment.shipmentAndPackageDetails || {},

            // Content should be array, not string
            content: Array.isArray(shipment.content)
              ? shipment.content
              : shipment.content
              ? [shipment.content]
              : [],
            // ========== CRITICAL FIXES END ==========

            // Convert csb to boolean
            csb: csbChecked === true || csbChecked === "Yes",

            // Set flight date
            flight: flightDate,

            // Date field
            date: shipment.date ? new Date(shipment.date) : new Date(),

            // Fix shipmentType - validate against enum values
            shipmentType: (() => {
              const type = shipment.shipmentType?.toString().toLowerCase();
              if (type === "document" || type === "doc") return "Document";
              if (
                type === "non-document" ||
                type === "nondocument" ||
                type === "non document"
              )
                return "Non-Document";
              // Default to Non-Document if invalid or missing
              console.warn(
                `Invalid shipmentType "${shipment.shipmentType}" for AWB ${shipment.awbNo}, defaulting to Non-Document`
              );
              return "Non-Document";
            })(),

            // Convert numeric fields properly
            totalActualWt,
            totalVolWt,
            chargeableWt,
            totalInvoiceValue: Number(shipment.totalInvoiceValue) || 0,
            pcs: Number(shipment.pcs) || 0,
            basicAmt: Number(shipment.basicAmt) || 0,
            cgst: Number(shipment.cgst) || 0,
            sgst: Number(shipment.sgst) || 0,
            igst: Number(shipment.igst) || 0,
            totalAmt: Number(shipment.totalAmt) || 0,

            // Additional numeric fields from sample
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
            coLoaderNumber: Number(shipment.coLoaderNumber) || 0,

            // Convert boolean fields properly
            automation: Boolean(shipment.automation),
            handling: Boolean(shipment.handling),
            commercialShipment: Boolean(shipment.commercialShipment),
            isHold: Boolean(shipment.isHold),
            isBilled: Boolean(shipment.isBilled),
            billingLocked: Boolean(shipment.billingLocked),
            completeDataLock: Boolean(shipment.completeDataLock),
            exportThroughEcommerce: Boolean(shipment.exportThroughEcommerce),
            meisScheme: Boolean(shipment.meisScheme),

            // Receiver fields
            receiverFullName:
              cleanFieldValue(shipment.receiverFullName, "receiverFullName") ||
              "",
            receiverPhoneNumber:
              cleanFieldValue(
                shipment.receiverPhoneNumber,
                "receiverPhoneNumber"
              ) || "",
            receiverEmail:
              cleanFieldValue(shipment.receiverEmail, "receiverEmail") || "",
            receiverAddressLine1:
              cleanFieldValue(
                shipment.receiverAddressLine1,
                "receiverAddressLine1"
              ) || "",
            receiverAddressLine2:
              cleanFieldValue(
                shipment.receiverAddressLine2,
                "receiverAddressLine2"
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

            // Shipper fields
            shipperFullName:
              cleanFieldValue(shipment.shipperFullName, "shipperFullName") ||
              "",
            shipperPhoneNumber:
              cleanFieldValue(
                shipment.shipperPhoneNumber,
                "shipperPhoneNumber"
              ) || "",
            shipperEmail:
              cleanFieldValue(shipment.shipperEmail, "shipperEmail") || "",
            shipperAddressLine1:
              cleanFieldValue(
                shipment.shipperAddressLine1,
                "shipperAddressLine1"
              ) || "",
            shipperAddressLine2:
              cleanFieldValue(
                shipment.shipperAddressLine2,
                "shipperAddressLine2"
              ) || "",
            shipperCity:
              cleanFieldValue(shipment.shipperCity, "shipperCity") || "",
            shipperState:
              cleanFieldValue(shipment.shipperState, "shipperState") || "",
            shipperCountry:
              cleanFieldValue(shipment.shipperCountry, "shipperCountry") || "",
            shipperPincode:
              cleanFieldValue(shipment.shipperPincode, "shipperPincode") || "",
            shipperKycType:
              cleanFieldValue(shipment.shipperKycType, "shipperKycType") ||
              "other",
            shipperKycNumber:
              cleanFieldValue(shipment.shipperKycNumber, "shipperKycNumber") ||
              "",

            // Other reference fields
            billNo: cleanFieldValue(shipment.billNo, "billNo") || "",
            manifestNo:
              cleanFieldValue(shipment.manifestNo, "manifestNo") || "",
            runNo: cleanFieldValue(shipment.runNo, "runNo") || "",
            alMawb: cleanFieldValue(shipment.alMawb, "alMawb") || "",
            bag: cleanFieldValue(shipment.bag, "bag") || "",
            clubNo: cleanFieldValue(shipment.clubNo, "clubNo") || "",
            company: cleanFieldValue(shipment.company, "company") || "",
            currency: cleanFieldValue(shipment.currency, "currency") || "INR",
            currencys:
              cleanFieldValue(shipment.currencys, "currencys") || "INR",
            customer: cleanFieldValue(shipment.customer, "customer") || "",
            network: cleanFieldValue(shipment.network, "network") || "",
            networkName:
              cleanFieldValue(shipment.networkName, "networkName") || "",
            obc: cleanFieldValue(shipment.obc, "obc") || "",
            service: cleanFieldValue(shipment.service, "service") || "",
            coLoader: cleanFieldValue(shipment.coLoader, "coLoader") || "",
            holdReason:
              cleanFieldValue(shipment.holdReason, "holdReason") || "",
            otherHoldReason:
              cleanFieldValue(shipment.otherHoldReason, "otherHoldReason") ||
              "",
            miscChgReason:
              cleanFieldValue(shipment.miscChgReason, "miscChgReason") || "",
            insertUser:
              cleanFieldValue(shipment.insertUser, "insertUser") || "11111111",
            updateUser:
              cleanFieldValue(shipment.updateUser, "updateUser") || "11111111",
            status:
              cleanFieldValue(shipment.status, "status") || "Shipment Created!",
            localMF: cleanFieldValue(shipment.localMF, "localMF") || "",
            awbStatus: cleanFieldValue(shipment.awbStatus, "awbStatus") || "",
            notifType: cleanFieldValue(shipment.notifType, "notifType") || "",
            notifMsg: cleanFieldValue(shipment.notifMsg, "notifMsg") || "",
            runDate: shipment.runDate || null,
            gstNumber: cleanFieldValue(shipment.gstNumber, "gstNumber") || "",
            adCode: cleanFieldValue(shipment.adCode, "adCode") || "",
            termsOfInvoice:
              cleanFieldValue(shipment.termsOfInvoice, "termsOfInvoice") || "",
            crnNumber: cleanFieldValue(shipment.crnNumber, "crnNumber") || "",
            mhbsNumber:
              cleanFieldValue(shipment.mhbsNumber, "mhbsNumber") || "",

            // Timestamps
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Remove any undefined values
          Object.keys(cleanShipment).forEach((key) => {
            if (cleanShipment[key] === undefined) {
              delete cleanShipment[key];
            }
          });

          // Log boxes data for debugging
          console.log(
            `AWB ${cleanShipment.awbNo}: Boxes count = ${
              cleanShipment.boxes?.length || 0
            }`
          );
          if (cleanShipment.boxes && cleanShipment.boxes.length > 0) {
            console.log(`Box data:`, cleanShipment.boxes[0]);
          }

          return cleanShipment;
        })
        .filter((shipment) => shipment !== null); // Remove any null entries

      console.log(
        "Sample shipment to insert (with boxes):",
        JSON.stringify(shipmentsToInsert[0], null, 2)
      );
      console.log("Total shipments to insert:", shipmentsToInsert.length);

      try {
        // Validate first document manually to catch schema issues
        const testDoc = new Shipment(shipmentsToInsert[0]);
        const validationError = testDoc.validateSync();
        if (validationError) {
          console.error("Validation error on first document:", validationError);
          throw validationError;
        }
        console.log("First document validation passed");

        // Bulk insert new shipments
        const result = await Shipment.insertMany(shipmentsToInsert, {
          ordered: false, // Continue inserting even if some documents fail
        });

        // Account ledger updates
        for (const s of shipmentsToInsert) {
          const customer = await CustomerAccount.findOne({
            accountCode: s.accountCode.toUpperCase(),
          });

          if (!customer) continue;

          const oldBal = customer.leftOverBalance || 0;
          const newBal = oldBal + (s.totalAmt || 0);

          // Save account ledger entry
          await AccountLedger.create({
            accountCode: s.accountCode,
            customer: customer.companyName || "",
            awbNo: s.awbNo,
            payment: s.payment,
            date: new Date(s.date),
            receiverFullName: s.receiverFullName,
            forwarder: s.forwarder,
            forwardingNo: s.forwardingNo,
            runNo: s.runNo,
            sector: s.sector,
            destination: s.destination,
            receiverCity: s.receiverCity,
            receiverPincode: s.receiverPincode,
            service: s.service,
            pcs: s.pcs,
            totalActualWt: s.totalActualWt,
            totalVolWt: s.totalVolWt,
            basicAmt: s.basicAmt,
            discount: s.discount,
            discountAmount: s.discountAmt || 0,
            hikeAmt: s.hikeAmt,
            sgst: s.sgst,
            cgst: s.cgst,
            igst: s.igst,
            miscChg: s.miscChg,
            fuelAmt: s.fuelAmt,
            nonTaxable: 0, // Default value
            totalAmt: s.totalAmt,
            debitAmount: s.totalAmt,
            creditAmount: 0,
            operationRemark: s.operationRemark,
            reference: s.reference,
            leftOverBalance: newBal,
            receivedAmount: 0,
          });

          // Update customer leftover
          customer.leftOverBalance = newBal;
          await customer.save();
        }

        // insertMany returns an array of documents when successful
        newRecordsCount = Array.isArray(result) ? result.length : 0;
        console.log("Successfully inserted:", newRecordsCount, "records");
        console.log(
          "Result type:",
          typeof result,
          "Is array:",
          Array.isArray(result)
        );

        if (newRecordsCount === 0 && shipmentsToInsert.length > 0) {
          console.error("WARNING: No documents inserted but no error thrown!");
          console.error("This might be a schema validation issue");
        }
      } catch (insertError) {
        console.error("Insert error details:", insertError);
        console.error("Error name:", insertError.name);
        console.error("Error message:", insertError.message);
        console.error("Error code:", insertError.code);

        // Handle partial success in bulk insert
        if (insertError.writeErrors && insertError.writeErrors.length > 0) {
          // Log each write error for debugging
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

          // Get the count of successfully inserted documents
          // In case of partial failure, calculate successful inserts
          const totalErrors = insertError.writeErrors.length;
          newRecordsCount = shipmentsToInsert.length - totalErrors;

          console.log("Partial insert success:", newRecordsCount, "records");
          console.log("Failed inserts:", totalErrors);
        } else {
          // If it's a validation error, provide more details
          if (insertError.name === "ValidationError") {
            console.error("Validation error details:", insertError.errors);
            errors.push({
              error: "Validation failed",
              details: Object.keys(insertError.errors).map((key) => ({
                field: key,
                message: insertError.errors[key].message,
              })),
            });
          }

          // Re-throw if it's not a bulk write error
          throw insertError;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Upload completed successfully`,
      newRecords: newRecordsCount,
      duplicates: duplicatesCount,
      totalProcessed: shipments.length,
      errors: errors.length > 0 ? errors : undefined,
      details: {
        totalReceived: shipments.length,
        newRecordsAdded: newRecordsCount,
        duplicatesSkipped: duplicatesCount,
        csbStatus: csbChecked ? "Yes" : "No",
        flightDate: flightDate,
        failedRecords: errors.length,
      },
    });
  } catch (error) {
    console.error("Bulk upload error:", error);
    console.error("Error stack:", error.stack);

    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "Duplicate AWB numbers detected in the upload",
          error: "Some AWB numbers are already present in the database",
        },
        { status: 400 }
      );
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.keys(error.errors).map((key) => ({
        field: key,
        message: error.errors[key].message,
      }));

      return NextResponse.json(
        {
          success: false,
          message: "Validation error in shipment data",
          error: error.message,
          validationErrors: validationErrors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Error uploading shipments",
        error: error.message,
        errorName: error.name,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const awbNo = searchParams.get("awbNo");

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB number is required" },
        { status: 400 }
      );
    }

    const shipment = await Shipment.findOne({ awbNo });

    return NextResponse.json({
      success: true,
      exists: !!shipment,
      shipment: shipment || null,
      message: shipment
        ? `AWB ${awbNo} exists in database`
        : `AWB ${awbNo} not found`,
    });
  } catch (error) {
    console.error("Check AWB error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error checking AWB number",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
