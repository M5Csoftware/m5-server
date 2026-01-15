import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Invoice from "@/app/model/Invoice";
import InvoicePTP from "@/app/model/InvoicePTP";
import * as XLSX from "xlsx";
import mongoose from "mongoose";

// Ensure DB connection
connectDB();

/**
 * Handle POST: Upload IRN data from Excel file
 */
export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const branch = formData.get("branch");
    const invoiceType = formData.get("invoiceType");
    const date = formData.get("date");

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (!branch || !invoiceType || !date) {
      return NextResponse.json(
        { error: "Branch, Invoice Type, and Date are required" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" });

    if (!jsonData || jsonData.length === 0) {
      return NextResponse.json(
        { error: "No data found in Excel file" },
        { status: 400 }
      );
    }

    console.log("First row data:", jsonData[0]); // Debug log

    // Process each row and update database
    const results = {
      success: [],
      failed: [],
    };

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      
      try {
        // Get the Excel File column value
        const excelFileValue = row["Excel File"] || 
                               row["excel file"] || 
                               row["ExcelFile"] || 
                               row["Excel_File"] || 
                               row["EXCEL_FILE"] || 
                               "";
        
        // Convert "Yes"/"No" to boolean - EXPLICIT CONVERSION
        const isExcelBoolean = excelFileValue.toString().trim().toLowerCase() === "yes";

        console.log(`Row ${i + 1} - Excel File Value: "${excelFileValue}", isExcel: ${isExcelBoolean}`);

        // Get document number from Excel with multiple variations
        const docNo = row["Doc No"] || row["Document No"] || row["docNo"] || row["DocumentNo"] || "";
        
        if (!docNo) {
          results.failed.push({
            row: i + 1,
            error: "Document number is missing",
            data: row,
          });
          continue;
        }

        console.log(`Processing row ${i + 1}, docNo: ${docNo}, isExcel: ${isExcelBoolean}`);

        let updated = false;

        // Build search query for Invoice collection
        const invoiceQuery = {
          $or: [
            { invoiceNumber: docNo },
          ]
        };
        
        // Only add invoiceSrNo if docNo is a pure number
        if (/^\d+$/.test(docNo)) {
          invoiceQuery.$or.push({ invoiceSrNo: parseInt(docNo) });
        }

        console.log(`Searching Invoice with query:`, invoiceQuery);

        // Try to update Invoice collection first
        const invoice = await Invoice.findOne(invoiceQuery);

        console.log(`Invoice found:`, invoice ? `Yes (ID: ${invoice._id})` : 'No');

        if (invoice) {
          // Create the qrCodeData object with explicit field assignment
          const newQrCodeEntry = {
            _id: new mongoose.Types.ObjectId(),
            ackNo: row["Ack No"] || row["ackNo"] || row["AckNo"] || "",
            ackDate: row["Ack Date"] || row["ackDate"] || row["AckDate"] || "",
            irnNumber: row["IRN"] || row["irn"] || row["Irn"] || "",
            qrCode: row["Signed QR Code"] || row["signedQrCode"] || row["SignedQRCode"] || row["QR Code"] || row["SignedQrCOde"] || "",
            invoiceType: invoiceType,
            invoiceIRNDate: new Date(date),
            isExcel: isExcelBoolean
          };

          console.log(`New QR Code Entry to push:`, JSON.stringify(newQrCodeEntry, null, 2));

          // Use native MongoDB driver to ensure field is saved
          const db = mongoose.connection.db;
          const collection = db.collection('invoices');
          
          const updateResult = await collection.updateOne(
            { _id: invoice._id },
            { 
              $push: { 
                qrCodeData: newQrCodeEntry
              }
            }
          );

          if (updateResult.modifiedCount > 0) {
            // Fetch the updated document
            const updatedDoc = await collection.findOne({ _id: invoice._id });
            const latestEntry = updatedDoc.qrCodeData[updatedDoc.qrCodeData.length - 1];
            
            updated = true;
            console.log(`Successfully added IRN data to Invoice.`);
            console.log(`Latest qrCodeData entry:`, JSON.stringify(latestEntry, null, 2));
            console.log(`isExcel value in DB:`, latestEntry.isExcel, `Type:`, typeof latestEntry.isExcel);
            
            results.success.push({
              row: i + 1,
              docNo: docNo,
              collection: "Invoice",
              invoiceId: invoice._id.toString(),
              isExcel: latestEntry.isExcel,
              message: "IRN data added successfully",
            });
          }
        }

        // If not found in Invoice, try InvoicePTP
        if (!updated) {
          // Search InvoicePTP by invoiceNo OR invoiceSrNo (both are strings)
          const invoicePTPQuery = {
            $or: [
              { "clientDetails.invoiceNo": docNo },
              { "clientDetails.invoiceSrNo": docNo },
            ],
          };

          console.log(`Searching InvoicePTP with query:`, invoicePTPQuery);

          const invoicePTP = await InvoicePTP.findOne(invoicePTPQuery);

          console.log(`InvoicePTP found:`, invoicePTP ? `Yes (ID: ${invoicePTP._id})` : 'No');

          if (invoicePTP) {
            // Create the qrCodeData object with explicit field assignment
            const newQrCodeEntry = {
              _id: new mongoose.Types.ObjectId(),
              ackNo: row["Ack No"] || row["ackNo"] || row["AckNo"] || "",
              ackDate: row["Ack Date"] || row["ackDate"] || row["AckDate"] || "",
              irnNumber: row["IRN"] || row["irn"] || row["Irn"] || "",
              qrCode: row["Signed QR Code"] || row["signedQrCode"] || row["SignedQRCode"] || row["QR Code"] || row["SignedQrCOde"] || "",
              invoiceType: invoiceType,
              invoiceIRNDate: new Date(date),
              isExcel: isExcelBoolean
            };

            // Use native MongoDB driver
            const db = mongoose.connection.db;
            const collection = db.collection('invoiceptps');
            
            const updateResult = await collection.updateOne(
              { _id: invoicePTP._id },
              { 
                $push: { 
                  qrCodeData: newQrCodeEntry
                }
              }
            );

            if (updateResult.modifiedCount > 0) {
              const updatedDoc = await collection.findOne({ _id: invoicePTP._id });
              const latestEntry = updatedDoc.qrCodeData[updatedDoc.qrCodeData.length - 1];
              
              updated = true;
              console.log(`isExcel value in InvoicePTP DB:`, latestEntry.isExcel, `Type:`, typeof latestEntry.isExcel);
              
              results.success.push({
                row: i + 1,
                docNo: docNo,
                collection: "InvoicePTP",
                invoiceId: invoicePTP._id.toString(),
                isExcel: latestEntry.isExcel,
                message: "IRN data added successfully",
              });
            }
          }
        }

        // If not found in either collection
        if (!updated) {
          console.log(`Document ${docNo} not found in any collection`);
          results.failed.push({
            row: i + 1,
            docNo: docNo,
            error: "Document number not found in Invoice or InvoicePTP collections. Please ensure the invoice exists in the database before uploading IRN data.",
            data: row,
          });
        }
      } catch (error) {
        console.error(`Error processing row ${i + 1}:`, error);
        results.failed.push({
          row: i + 1,
          error: error.message,
          data: row,
        });
      }
    }

    return NextResponse.json(
      {
        message: "Upload completed",
        results: results,
        totalProcessed: jsonData.length,
        successCount: results.success.length,
        failedCount: results.failed.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error uploading IRN data:", error);
    return NextResponse.json(
      { error: "Failed to upload IRN data", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handle GET: Preview Excel data without saving
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const fileData = searchParams.get("preview");

    if (!fileData) {
      return NextResponse.json(
        { error: "No file data provided for preview" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: "Preview endpoint - use POST with FormData" },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to preview data", details: error.message },
      { status: 500 }
    );
  }
}