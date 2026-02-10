import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import { validateApiKey } from "@/app/lib/Apikeymiddleware";
import Manifest from "@/app/model/portal/Manifest";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import { createCanvas } from "canvas";

/**
 * Dispatch Manifest API
 * PUT /api/v1/manifest/dispatch
 * 
 * Request Body:
 * {
 *   "manifestNumber": "CUST001-01"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "manifestNumber": "CUST001-01",
 *     "status": "dispatched",
 *     "dispatchedAt": "2025-02-06T10:30:00.000Z",
 *     "awbCount": 3,
 *     "totalPieces": 10,
 *     "totalWeight": 25.5,
 *     "documents": {
 *       "manifestPdf": "base64_encoded_pdf_string",
 *       "shippingLabels": "base64_encoded_labels_pdf_string"
 *     }
 *   }
 * }
 */

await connectDB();

// Helper function to create label data from shipment
const createLabelDataFromShipment = (shipment, logoUrl = null) => {
  return {
    date: new Date().toLocaleDateString("en-GB"),
    logoUrl: logoUrl,
    from: {
      name: shipment.shipperFullName || "SENDER NAME",
      address: `${shipment.shipperAddressLine1 || ""} ${shipment.shipperAddressLine2 || ""}`.trim() || "SENDER ADDRESS",
      city: shipment.shipperCity || "SENDER CITY",
      state: shipment.shipperState || "SENDER STATE",
      zip: shipment.shipperPincode || "000000",
    },
    to: {
      name: shipment.receiverFullName || "RECEIVER NAME",
      attn: "Attn:",
      address: `${shipment.receiverAddressLine1 || ""} ${shipment.receiverAddressLine2 || ""}`.trim() || "RECEIVER ADDRESS",
      city: shipment.receiverCity || "RECEIVER CITY",
      state: shipment.receiverState || "RECEIVER STATE",
      zip: shipment.receiverPincode || "000000",
    },
    serviceCode: shipment.service || shipment.forwarder || shipment.networkName || "STANDARD SERVICE",
    pageInfo: "1/1",
    details: {
      type: shipment.shipmentType || "PKG",
      dim: "N/A",
      actWt: `${shipment.totalActualWt || 0} Kg`,
      volWt: `${shipment.totalVolWt || 0} Kg`,
      chgWt: `${Math.max(shipment.totalActualWt || 0, shipment.totalVolWt || 0)} Kg`,
    },
    trackingNumber: shipment.awbNo,
  };
};

// Helper function to generate barcode as base64
const generateBarcodeBase64 = (text) => {
  const canvas = createCanvas(280, 60);
  JsBarcode(canvas, text, {
    format: "CODE128",
    lineColor: "#000",
    width: 2,
    height: 50,
    displayValue: false,
    background: "#ffffff",
    margin: 5,
  });
  return canvas.toDataURL();
};

// Helper function to generate shipping label PDF
const generateShippingLabelPDF = (labelData) => {
  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const labelWidth = 100;
  const labelHeight = 150;

  // Calculate center position
  const xOffset = (pageWidth - labelWidth) / 2;
  const yOffset = (pageHeight - labelHeight) / 2;

  let currentY = yOffset;

  // Header
  pdf.setFillColor(55, 65, 81);
  pdf.rect(xOffset, currentY, labelWidth, 10, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(14);
  pdf.setFont(undefined, "bold");
  pdf.text("M5C Logistics™", xOffset + 2, currentY + 7);
  
  currentY += 10;

  // Date
  pdf.setFillColor(255, 255, 255);
  pdf.rect(xOffset, currentY, labelWidth, 6, "F");
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(8);
  pdf.setFont(undefined, "normal");
  pdf.text(`Date: ${labelData.date}`, xOffset + 2, currentY + 4);
  
  currentY += 6;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.5);
  pdf.line(xOffset, currentY, xOffset + labelWidth, currentY);

  // From Section
  pdf.setFillColor(0, 0, 0);
  pdf.rect(xOffset, currentY, 15, 5, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.setFont(undefined, "bold");
  pdf.text("From:", xOffset + 1, currentY + 3.5);
  
  currentY += 5;
  pdf.setTextColor(0, 0, 0);
  pdf.setFont(undefined, "bold");
  pdf.setFontSize(9);
  pdf.text(labelData.from.name, xOffset + 2, currentY + 4);
  pdf.setFontSize(8);
  pdf.setFont(undefined, "normal");
  pdf.text(labelData.from.address, xOffset + 2, currentY + 8);
  pdf.text(`${labelData.from.city}, ${labelData.from.state}`, xOffset + 2, currentY + 12);
  pdf.text(labelData.from.zip, xOffset + 2, currentY + 16);
  
  currentY += 20;
  pdf.line(xOffset, currentY, xOffset + labelWidth, currentY);

  // Service Code
  pdf.setFont(undefined, "bold");
  pdf.setFontSize(9);
  pdf.text(labelData.serviceCode, xOffset + 2, currentY + 4);
  pdf.text(labelData.pageInfo, xOffset + labelWidth - 15, currentY + 4);
  
  currentY += 6;
  pdf.line(xOffset, currentY, xOffset + labelWidth, currentY);

  // To Section Header
  pdf.setFillColor(0, 0, 0);
  pdf.rect(xOffset, currentY, 12, 5, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.text("To:", xOffset + 1, currentY + 3.5);
  
  pdf.rect(xOffset + 55, currentY, 20, 5, "F");
  pdf.text("Details", xOffset + 56, currentY + 3.5);
  
  currentY += 5;

  // To Section Content
  pdf.setTextColor(0, 0, 0);
  pdf.setFont(undefined, "bold");
  pdf.setFontSize(9);
  pdf.text(labelData.to.name, xOffset + 2, currentY + 4);
  pdf.setFont(undefined, "normal");
  pdf.setFontSize(8);
  pdf.text(labelData.to.attn, xOffset + 2, currentY + 8);
  pdf.text(labelData.to.address, xOffset + 2, currentY + 12);
  pdf.text(`${labelData.to.city}, ${labelData.to.state}`, xOffset + 2, currentY + 16);
  pdf.text(labelData.to.zip, xOffset + 2, currentY + 20);

  // Details Section
  pdf.setDrawColor(0, 0, 0);
  pdf.line(xOffset + 55, currentY, xOffset + 55, currentY + 24);
  pdf.setFontSize(7);
  pdf.text(`Type: ${labelData.details.type}`, xOffset + 57, currentY + 4);
  pdf.text(`Dim: ${labelData.details.dim}`, xOffset + 57, currentY + 8);
  pdf.text(`Act Wgt: ${labelData.details.actWt}`, xOffset + 57, currentY + 12);
  pdf.text(`Vol Wgt: ${labelData.details.volWt}`, xOffset + 57, currentY + 16);
  pdf.text(`Chg Wgt: ${labelData.details.chgWt}`, xOffset + 57, currentY + 20);
  
  currentY += 24;
  pdf.line(xOffset, currentY, xOffset + labelWidth, currentY);

  // Barcode
  const barcodeImage = generateBarcodeBase64(labelData.trackingNumber);
  pdf.addImage(barcodeImage, "PNG", xOffset + 10, currentY + 5, 80, 15);
  
  currentY += 22;
  pdf.setFont(undefined, "bold");
  pdf.setFontSize(7);
  pdf.text("TRACKING NUMBER", xOffset + 2, currentY);
  pdf.setFontSize(12);
  pdf.text(labelData.trackingNumber, xOffset + labelWidth - 40, currentY);
  
  currentY += 5;
  pdf.line(xOffset, currentY, xOffset + labelWidth, currentY);

  // Footer
  pdf.setFontSize(7);
  pdf.setFont(undefined, "normal");
  const footerText = "Sender warrants that this item does not contain non-mailable matter";
  const textWidth = pdf.getTextWidth(footerText);
  pdf.text(footerText, xOffset + (labelWidth - textWidth) / 2, currentY + 4);

  return pdf;
};

// Helper function to generate manifest PDF
const generateManifestPDF = (manifestData, shipments) => {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.width;
  const margin = 10;
  const usableWidth = pageWidth - margin * 2;

  let currentY = margin;

  // ========== HEADER ==========
  pdf.setFillColor(234, 27, 64);
  pdf.rect(0, 0, pageWidth, 25, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont(undefined, "bold");
  pdf.text("MANIFEST REPORT", margin, 15);
  currentY = 30;

  // ========== MANIFEST SUMMARY ==========
  pdf.setFillColor(245, 245, 245);
  pdf.setDrawColor(200, 200, 200);
  pdf.roundedRect(margin, currentY, usableWidth, 30, 3, 3, "FD");

  pdf.setFillColor(234, 27, 64);
  pdf.rect(margin, currentY, usableWidth, 8, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.text("MANIFEST SUMMARY", margin + 5, currentY + 6);
  currentY += 12;

  const colWidth = usableWidth / 3;
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(9);
  pdf.setFont(undefined, "normal");
  pdf.text(`Manifest ID: ${manifestData.manifestNumber}`, margin + 5, currentY);
  pdf.text(`AWBs: ${manifestData.awbCount}`, margin + colWidth + 5, currentY);
  pdf.text(`Pieces: ${manifestData.totalPieces}`, margin + colWidth * 2 + 5, currentY);

  currentY += 8;
  pdf.text(`Weight: ${manifestData.totalWeight} KG`, margin + 5, currentY);
  pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin + colWidth + 5, currentY);
  pdf.text("Status: DISPATCHED", margin + colWidth * 2 + 5, currentY);

  currentY += 15;

  // ========== SHIPMENT DETAILS ==========
  pdf.setFillColor(234, 27, 64);
  pdf.rect(margin, currentY, usableWidth, 8, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont(undefined, "bold");
  pdf.text("SHIPMENT DETAILS", margin + 5, currentY + 6);

  currentY += 12;

  // Table Header
  const rowHeight = 8;
  const headerHeight = 8;
  const columnConfig = [
    { header: "AWB", width: 50, align: "left" },
    { header: "PCS", width: 30, align: "center" },
    { header: "ACT WT", width: 30, align: "center" },
    { header: "VOL WT", width: 30, align: "center" },
    { header: "Service", width: usableWidth - 140, align: "left" },
  ];

  columnConfig.forEach((col, index) => {
    col.x = index === 0 ? margin : columnConfig[index - 1].x + columnConfig[index - 1].width;
  });

  function drawTableHeader(y) {
    pdf.setFillColor(241, 245, 249);
    pdf.rect(margin, y, usableWidth, headerHeight, "F");
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.3);
    pdf.rect(margin, y, usableWidth, headerHeight, "S");

    pdf.setTextColor(55, 65, 81);
    pdf.setFontSize(7);
    pdf.setFont(undefined, "bold");

    columnConfig.forEach((col, colIndex) => {
      let textX = col.x + 2;
      if (col.align === "center") {
        textX = col.x + col.width / 2 - pdf.getTextWidth(col.header) / 2;
      }
      pdf.text(col.header, textX, y + 5);

      if (colIndex > 0) {
        pdf.setDrawColor(226, 232, 240);
        pdf.line(col.x, y, col.x, y + headerHeight);
      }
    });
  }

  drawTableHeader(currentY);
  currentY += headerHeight;

  // Table Rows
  const shipmentsPerPage = 20;
  shipments.forEach((shipment, index) => {
    if (index > 0 && index % shipmentsPerPage === 0) {
      pdf.addPage();
      currentY = margin;
      pdf.setFillColor(234, 27, 64);
      pdf.rect(margin, currentY, usableWidth, 8, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10);
      pdf.setFont(undefined, "bold");
      pdf.text("SHIPMENT DETAILS (contd.)", margin + 5, currentY + 6);
      currentY += 12;
      drawTableHeader(currentY);
      currentY += headerHeight;
    }

    if (index % 2 === 0) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(margin, currentY, usableWidth, rowHeight, "F");
    }

    pdf.setDrawColor(243, 244, 246);
    pdf.setLineWidth(0.2);
    pdf.rect(margin, currentY, usableWidth, rowHeight, "S");

    columnConfig.forEach((col, colIndex) => {
      if (colIndex > 0) {
        pdf.setDrawColor(248, 250, 252);
        pdf.line(col.x, currentY, col.x, currentY + rowHeight);
      }
    });

    pdf.setFontSize(7);
    const cellY = currentY + 5.5;

    pdf.setFont(undefined, "bold");
    pdf.setTextColor(234, 27, 64);
    pdf.text(shipment.awbNo, columnConfig[0].x + 2, cellY);

    pdf.setFont(undefined, "normal");
    pdf.setTextColor(0, 0, 0);
    const pcsText = (shipment.pcs || shipment?.boxes?.length || 0).toString();
    const pcsX = columnConfig[1].x + columnConfig[1].width / 2 - pdf.getTextWidth(pcsText) / 2;
    pdf.text(pcsText, pcsX, cellY);

    const actWtText = `${shipment.totalActualWt || 0}`;
    const actWtX = columnConfig[2].x + columnConfig[2].width / 2 - pdf.getTextWidth(actWtText) / 2;
    pdf.text(actWtText, actWtX, cellY);

    const volWtText = `${shipment.totalVolWt || 0}`;
    const volWtX = columnConfig[3].x + columnConfig[3].width / 2 - pdf.getTextWidth(volWtText) / 2;
    pdf.text(volWtText, volWtX, cellY);

    const serviceName = shipment.service || shipment.forwarder || "N/A";
    pdf.text(serviceName, columnConfig[4].x + 2, cellY);

    currentY += rowHeight;
  });

  return pdf;
};

export async function PUT(req) {
  try {
    // Validate API key
    const validation = await validateApiKey(req, {
      requiredEndpoint: "/v1/manifest/dispatch",
      requiredMethod: "PUT"
    });

    if (!validation.valid) {
      return validation.response;
    }

    const { apiKey, customer, usage } = validation.data;

    // Parse request body
    const body = await req.json();
    const { manifestNumber } = body;

    console.log(`📋 Dispatch Manifest request from ${customer.code}:`);
    console.log(`   Manifest Number: ${manifestNumber}`);

    // ===== VALIDATION =====
    if (!manifestNumber) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing manifest number",
          message: "Manifest number is required",
          code: "MISSING_MANIFEST_NUMBER"
        },
        { status: 400 }
      );
    }

    // ===== STEP 1: Find manifest =====
    console.log("\n🔍 Step 1: Finding manifest...");
    
    const manifest = await Manifest.findOne({ 
      manifestNumber,
      accountCode: customer.code
    });

    if (!manifest) {
      return NextResponse.json(
        {
          success: false,
          error: "Manifest not found",
          message: `Manifest ${manifestNumber} not found for your account`,
          code: "MANIFEST_NOT_FOUND"
        },
        { status: 404 }
      );
    }

    console.log(`   ✅ Manifest found: ${manifestNumber}`);
    console.log(`   AWBs in manifest: ${manifest.awbNumbers.length}`);

    // ===== STEP 2: Get shipments =====
    console.log("\n🔍 Step 2: Fetching shipments...");
    
    const shipments = await Shipment.find({
      awbNo: { $in: manifest.awbNumbers },
      accountCode: customer.code
    });

    console.log(`   Found ${shipments.length} shipment(s)`);

    if (shipments.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No shipments found",
          message: "No shipments found for this manifest",
          code: "NO_SHIPMENTS_FOUND"
        },
        { status: 404 }
      );
    }

    // ===== STEP 3: Get customer logo =====
    const customerAccount = await CustomerAccount.findOne({
      accountCode: customer.code
    });
    
    const logoUrl = customerAccount?.labelPreferences?.logoUrl || null;

    // ===== STEP 4: Update manifest =====
    console.log("\n🔍 Step 3: Updating manifest status...");
    
    const dispatchedAt = new Date();
    
    await Manifest.findOneAndUpdate(
      { _id: manifest._id },
      { 
        $set: {
          status: "dispatched",
          dispatchedAt: dispatchedAt
        }
      },
      { new: true, runValidators: true }
    );

    console.log(`   ✅ Manifest status updated to 'dispatched'`);

    // ===== STEP 5: Update shipments =====
    console.log("\n🔍 Step 4: Updating shipment statuses...");
    
    const updateResult = await Shipment.updateMany(
      { awbNo: { $in: manifest.awbNumbers }, accountCode: customer.code },
      {
        $set: {
          status: "Manifest Dispatched"
        }
      }
    );

    console.log(`   ✅ Updated ${updateResult.modifiedCount} shipment(s)`);

    // ===== STEP 6: Generate PDFs =====
    console.log("\n🔍 Step 5: Generating PDFs...");
    
    // Generate Manifest PDF
    const manifestData = {
      manifestNumber: manifestNumber,
      awbCount: shipments.length,
      totalPieces: shipments.reduce((sum, s) => sum + (s.pcs || s.boxes?.length || 0), 0),
      totalWeight: shipments.reduce((sum, s) => sum + (s.totalActualWt || 0), 0)
    };

    console.log(`   Generating manifest PDF...`);
    const manifestPdf = generateManifestPDF(manifestData, shipments);
    const manifestPdfBase64 = manifestPdf.output("datauristring").split(",")[1];
    console.log(`   ✅ Manifest PDF generated`);

    // Generate Shipping Labels PDF (all labels in one PDF)
    console.log(`   Generating shipping labels...`);
    const labelsPdf = new jsPDF({
      unit: "mm",
      format: "a4",
    });

    let isFirstLabel = true;
    shipments.forEach((shipment) => {
      if (!isFirstLabel) {
        labelsPdf.addPage();
      }
      isFirstLabel = false;
      
      const labelData = createLabelDataFromShipment(shipment, logoUrl);
      const singleLabelPdf = generateShippingLabelPDF(labelData);
    });

    const labelsPdfBase64 = labelsPdf.output("datauristring").split(",")[1];
    console.log(`   ✅ Shipping labels generated (${shipments.length} label(s))`);

    console.log(`\n✅ Manifest dispatched successfully: ${manifestNumber}`);
    console.log(`   Total AWBs: ${shipments.length}`);
    console.log(`   Total Pieces: ${manifestData.totalPieces}`);
    console.log(`   Total Weight: ${manifestData.totalWeight.toFixed(2)} kg\n`);

    // ===== RESPONSE =====
    const response = {
      success: true,
      data: {
        manifestNumber: manifestNumber,
        status: "dispatched",
        dispatchedAt: dispatchedAt,
        awbCount: shipments.length,
        totalPieces: manifestData.totalPieces,
        totalWeight: parseFloat(manifestData.totalWeight.toFixed(2)),
        documents: {
          manifestPdf: manifestPdfBase64,
          shippingLabels: labelsPdfBase64
        }
      },
      meta: {
        apiVersion: "v1",
        endpoint: "/manifest/dispatch",
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
        customer: {
          code: customer.code,
          name: customer.name,
        },
        usage: {
          remaining: {
            hourly: apiKey.rateLimit.requestsPerHour - usage.hourly,
            daily: apiKey.rateLimit.requestsPerDay - usage.daily,
          }
        }
      }
    };

    return NextResponse.json(
      response,
      { 
        status: 200,
        headers: getRateLimitHeaders(apiKey, usage)
      }
    );

  } catch (error) {
    console.error("\n❌ Dispatch Manifest API Error:", error);
    console.error("   Error stack:", error.stack);
    
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: "An error occurred while dispatching manifest",
        code: "INTERNAL_ERROR",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// Helper functions
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function getRateLimitHeaders(apiKey, usage) {
  return {
    'X-Rate-Limit-Hourly': apiKey.rateLimit.requestsPerHour.toString(),
    'X-Rate-Limit-Remaining-Hourly': (apiKey.rateLimit.requestsPerHour - usage.hourly).toString(),
    'X-Rate-Limit-Daily': apiKey.rateLimit.requestsPerDay.toString(),
    'X-Rate-Limit-Remaining-Daily': (apiKey.rateLimit.requestsPerDay - usage.daily).toString(),
  };
}