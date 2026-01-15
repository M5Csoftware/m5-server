import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import AccountLedger from "@/app/model/AccountLedger";
import CustomerAccount from "@/app/model/CustomerAccount";
import ExcelJS from "exceljs";
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dhlrogvj1",
  api_key: process.env.CLOUDINARY_API_KEY || "642583471231691",
  api_secret: process.env.CLOUDINARY_API_SECRET || "mEhp5rJDSOkffyh2gTYVxkwlYUU"
});

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { accountCodes, withHoldAWB } = body;

    console.log("========== EXCEL GENERATION STARTED ==========");
    console.log(`Total account codes received: ${accountCodes?.length || 0}`);
    console.log(`Account codes:`, accountCodes);
    console.log(`With Hold AWB: ${withHoldAWB}`);

    if (!accountCodes || accountCodes.length === 0) {
      return NextResponse.json(
        { success: false, message: "No account codes provided" },
        { status: 400 }
      );
    }

    const generatedFiles = [];
    const skippedAccounts = [];

    // Process each account code
    for (const accountCode of accountCodes) {
      console.log(`\n📊 Processing account code: ${accountCode}`);
      
      try {
        // Fetch customer account to get opening balance
        const customerAccount = await CustomerAccount.findOne({ accountCode }).select("openingBalance");
        
        if (!customerAccount) {
          console.log(`⚠️ Customer account not found for: ${accountCode}`);
          skippedAccounts.push({
            accountCode,
            reason: "Customer account not found"
          });
          continue;
        }

        const openingBalance = parseFloat(customerAccount.openingBalance || 0);
        console.log(`   Opening Balance: ${openingBalance}`);

        // Fetch ledger entries for this account code
        let query = { accountCode };
        
        // Add hold filter if required
        if (withHoldAWB) {
          query.isHold = true;
        }
        
        const entries = await AccountLedger.find(query).sort({ date: 1 });
        console.log(`   Ledger entries found: ${entries.length}`);

        // If no entries found, skip this account
        if (entries.length === 0) {
          console.log(`⚠️ No ledger entries found for: ${accountCode}`);
          skippedAccounts.push({
            accountCode,
            reason: "No ledger entries found"
          });
          continue;
        }

        // Create a workbook for this account code
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(accountCode);

        // Define columns
        worksheet.columns = [
          { header: 'Sr No', key: 'SrNo', width: 8 },
          { header: 'AWB No', key: 'AwbNo', width: 15 },
          { header: 'Sale Type', key: 'SaleType', width: 10 },
          { header: 'Date', key: 'Date', width: 12 },
          { header: 'Account Code', key: 'code', width: 15 },
          { header: 'Consignee', key: 'Consignee', width: 25 },
          { header: 'Forwarder', key: 'Forwarder', width: 15 },
          { header: 'Forwarder No', key: 'ForwarderNo', width: 15 },
          { header: 'Run No', key: 'RunNo', width: 10 },
          { header: 'Sector', key: 'Sector', width: 10 },
          { header: 'Destination', key: 'Destination', width: 15 },
          { header: 'City', key: 'City', width: 15 },
          { header: 'Zip Code', key: 'ZipCode', width: 10 },
          { header: 'Service', key: 'Service', width: 12 },
          { header: 'Pcs', key: 'Pcs', width: 8 },
          { header: 'Actual Weight', key: 'ActualWeight', width: 12 },
          { header: 'Vol Weight', key: 'VolWeight', width: 12 },
          { header: 'Chg Weight', key: 'ChgWeight', width: 12 },
          { header: 'Sale Amount', key: 'SaleAmount', width: 12 },
          { header: 'Discount Per Kg', key: 'DiscountPerKg', width: 14 },
          { header: 'Discount Amount', key: 'DiscountAmount', width: 14 },
          { header: 'Discount Total', key: 'DiscountTotal', width: 14 },
          { header: 'Rate Hike', key: 'RateHike', width: 12 },
          { header: 'SGST', key: 'SGST', width: 10 },
          { header: 'CGST', key: 'CGST', width: 10 },
          { header: 'IGST', key: 'IGST', width: 10 },
          { header: 'Misc Charge', key: 'Mischg', width: 12 },
          { header: 'Fuel', key: 'Fuel', width: 10 },
          { header: 'Non Taxable', key: 'NonTaxable', width: 12 },
          { header: 'Grand Total', key: 'GrandTotal', width: 12 },
          { header: 'Rcv Amount', key: 'RcvAmount', width: 12 },
          { header: 'Debit Amount', key: 'DebitAmount', width: 12 },
          { header: 'Credit Amount', key: 'CreditAmount', width: 12 },
          { header: 'Balance', key: 'Balance', width: 12 },
          { header: 'Remark', key: 'Remark', width: 25 },
          { header: 'Reference No', key: 'ReferenceNo', width: 15 },
          { header: 'Is Hold', key: 'isHold', width: 10 },
          { header: 'Remaining Balance', key: 'RemainingBalance', width: 18 },
        ];

        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };

        // Calculate running balance and add data rows
        let runningBalance = openingBalance;

        entries.forEach((e, idx) => {
          const RcvAmount = e.debitAmount > 0 || e.creditAmount > 0 ? 0 : e.receivedAmount;
          const SaleType = e.payment === "" ? "Sale" : "RCPT";
          
          const grandTotal = parseFloat(e.totalAmt) || 0;
          const received = parseFloat(RcvAmount) || 0;
          const credit = parseFloat(e.creditAmount) || 0;
          const debit = parseFloat(e.debitAmount) || 0;

          // Calculate running balance
          runningBalance += grandTotal + debit;
          runningBalance -= received + credit;
          
          worksheet.addRow({
            SrNo: idx + 1,
            AwbNo: e.awbNo,
            SaleType,
            Date: e.date ? new Date(e.date).toLocaleDateString() : '',
            code: e.accountCode,
            Consignee: e.receiverFullName || e.customer,
            Forwarder: e.forwarder,
            ForwarderNo: e.forwardingNo,
            RunNo: e.runNo,
            Sector: e.sector,
            Destination: e.destination,
            City: e.receiverCity,
            ZipCode: e.receiverPincode,
            Service: e.service,
            Pcs: e.pcs,
            ActualWeight: e.totalActualWt,
            VolWeight: e.totalVolWt,
            ChgWeight: Math.max(e.totalActualWt || 0, e.totalVolWt || 0),
            SaleAmount: e.basicAmt,
            DiscountPerKg: e.discount,
            DiscountAmount: e.discountAmount,
            DiscountTotal: e.discountAmount,
            RateHike: e.hikeAmt,
            SGST: e.sgst,
            CGST: e.cgst,
            IGST: e.igst,
            Mischg: e.miscChg,
            Fuel: e.fuelAmt,
            NonTaxable: e.nonTaxable,
            GrandTotal: e.totalAmt,
            RcvAmount,
            DebitAmount: e.debitAmount,
            CreditAmount: e.creditAmount,
            Balance: e.totalAmt,
            Remark: e.operationRemark,
            ReferenceNo: e.reference,
            isHold: e.isHold ? 'Yes' : 'No',
            RemainingBalance: runningBalance.toFixed(2),
          });
        });

        // Add totals row
        const lastRow = worksheet.lastRow.number + 1;
        const totalsRow = worksheet.getRow(lastRow);
        totalsRow.font = { bold: true };
        totalsRow.getCell(1).value = 'Final Balance:';
        totalsRow.getCell(38).value = runningBalance.toFixed(2);

        // Generate Excel file buffer
        const buffer = await workbook.xlsx.writeBuffer();
        console.log(`   Excel buffer generated, size: ${buffer.length} bytes`);

        // Upload to Cloudinary
        const fileName = `Account_Ledger_${accountCode}_${Date.now()}.xlsx`;
        
        try {
          const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'account_ledgers',
                resource_type: 'raw',
                public_id: fileName.replace('.xlsx', ''),
                format: 'xlsx'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(buffer);
          });

          console.log(`✅ File uploaded to Cloudinary: ${fileName}`);
          console.log(`   Cloudinary URL: ${uploadResult.secure_url}`);
          
          generatedFiles.push({
            accountCode,
            fileName,
            cloudinaryUrl: uploadResult.secure_url,
            publicId: uploadResult.public_id
          });

        } catch (uploadError) {
          console.error(`❌ Error uploading to Cloudinary for ${accountCode}:`, uploadError);
          skippedAccounts.push({
            accountCode,
            reason: `Cloudinary upload failed: ${uploadError.message}`
          });
        }

      } catch (error) {
        console.error(`❌ Error processing account ${accountCode}:`, error);
        skippedAccounts.push({
          accountCode,
          reason: error.message
        });
      }
    }

    console.log("\n========== EXCEL GENERATION COMPLETED ==========");
    console.log(`✅ Successfully generated: ${generatedFiles.length}`);
    console.log(`⚠️ Skipped: ${skippedAccounts.length}`);
    
    if (skippedAccounts.length > 0) {
      console.log("Skipped accounts:");
      skippedAccounts.forEach(acc => {
        console.log(`   - ${acc.accountCode}: ${acc.reason}`);
      });
    }

    // If no files were generated, return error
    if (generatedFiles.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          message: "No data found in database for the selected account code(s)",
          skippedAccounts 
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Excel file(s) generated successfully`,
      files: generatedFiles,
      skippedAccounts: skippedAccounts.length > 0 ? skippedAccounts : undefined
    });

  } catch (error) {
    console.error("❌ Error generating Excel:", error);
    return NextResponse.json(
      { success: false, message: "Failed to generate Excel", error: error.message },
      { status: 500 }
    );
  }
}