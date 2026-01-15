import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CreditNote from "@/app/model/CreditNote";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import nodemailer from "nodemailer";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
import fs from "fs";
import path from "path";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Email transporter configuration
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || "harmanjeet.singh@iic.ac.in",
    pass: process.env.EMAIL_PASSWORD || "twmy flrf saih grnq",
  },
});

// Helper function to convert image to base64
function imageToBase64(imagePath) {
  try {
    const fullPath = path.join(process.cwd(), imagePath);
    const imageBuffer = fs.readFileSync(fullPath);
    const base64Image = imageBuffer.toString('base64');
    
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = 'image/png';
    if (ext === '.svg') mimeType = 'image/svg+xml';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    
    return `data:${mimeType};base64,${base64Image}`;
  } catch (error) {
    console.error(`Error reading image ${imagePath}:`, error);
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  }
}

// Number to words converter
function numberToWords(num) {
  if (num === 0) return "zero";
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const teens = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];

  function convertLessThanThousand(n) {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " hundred" + (n % 100 !== 0 ? " " + convertLessThanThousand(n % 100) : "");
  }

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const remainder = Math.floor(num % 1000);

  let result = "";
  if (crore > 0) result += convertLessThanThousand(crore) + " crore ";
  if (lakh > 0) result += convertLessThanThousand(lakh) + " lakh ";
  if (thousand > 0) result += convertLessThanThousand(thousand) + " thousand ";
  if (remainder > 0) result += convertLessThanThousand(remainder);

  return "rupees " + (result.trim() || "zero") + " only";
}

// Generate HTML for Credit Note Summary (Page 1)
function generateCreditNoteHTML(creditNoteData, customer, shipments) {
  const {
    clientDetails = {},
    amountDetails = {},
    creditItems = [],
  } = creditNoteData || {};

  // Calculate total chargableWt from shipments
  const totalChargableWt = shipments?.reduce((sum, shipment) => {
    return sum + Number(shipment.chargableWt || shipment.totalActualWt || shipment.weight || 0);
  }, 0) || 0;

  const totals = {
    awbCount: creditItems?.length || 0,
    chargableWt: totalChargableWt,
    amount: amountDetails?.amount || 0,
    sgst: amountDetails?.sgst || 0,
    cgst: amountDetails?.cgst || 0,
    igst: amountDetails?.igst || 0,
    grandTotal: amountDetails?.grandTotal || 0,
  };

  const logoBase64 = imageToBase64('public/logo.svg');
  const stampBase64 = imageToBase64('public/invoice-stamp.png');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; background: #f9fafb; }
        .credit-note-container { width: 210mm; min-height: 297mm; padding: 24px; background: #f9fafb; }
        
        /* Header */
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .header h1 { font-size: 24px; font-weight: bold; text-align: center; flex: 1; }
        .logo { width: 33.33%; }
        .logo img { width: 50px; height: 50px; }
        .header-info { width: 33.33%; }
        .header-table { border-collapse: collapse; font-size: 11px; width: 100%; }
        .header-table th { text-align: left; border: 1px solid #000; padding: 6px 6px 12px 6px; background: #f2f2f2; width: 45%; }
        .header-table td { border: 1px solid #000; padding: 6px 6px 12px 6px; }
        
        /* Grid Section */
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 4px; }
        .box { border: 1px solid #000; border-radius: 6px; min-height: 140px; }
        .box-header { background: #d1d5db; padding: 8px 8px 16px 8px; font-weight: 600; font-size: 11px; }
        .box-content { padding: 8px 8px 16px 8px; font-size: 11px; line-height: 1.4; }
        
        /* Summary Table */
        table.summary-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
        table.summary-table th, table.summary-table td { border: 1px solid #000; padding: 8px 8px 16px 8px; text-align: center; }
        table.summary-table th { background: #e5e7eb; font-weight: bold; }
        table.summary-table td.no-border-bottom { border-bottom: none; }
        table.summary-table td.no-border-top { border-top: none; }
        table.summary-table td.text-left { text-align: left; }
        
        /* Amount in Words */
        .amount-words { font-size: 11px; font-weight: bold; display: flex; justify-content: space-between; padding: 8px 8px 16px 8px; border-top: 1px solid #6b7280; border-bottom: 1px solid #6b7280; margin-bottom: 4px; }
        .amount-words span.value { font-weight: normal; text-transform: uppercase; }
        
        /* Bank Details */
        .bank-section { display: flex; gap: 16px; justify-content: space-between; margin-bottom: 8px; margin-top: 60px; }
        .bank-box { border: 1px solid #000; border-radius: 6px; padding: 12px 12px 16px 12px; line-height: 2; flex: 1; }
        .summary-box { border: 1px solid #000; border-radius: 6px; padding: 12px 12px 16px 12px; width: 50%; font-size: 11px; font-weight: 600; line-height: 1.4; }
        .summary-row { display: flex; justify-content: space-between; }
        
        /* Grand Total */
        .grand-total { display: flex; justify-content: space-between; padding: 8px 0 16px 0; margin: 8px 0; border-top: 1px solid #6b7280; border-bottom: 1px solid #6b7280; }
        .grand-total-left { display: flex; gap: 8px; font-size: 11px; font-weight: bold; flex: 1; }
        .grand-total-right { display: flex; justify-content: space-between; width: 50%; font-size: 11px; font-weight: bold; padding: 0 12px; }
        
        /* Terms */
        .terms-section { display: flex; gap: 24px; padding: 8px 0; }
        .terms { flex: 1; }
        .terms ul { list-style: none; padding: 0; }
        .terms li { margin-bottom: 4px; font-size: 11px; }
        .signature-box { border: 1px solid #000; border-radius: 6px; padding: 16px 16px 16px 16px; flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: space-between; background: white; }
        .signature-box strong:first-child { font-size: 11px; font-weight: 600; padding-bottom: 12px; line-height: 1.4; }
        .signature-box strong:last-child { font-size: 14px; }
        .signature-box img { width: 128px; height: 128px; object-fit: contain; }
        
        .uppercase { text-transform: uppercase; }
        .font-bold { font-weight: bold; }
        hr { margin-top: 16px; border: none; border-top: 1px solid #000; }
      </style>
    </head>
    <body>
      <div class="credit-note-container">
        <!-- Header -->
        <div class="header">
          <div class="logo">
            <img src="${logoBase64}" alt="Logo" style="width: 50px; height: 50px; object-fit: contain;" />
          </div>
          <h1>CREDIT NOTE</h1>
          <div class="header-info">
            <table class="header-table">
              <tr>
                <th>Credit Note No:</th>
                <td>${clientDetails.invoiceNo || "N/A"}</td>
              </tr>
              <tr>
                <th>Date:</th>
                <td>${clientDetails.invoiceDate ? new Date(clientDetails.invoiceDate).toLocaleDateString("en-IN") : "DD/MM/YYYY"}</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Top Section -->
        <div class="grid-2">
          <div class="box">
            <div class="box-header">Bill To: ${customer?.name || clientDetails.customerName || "Customer Name"}</div>
            <div class="box-content">
              ${customer?.address1 ? `<div class="uppercase">${customer.address1}</div>` : ""}
              ${customer?.address2 ? `<div class="uppercase">${customer.address2}</div>` : ""}
              ${customer?.city || customer?.pincode ? `<div class="uppercase">${customer?.city || ""} ${customer?.pincode ? `- ${customer.pincode}` : ""}</div>` : ""}
              ${customer?.country ? `<div class="uppercase" style="margin-bottom: 8px;">${customer.country}</div>` : ""}
              ${customer?.gstNo || clientDetails.gstNo ? `<div><strong>GST:</strong> ${customer?.gstNo || clientDetails.gstNo}</div>` : ""}
              ${customer?.panNo ? `<div><strong>PAN No:</strong> ${customer.panNo}</div>` : ""}
              ${customer?.state || clientDetails.state ? `<div><strong>State:</strong> ${customer?.state || clientDetails.state}</div>` : ""}
              ${customer?.phone ? `<div><strong>Phone:</strong> ${customer.phone}</div>` : ""}
            </div>
          </div>

          <div class="box">
            <div class="box-header">M 5 CONTINENT LOGISTICS SOLUTION PVT. LTD.</div>
            <div class="box-content">
              <div>Ground Floor, Khasra No 91, Plot No. NJF PC 40<br>
              Bamroli Village, NEW DELHI-110077<br>
              Email: Info@m5clogs.com<br>
              Website: www.m5clogs.com</div>
              <div style="margin-top: 8px; line-height: 1.4;">
                <div><strong>GST:</strong> 07AACCA2659K1ZP</div>
                <div>CIN No: U51201DL2023PTC410991</div>
                <div>PAN No.: AAQCM6359K</div>
                <div>STATE: 07 DELHI</div>
                <div><strong>SAC:</strong> 996812</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Credit Note Summary Table -->
        <h2 style="text-align: center; font-weight: bold; margin: 16px 0;">Credit Note Summary</h2>
        <table class="summary-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Total AWBs</th>
              <th>Weight</th>
              <th>Amount</th>
              <th>Non Taxable<br>Amount</th>
              <th>SGST 9%</th>
              <th>CGST 9%</th>
              <th>IGST 18%</th>
              <th>G. Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="no-border-bottom">Courier Service</td>
              <td>${totals.awbCount}</td>
              <td>${totals.chargableWt.toFixed(2)}</td>
              <td>${totals.amount.toFixed(2)}</td>
              <td>0.00</td>
              <td>${totals.sgst.toFixed(2)}</td>
              <td>${totals.cgst.toFixed(2)}</td>
              <td>${totals.igst.toFixed(2)}</td>
              <td>${totals.grandTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td class="no-border-top text-left"><strong>SAC:</strong> 996812</td>
              <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>
          </tbody>
        </table>

        <!-- Amount in Words -->
        <div class="amount-words">
          <div>Amount in Words: <span class="value">${numberToWords(totals.grandTotal)}</span></div>
        </div>

        <!-- Bank Details and Summary -->
        <div class="bank-section">
          <div class="bank-box">
            <div class="font-bold">Our Bank Details</div>
            <div style="font-size: 11px;">
              <div>Bank Name: INDUSIND BANK</div>
              <div>A/C No: 258826097173</div>
              <div>IFSC/RTGS: INDB0000005</div>
            </div>
          </div>

          <div class="summary-box">
            <div class="summary-row"><span>Non Taxable Amount:</span><span>0.00</span></div>
            <div class="summary-row"><span>Taxable:</span><span>${totals.amount.toFixed(2)}</span></div>
            <div class="summary-row"><span>SGST @9%:</span><span>${totals.sgst.toFixed(2)}</span></div>
            <div class="summary-row"><span>CGST @9%:</span><span>${totals.cgst.toFixed(2)}</span></div>
            <div class="summary-row"><span>IGST @18%:</span><span>${totals.igst.toFixed(2)}</span></div>
          </div>
        </div>

        <!-- Grand Total -->
        <div class="grand-total">
          <div class="grand-total-left">
            <span>Amount in Words:</span>
            <span class="uppercase" style="font-weight: normal;">${numberToWords(totals.grandTotal)}</span>
          </div>
          <div class="grand-total-right">
            <span style="padding-left: 4px;">Grand Total:</span>
            <span>${totals.grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <!-- Terms and Signature -->
        <div class="terms-section">
          <div class="terms">
            <strong>E.&O.E</strong>
            <ul style="margin-top: 8px;">
              <li><strong>1.</strong> On receipt of the credit note the adjustment should be made within 24 hours.</li>
              <li><strong>2.</strong> Company liability is restricted as per the stipulations specified in airway bill.</li>
              <li><strong>3.</strong> All disputes are subject to Delhi Court only.</li>
              <li><strong>4.</strong> This is a computer generated credit note and it does not require signature.</li>
            </ul>
          </div>
          <div class="signature-box">
            <strong style="text-align: center;">For M 5 CONTINENT LOGISTICS SOLUTION PVT. LTD</strong>
            <img src="${stampBase64}" alt="Stamp & Signature" />
            <strong>Stamp & Signature</strong>
          </div>
        </div>
        <hr>
      </div>
    </body>
    </html>
  `;
}

// Generate Shipment Details Content (Page 2)
function generateShipmentDetailsContent(shipments) {
  if (!shipments || shipments.length === 0) return "";

  const rows = shipments.map((s) => {
    const awbNo = s.awbNo || "-";
    const date = s.date ? new Date(s.date).toLocaleDateString("en-IN") : "-";
    const destination = s.receiverCity || s.destination || "-";
    const state = s.receiverState || s.state || "-";
    const product = s.service || s.shipmentType || "-";
    const weight = Number(s.chargableWt || s.totalActualWt || s.weight || 0).toFixed(3);
    const creditAmount = Number(s.creditAmount || 0).toFixed(2);

    return `
      <tr style="text-align: center;">
        <td style="border: 1px solid #000; padding: 4px 4px 12px 4px;">${awbNo}</td>
        <td style="border: 1px solid #000; padding: 4px 4px 12px 4px;">${date}</td>
        <td style="border: 1px solid #000; padding: 4px 4px 12px 4px;">${destination}</td>
        <td style="border: 1px solid #000; padding: 4px 4px 12px 4px;">${state}</td>
        <td style="border: 1px solid #000; padding: 4px 4px 12px 4px;">${product}</td>
        <td style="border: 1px solid #000; padding: 4px 4px 12px 4px;">${weight}</td>
        <td style="border: 1px solid #000; padding: 4px 4px 12px 4px;">${creditAmount}</td>
      </tr>
    `;
  }).join("");

  return `
    <h2 style="text-align: center; font-weight: bold; margin-bottom: 16px; font-size: 14px;">Shipment Details</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
      <thead>
        <tr style="background: #e5e7eb;">
          <th style="border: 1px solid #000; padding: 4px 4px 12px 4px;">AWB No</th>
          <th style="border: 1px solid #000; padding: 4px 4px 12px 4px;">Date</th>
          <th style="border: 1px solid #000; padding: 4px 4px 12px 4px;">Destination</th>
          <th style="border: 1px solid #000; padding: 4px 4px 12px 4px;">State</th>
          <th style="border: 1px solid #000; padding: 4px 4px 12px 4px;">Service</th>
          <th style="border: 1px solid #000; padding: 4px 4px 12px 4px;">Weight</th>
          <th style="border: 1px solid #000; padding: 4px 4px 12px 4px;">CR Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <div style="margin-top: 16px; font-size: 11px;">
      <strong>Total Shipments: ${shipments.length}</strong>
    </div>
  `;
}

// Generate PDF using Puppeteer
async function generatePDFBuffer(creditNoteData, customer, shipments) {
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu"
      ],
    });

    const page = await browser.newPage();
    
    // Generate combined HTML with both pages - NOW PASSING SHIPMENTS
    let combinedHTML = generateCreditNoteHTML(creditNoteData, customer, shipments);
    
    // If shipments exist, append shipment details page
    if (shipments && shipments.length > 0) {
      const shipmentDetailsContent = generateShipmentDetailsContent(shipments);
      
      // Insert shipment details before closing body tag
      combinedHTML = combinedHTML.replace(
        '</div>\n    </body>',
        `</div>
        <div style="padding: 24px;">
          ${shipmentDetailsContent}
        </div>
    </body>`
      );
    }
    
    await page.setContent(combinedHTML, { waitUntil: "networkidle0" });
    
    // Generate PDF with all pages
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    await browser.close();
    return pdfBuffer;
  } catch (error) {
    if (browser) await browser.close();
    throw error;
  }
}

// Upload PDF to Cloudinary
async function uploadPDFToCloudinary(pdfBuffer, creditNoteNumber) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: "credit-notes",
        public_id: `credit_note_${creditNoteNumber.replace(/\//g, "_")}_${Date.now()}`,
        format: "pdf",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    const stream = new Readable();
    stream.push(pdfBuffer);
    stream.push(null);
    stream.pipe(uploadStream);
  });
}

// Delete PDF from Cloudinary
async function deletePDFFromCloudinary(publicId) {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
    console.log(`✅ Deleted PDF from Cloudinary: ${publicId}`);
  } catch (error) {
    console.error(`❌ Error deleting PDF from Cloudinary:`, error);
  }
}

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { selectedCreditNotes } = body;

    if (!selectedCreditNotes || selectedCreditNotes.length === 0) {
      return NextResponse.json(
        { success: false, message: "No credit notes selected" },
        { status: 400 }
      );
    }

    const results = [];
    const errors = [];

    for (const selectedCreditNote of selectedCreditNotes) {
      let cloudinaryPublicId = null;
      
      try {
        console.log(`📧 Processing credit note: ${selectedCreditNote.creditNoteNo}`);

        // Fetch full credit note data
        const creditNote = await CreditNote.findOne({
          "clientDetails.invoiceNo": selectedCreditNote.creditNoteNo,
        });

        if (!creditNote) {
          errors.push({
            creditNoteNo: selectedCreditNote.creditNoteNo,
            error: "Credit note not found",
          });
          continue;
        }

        // Fetch customer email
        const customer = await CustomerAccount.findOne({
          accountCode: creditNote.clientDetails.accountCode,
        });

        if (!customer || !customer.billingEmailId) {
          errors.push({
            creditNoteNo: selectedCreditNote.creditNoteNo,
            error: "Customer email not found",
          });
          continue;
        }

        console.log(`✅ Found customer: ${customer.name} (${customer.billingEmailId})`);

        // Fetch shipment details for all AWBs in credit items
        const awbNumbers = creditNote.creditItems.map(item => item.awbNo);
        const shipments = await Shipment.find({
          awbNo: { $in: awbNumbers }
        }).lean();

        // Add credit amounts to shipments
        const shipmentsWithCredit = shipments.map(shipment => {
          const creditItem = creditNote.creditItems.find(item => item.awbNo === shipment.awbNo);
          return {
            ...shipment,
            creditAmount: creditItem?.creditAmount || 0
          };
        });

        console.log(`✅ Found ${shipmentsWithCredit.length} shipments`);

        // Generate PDF
        console.log("📄 Generating PDF...");
        const pdfBuffer = await generatePDFBuffer(creditNote, customer, shipmentsWithCredit);
        console.log("✅ PDF generated successfully");

        // Upload PDF to Cloudinary
        console.log("☁️ Uploading PDF to Cloudinary...");
        const cloudinaryResult = await uploadPDFToCloudinary(pdfBuffer, creditNote.clientDetails.invoiceNo);
        cloudinaryPublicId = cloudinaryResult.public_id;
        const pdfUrl = cloudinaryResult.secure_url;
        console.log(`✅ PDF uploaded to Cloudinary: ${pdfUrl}`);

        // Send Email with PDF
        const mailOptions = {
          from: process.env.EMAIL_USER || "harmanjeet.singh@iic.ac.in",
          to: customer.billingEmailId,
          subject: `Credit Note - ${creditNote.clientDetails.invoiceNo}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #EA1B40; color: white; padding: 30px 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .header h1 { margin: 0; font-size: 28px; }
                .content { background-color: #ffffff; padding: 30px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                .greeting { font-size: 16px; margin-bottom: 20px; }
                .credit-note-details { background-color: #f9f9f9; border-left: 4px solid #EA1B40; padding: 20px; margin: 20px 0; border-radius: 3px; }
                .credit-note-details p { margin: 10px 0; }
                .credit-note-details strong { color: #EA1B40; }
                .grand-total { background-color: #EA1B40; color: white; padding: 15px; text-align: center; font-size: 20px; font-weight: bold; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 14px; color: #666; }
                .company-name { color: #EA1B40; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Credit Note</h1>
                </div>
                <div class="content">
                  <p class="greeting">Dear <strong>${customer.name}</strong>,</p>
                  <p>We hope this email finds you well. Please find attached your credit note for adjustment.</p>
                  
                  <div class="credit-note-details">
                    <p><strong>Credit Note Number:</strong> ${creditNote.clientDetails.invoiceNo}</p>
                    <p><strong>Credit Note Date:</strong> ${new Date(creditNote.clientDetails.invoiceDate).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    <p><strong>Total Shipments:</strong> ${creditNote.creditItems?.length || 0} AWBs</p>
                  </div>
                  
                  <div class="grand-total">
                    Credit Amount: ₹${creditNote.amountDetails.grandTotal.toFixed(2)}
                  </div>
                  
                  <p style="margin-top: 30px;">If you have any questions or concerns regarding this credit note, please don't hesitate to contact us.</p>
                  
                  <div class="footer">
                    <p>Thank you for your business!</p>
                    <p style="margin-top: 15px;">
                      Best Regards,<br>
                      <span class="company-name">M 5 CONTINENT LOGISTICS SOLUTION PVT. LTD.</span><br>
                      Email: <a href="mailto:Info@m5clogs.com" style="color: #EA1B40;">Info@m5clogs.com</a><br>
                      Website: <a href="https://www.m5clogs.com" style="color: #EA1B40;">www.m5clogs.com</a>
                    </p>
                  </div>
                </div>
              </div>
            </body>
            </html>
          `,
          attachments: [
            {
              filename: `CreditNote_${creditNote.clientDetails.invoiceNo.replace(/\//g, "_")}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${customer.billingEmailId}`);

        // Delete PDF from Cloudinary after successful email send
        console.log("🗑️ Deleting PDF from Cloudinary...");
        await deletePDFFromCloudinary(cloudinaryPublicId);

        results.push({
          creditNoteNo: creditNote.clientDetails.invoiceNo,
          email: customer.billingEmailId,
          status: "sent",
        });
      } catch (error) {
        console.error(`❌ Error processing credit note ${selectedCreditNote.creditNoteNo}:`, error);
        
        // Cleanup: Delete PDF from Cloudinary if upload was successful but email failed
        if (cloudinaryPublicId) {
          console.log("🗑️ Cleaning up failed email - deleting PDF from Cloudinary...");
          await deletePDFFromCloudinary(cloudinaryPublicId);
        }
        
        errors.push({
          creditNoteNo: selectedCreditNote.creditNoteNo,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully sent ${results.length} credit note(s)`,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("❌ Email credit note error:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// GET endpoint for fetching credit notes
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const customerCode = searchParams.get("customerCode");

    if (!branch || !fromDate || !toDate) {
      return NextResponse.json(
        { success: false, message: "Branch and date range are required" },
        { status: 400 }
      );
    }

    // Build query
    const query = {
      "clientDetails.branch": branch,
      "clientDetails.invoiceDate": {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      },
    };

    if (customerCode) {
      query["clientDetails.accountCode"] = customerCode;
    }

    // Fetch credit notes
    const creditNotes = await CreditNote.find(query)
      .select("clientDetails amountDetails creditItems")
      .sort({ "clientDetails.invoiceDate": -1 })
      .lean();

    // Fetch shipment details for weight calculation
    const creditNotesWithWeight = await Promise.all(
      creditNotes.map(async (cn) => {
        const awbNumbers = cn.creditItems.map(item => item.awbNo);
        const shipments = await Shipment.find({
          awbNo: { $in: awbNumbers }
        }).select("awbNo chargableWt totalActualWt weight").lean();

        // Calculate total weight using chargableWt
        const totalWeight = shipments.reduce((sum, s) => {
          return sum + Number(s.chargableWt || s.totalActualWt || s.weight || 0);
        }, 0);

        return {
          creditNoteNo: cn.clientDetails.invoiceNo,
          creditNoteDate: cn.clientDetails.invoiceDate,
          customerCode: cn.clientDetails.accountCode,
          customerName: cn.clientDetails.customerName,
          branch: cn.clientDetails.branch,
          grandTotal: cn.amountDetails?.grandTotal || 0,
          weight: totalWeight,
        };
      })
    );

    return NextResponse.json({
      success: true,
      creditNotes: creditNotesWithWeight,
    });
  } catch (error) {
    console.error("❌ Error fetching credit notes:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}