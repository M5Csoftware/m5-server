import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import ChildShipment from "@/app/model/portal/ChildShipment";
import Shipment from "@/app/model/portal/Shipment";

// Function to convert INR to AUD using exchange rate API
async function convertToAUD(inrAmount) {
  try {
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/INR`
    );
    const data = await response.json();
    const audRate = data.rates.AUD;
    return (inrAmount * audRate).toFixed(2);
  } catch (error) {
    console.error("Currency conversion error:", error);
    return (inrAmount * 0.018).toFixed(2);
  }
}

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const runNo = searchParams.get("runNo");
    const format = searchParams.get("format");

    if (!runNo) {
      return NextResponse.json(
        { success: false, message: "Run Number is required" },
        { status: 400 }
      );
    }

    // Find bagging data for the run
    const baggingData = await Bagging.findOne({ runNo }).lean();

    if (!baggingData) {
      return NextResponse.json(
        { success: false, message: "No data found for this Run Number" },
        { status: 404 }
      );
    }

    if (!baggingData.rowData || baggingData.rowData.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments found in this run" },
        { status: 404 }
      );
    }

    // BAG TAG FORMAT
    if (format === "bag-tag") {
      // Separate master AWBs and child shipments from bagging rowData
      const masterAwbsInBagging = new Set();
      const childShipmentsInBagging = new Set();

      baggingData.rowData.forEach((item) => {
        if (item.awbNo) {
          masterAwbsInBagging.add(item.awbNo);
        }
        if (item.childShipment) {
          childShipmentsInBagging.add(item.childShipment);
        }
      });

      // Fetch child shipment records to get master-child relationships
      const childShipmentRecords = await ChildShipment.find({
        childAwbNo: { $in: Array.from(childShipmentsInBagging) },
      }).lean();

      // Create map of master AWB to its children (only children that are bagged)
      const masterToChildrenMap = {};
      childShipmentRecords.forEach((child) => {
        if (!masterToChildrenMap[child.masterAwbNo]) {
          masterToChildrenMap[child.masterAwbNo] = [];
        }
        // Only add children that are actually bagged
        if (childShipmentsInBagging.has(child.childAwbNo)) {
          masterToChildrenMap[child.masterAwbNo].push(child.childAwbNo);
        }
      });

      const bagTagData = [];
      const processedMasters = new Set();

      // Process all unique master AWBs (both directly bagged and those with bagged children)
      const allMasterAwbs = new Set([
        ...masterAwbsInBagging,
        ...Object.keys(masterToChildrenMap),
      ]);

      allMasterAwbs.forEach((masterAwbNo) => {
        if (processedMasters.has(masterAwbNo)) return;
        processedMasters.add(masterAwbNo);

        let referenceArray = [];

        // Check if master itself is bagged
        const masterIsBagged = masterAwbsInBagging.has(masterAwbNo);
        
        // Get bagged children for this master
        const baggedChildren = masterToChildrenMap[masterAwbNo] || [];

        // If both master and children are bagged
        if (masterIsBagged && baggedChildren.length > 0) {
          // Add master first, then all children
          referenceArray = [masterAwbNo, ...baggedChildren];
        } else if (masterIsBagged) {
          // Only master is bagged (no children or children not bagged)
          referenceArray = [masterAwbNo];
        } else if (baggedChildren.length > 0) {
          // Only children are bagged (master not bagged)
          referenceArray = [...baggedChildren];
        }

        if (referenceArray.length > 0) {
          bagTagData.push({
            bagTag: "",
            reference: referenceArray.join(', '),
            destination: "MEL",
            isLetter: "",
          });
        }
      });

      return NextResponse.json({
        success: true,
        data: bagTagData,
        runInfo: {
          runNo: baggingData.runNo,
          sector: baggingData.sector,
          flight: baggingData.flight,
          alMawb: baggingData.alMawb,
          obc: baggingData.obc,
          noOfBags: baggingData.noOfBags,
          noOfAwb: baggingData.noOfAwb,
          runWeight: baggingData.runWeight,
        },
        count: bagTagData.length,
        format: "bag-tag",
      });
    }

    // BAG BARCODE FORMAT
    if (format === "bag-barcode") {
      // Separate master AWBs and child shipments from bagging rowData
      const masterAwbsInBagging = new Set();
      const childShipmentsInBagging = new Set();

      baggingData.rowData.forEach((item) => {
        if (item.awbNo) {
          masterAwbsInBagging.add(item.awbNo);
        }
        if (item.childShipment) {
          childShipmentsInBagging.add(item.childShipment);
        }
      });

      // Fetch child shipment records
      const childShipmentRecords = await ChildShipment.find({
        childAwbNo: { $in: Array.from(childShipmentsInBagging) },
      }).lean();

      // Create map of master AWB to its bagged children
      const masterToChildrenMap = {};
      childShipmentRecords.forEach((child) => {
        if (!masterToChildrenMap[child.masterAwbNo]) {
          masterToChildrenMap[child.masterAwbNo] = [];
        }
        if (childShipmentsInBagging.has(child.childAwbNo)) {
          masterToChildrenMap[child.masterAwbNo].push(child.childAwbNo);
        }
      });

      const bagBarcodeData = [];
      const processedMasters = new Set();

      // Process all unique master AWBs
      const allMasterAwbs = new Set([
        ...masterAwbsInBagging,
        ...Object.keys(masterToChildrenMap),
      ]);

      allMasterAwbs.forEach((masterAwbNo) => {
        if (processedMasters.has(masterAwbNo)) return;
        processedMasters.add(masterAwbNo);

        const masterIsBagged = masterAwbsInBagging.has(masterAwbNo);
        const baggedChildren = masterToChildrenMap[masterAwbNo] || [];

        let barcodeArray = [];
        let snArray = [];

        // If both master and children are bagged
        if (masterIsBagged && baggedChildren.length > 0) {
          // Add master first
          barcodeArray.push(masterAwbNo);
          snArray.push(1);
          
          // Then add all children
          baggedChildren.forEach((child, idx) => {
            barcodeArray.push(child);
            snArray.push(idx + 2); // Start from 2 since master is 1
          });
        } else if (baggedChildren.length > 0) {
          // Only children are bagged
          baggedChildren.forEach((child, idx) => {
            barcodeArray.push(child);
            snArray.push(idx + 1);
          });
        } else if (masterIsBagged) {
          // Only master is bagged
          barcodeArray = [masterAwbNo];
          snArray = [1];
        }

        if (barcodeArray.length > 0) {
          bagBarcodeData.push({
            hbl: masterAwbNo,
            barcode: barcodeArray.join(', '),
            courier: "MEGTRACK PICKUP",
            connote: masterAwbNo,
            sn: snArray.join(', '),
          });
        }
      });

      return NextResponse.json({
        success: true,
        data: bagBarcodeData,
        runInfo: {
          runNo: baggingData.runNo,
          sector: baggingData.sector,
          flight: baggingData.flight,
          alMawb: baggingData.alMawb,
          obc: baggingData.obc,
          noOfBags: baggingData.noOfBags,
          noOfAwb: baggingData.noOfAwb,
          runWeight: baggingData.runWeight,
        },
        count: bagBarcodeData.length,
        format: "bag-barcode",
      });
    }

    // BAG REPORT FORMAT
    if (format === "bag-report") {
      // Separate master AWBs and child shipments from bagging rowData
      const masterAwbsInBagging = new Map(); // Map to store awbNo -> bag info
      const childShipmentsInBagging = new Map(); // Map to store childShipment -> bag info

      baggingData.rowData.forEach((item) => {
        if (item.awbNo) {
          masterAwbsInBagging.set(item.awbNo, {
            bagNo: item.bagNo,
            bagWeight: item.bagWeight,
          });
        }
        if (item.childShipment) {
          childShipmentsInBagging.set(item.childShipment, {
            bagNo: item.bagNo,
            bagWeight: item.bagWeight,
          });
        }
      });

      // Fetch child shipment records
      const childShipmentRecords = await ChildShipment.find({
        childAwbNo: { $in: Array.from(childShipmentsInBagging.keys()) },
      }).lean();

      // Create map of master AWB to its bagged children
      const masterToChildrenMap = {};
      childShipmentRecords.forEach((child) => {
        if (!masterToChildrenMap[child.masterAwbNo]) {
          masterToChildrenMap[child.masterAwbNo] = [];
        }
        if (childShipmentsInBagging.has(child.childAwbNo)) {
          masterToChildrenMap[child.masterAwbNo].push(child.childAwbNo);
        }
      });

      const bagReportData = [];
      let srNo = 1;
      const processedMasters = new Set();

      // Process all unique master AWBs
      const allMasterAwbs = new Set([
        ...masterAwbsInBagging.keys(),
        ...Object.keys(masterToChildrenMap),
      ]);

      allMasterAwbs.forEach((masterAwbNo) => {
        if (processedMasters.has(masterAwbNo)) return;
        processedMasters.add(masterAwbNo);

        const masterIsBagged = masterAwbsInBagging.has(masterAwbNo);
        const baggedChildren = masterToChildrenMap[masterAwbNo] || [];

        let childAwbNoArray = [];
        let bagNo = "";
        let bagWeight = 0;
        let totalPcs = 0;

        // If both master and children are bagged
        if (masterIsBagged && baggedChildren.length > 0) {
          // Show master first, then all children
          childAwbNoArray = [masterAwbNo, ...baggedChildren];
          totalPcs = 1 + baggedChildren.length;
          
          // Use master's bag info
          const masterBagInfo = masterAwbsInBagging.get(masterAwbNo);
          bagNo = masterBagInfo.bagNo;
          bagWeight = masterBagInfo.bagWeight;
        } else if (baggedChildren.length > 0) {
          // Only children are bagged
          childAwbNoArray = [...baggedChildren];
          totalPcs = baggedChildren.length;
          
          // Use first child's bag info
          const firstChildBagInfo = childShipmentsInBagging.get(baggedChildren[0]);
          if (firstChildBagInfo) {
            bagNo = firstChildBagInfo.bagNo;
            bagWeight = firstChildBagInfo.bagWeight;
          }
        } else if (masterIsBagged) {
          // Only master is bagged (show master in child column as itself)
          childAwbNoArray = [masterAwbNo];
          totalPcs = 1;
          
          const masterBagInfo = masterAwbsInBagging.get(masterAwbNo);
          bagNo = masterBagInfo.bagNo;
          bagWeight = masterBagInfo.bagWeight;
        }

        if (childAwbNoArray.length > 0) {
          bagReportData.push({
            srNo: srNo++,
            awbNo: masterAwbNo,
            pcs: totalPcs,
            runNo: runNo,
            childAwbNo: childAwbNoArray.join(', '),
            bagNo: bagNo,
            bagWeight: bagWeight,
          });
        }
      });

      return NextResponse.json({
        success: true,
        data: bagReportData,
        runInfo: {
          runNo: baggingData.runNo,
          sector: baggingData.sector,
          flight: baggingData.flight,
          alMawb: baggingData.alMawb,
          obc: baggingData.obc,
          noOfBags: baggingData.noOfBags,
          noOfAwb: baggingData.noOfAwb,
          runWeight: baggingData.runWeight,
        },
        count: bagReportData.length,
        format: "bag-report",
      });
    }

    // Extract AWB numbers from rowData for standard/TLA formats
    const awbsInRun = [];
    baggingData.rowData.forEach((item) => {
      if (item.awbNo) awbsInRun.push(item.awbNo);
      if (item.childShipment) awbsInRun.push(item.childShipment);
    });

    if (awbsInRun.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments found in this run" },
        { status: 404 }
      );
    }

    // Fetch all shipments (for standard and TLA formats)
    const shipments = await Shipment.find({
      awbNo: { $in: awbsInRun },
    }).lean();

    const awbToBagWeight = {};
    baggingData.rowData.forEach((item) => {
      if (item.awbNo) {
        awbToBagWeight[item.awbNo] = item.bagWeight;
      }
      if (item.childShipment) {
        awbToBagWeight[item.childShipment] = item.bagWeight;
      }
    });

    let manifestData;

    // TLA MANIFEST FORMAT
    if (format === "tla") {
      manifestData = await Promise.all(
        shipments.map(async (shipment) => {
          const contentDescription = Array.isArray(shipment.content)
            ? shipment.content.join(", ")
            : shipment.content || "";

          const bagWeight = awbToBagWeight[shipment.awbNo] || 0;
          const totalValueAUD = await convertToAUD(
            shipment.totalInvoiceValue || 0
          );

          return {
            customerRef: shipment.awbNo || "",
            connoteNo: shipment.awbNo || "",
            weight: bagWeight,
            cnee: shipment.receiverFullName || "",
            cneeCompany: "",
            tel: shipment.receiverPhoneNumber || "",
            address: `${shipment.receiverAddressLine1 || ""} ${
              shipment.receiverAddressLine2 || ""
            }`.trim(),
            suburb: shipment.receiverCity || "",
            state: shipment.receiverState || "",
            postalCode: shipment.receiverPincode || "",
            destination: "AU",
            pcs: shipment.pcs || 0,
            commodity: contentDescription,
            innerItems: "",
            unitValue: totalValueAUD,
            ttlValue: totalValueAUD,
            cmeter: "",
            shipper: shipment.shipperFullName || "",
            shipperAdd: shipment.shipperAddressLine1 || "",
            shipperCity: shipment.shipperCity || "",
            shipperState: shipment.shipperState || "",
            shipperPc: shipment.shipperPincode || "",
            shipperCountryCode: shipment.shipperCountry || "",
            shipperContact: shipment.shipperPhoneNumber || "",
            insurance: "",
            receiver: "",
            receiverTel: "",
            receiverAddress: "",
            receiverSuburb: "",
            receiverState: "",
            receiverPc: "",
            clear: "",
            fbaPo: "",
            fbaShipmentId: "",
            invoiceRef: "",
            importerAbn: "",
            vendorId: "",
            consignorTin: "",
            dg: "",
            directLodge: "",
            packages: "",
            peNumber: "",
            cneeEmail: "",
            marksAndNumbers: "",
            currency: "AUD",
            woodenBox: "",
            hasForklift: "",
            receiverEmail: "",
            fbaUnit: "",
          };
        })
      );
    } else {
      // STANDARD AUS MANIFEST FORMAT
      manifestData = await Promise.all(
        shipments.map(async (shipment) => {
          const contentDescription = Array.isArray(shipment.content)
            ? shipment.content.join(", ")
            : shipment.content || "";

          const bagWeight = awbToBagWeight[shipment.awbNo] || 0;
          const totalValueAUD = await convertToAUD(
            shipment.totalInvoiceValue || 0
          );

          return {
            hawb: shipment.awbNo || "",
            customerId: "",
            recieverFullName: shipment.receiverFullName || "",
            recieverAddress: `${shipment.receiverAddressLine1 || ""} ${
              shipment.receiverAddressLine2 || ""
            }`.trim(),
            receivercity: shipment.receiverCity || "",
            recieverstate: shipment.receiverState || "",
            receiverPostcode: shipment.receiverPincode || "",
            receiverCountry: shipment.receiverCountry || "",
            content: contentDescription,
            pcs: shipment.pcs || 0,
            received: "",
            weight: bagWeight,
            shipperName: shipment.shipperFullName || "",
            shipperAddress1: shipment.shipperAddressLine1 || "",
            shipperAddress2: shipment.shipperAddressLine2 || "",
            shipperCity: shipment.shipperCity || "",
            shipperState: shipment.shipperState || "",
            shipperPostcode: shipment.shipperPincode || "",
            shipperCountry: shipment.shipperCountry || "",
            origin: shipment.origin || "",
            destination: shipment.destination || "",
            totalValue: totalValueAUD,
            currency: "AUD",
            sac: "Y",
          };
        })
      );
    }

    const runInfo = {
      runNo: baggingData.runNo,
      sector: baggingData.sector,
      flight: baggingData.flight,
      alMawb: baggingData.alMawb,
      obc: baggingData.obc,
      noOfBags: baggingData.noOfBags,
      noOfAwb: baggingData.noOfAwb,
      runWeight: baggingData.runWeight,
    };

    return NextResponse.json({
      success: true,
      data: manifestData,
      runInfo: runInfo,
      count: manifestData.length,
      format: format || "standard",
    });
  } catch (error) {
    console.error("Error in AUS overseas manifest:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        error: error.message,
      },
      { status: 500 }
    );
  }
}