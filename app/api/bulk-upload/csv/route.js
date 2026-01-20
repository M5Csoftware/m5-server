import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import AccountLedger from "@/app/model/AccountLedger";
import CustomerAccount from "@/app/model/CustomerAccount";
import * as XLSX from "xlsx";

// IMPORTANT: Add this to allow POST method
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Helper function to parse AWB number
function parseAwbNumber(awbNo) {
  if (!awbNo) return null;
  const match = awbNo.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    number: parseInt(match[2], 10),
    fullAwb: awbNo
  };
}

// Generate next AWB numbers
function generateNextAwb(prefix, lastNumber, count = 1) {
  const awbs = [];
  for (let i = 0; i < count; i++) {
    const nextNumber = lastNumber + i + 1;
    const awb = `${prefix}${nextNumber.toString().padStart(7, '0')}`;
    awbs.push({
      awbNo: awb,
      pattern: prefix,
      number: nextNumber
    });
  }
  return awbs;
}

// Get latest AWB for prefix
async function getLatestAwbForPrefix(prefix) {
  try {
    const latestShipment = await Shipment.findOne({
      awbNo: { $regex: `^${prefix}\\d+$` }
    })
    .sort({ awbNo: -1 })
    .select("awbNo")
    .lean();
    
    return latestShipment ? parseAwbNumber(latestShipment.awbNo) : null;
  } catch (error) {
    console.error("Error finding latest AWB:", error);
    return null;
  }
}

// Clean field values
const cleanFieldValue = (value, fieldName) => {
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  if (/_\d+$/.test(str) || str === fieldName || str === "") {
    return undefined;
  }
  return str;
};

// Parse Excel/CSV data
function parseFileData(fileData) {
  const rows = [];
  
  try {
    // Convert sheet to JSON
    const workbook = XLSX.read(fileData, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // Transform data to shipment format
    for (const row of jsonData) {
      const shipment = {
        accountCode: cleanFieldValue(row.AccountCode, "AccountCode") || "DEFAULT",
        sector: cleanFieldValue(row.Sector, "Sector") || "",
        origin: cleanFieldValue(row.Origin, "Origin"), // Keep origin from file, can be undefined
        destination: cleanFieldValue(row.Destination, "Destination") || "",
        goodstype: cleanFieldValue(row.GoodsType, "GoodsType") || "",
        service: cleanFieldValue(row.ServiceName, "ServiceName") || "",
        payment: "Credit",
        
        // Receiver info
        receiverFullName: cleanFieldValue(row.ConsigneeName, "ConsigneeName") || "",
        receiverPhoneNumber: cleanFieldValue(row.ConsigneeTelephone, "ConsigneeTelephone") || "",
        receiverEmail: cleanFieldValue(row.ConsigneeEmailId, "ConsigneeEmailId") || "",
        receiverCity: cleanFieldValue(row.ConsigneeCity, "ConsigneeCity") || "",
        receiverState: cleanFieldValue(row.ConsigneeState, "ConsigneeState") || "",
        receiverPincode: cleanFieldValue(row.ConsigneeZipcode, "ConsigneeZipcode") || "",
        
        // Shipper info
        shipperFullName: cleanFieldValue(row.ConsignorName, "ConsignorName") || "",
        shipperPhoneNumber: cleanFieldValue(row.ConsignorTelephone, "ConsignorTelephone") || "",
        shipperCity: cleanFieldValue(row.ConsignorCity, "ConsignorCity") || "",
        shipperState: cleanFieldValue(row.ConsignorState, "ConsignorState") || "",
        shipperPincode: cleanFieldValue(row.ConsignorPincode, "ConsignorPincode") || "",
        shipperKycType: cleanFieldValue(row.ConsignorKycType, "ConsignorKycType") || "",
        shipperKycNumber: cleanFieldValue(row.ConsignorKycNo, "ConsignorKycNo") || "",
        
        // Package details
        pcs: Number(row.PCS) || 1,
        totalActualWt: Number(row.ActualWeight) || 0,
        totalInvoiceValue: Number(row.InvoiceValue) || 0,
        currency: cleanFieldValue(row.InvoiceCurrency, "InvoiceCurrency") || "INR",
        
        // Reference
        reference: cleanFieldValue(row.ReferenceNo, "ReferenceNo") || "",
        operationRemark: cleanFieldValue(row.OperationRemark, "OperationRemark") || "",
        
        // Default values
        status: "Shipment Created!",
        date: new Date(),
        shipmentType: "Non-Document",
        createdAt: new Date(),
        updatedAt: new Date(),
        
        // Simple box structure
        boxes: [{
          length: "0",
          width: "0",
          height: "0",
          pcs: Number(row.PCS) || 1,
          actualWt: Number(row.ActualWeight) || 0,
          volumeWeight: 0,
          boxNo: 1
        }],
        
        shipmentAndPackageDetails: {
          1: [{
            context: cleanFieldValue(row.ShipmentContent, "ShipmentContent") || "",
            hsnNo: cleanFieldValue(row.HSNCode, "HSNCode") || "",
            qty: "1",
            rate: "0",
            amount: "0"
          }]
        }
      };
      
      rows.push(shipment);
    }
  } catch (error) {
    console.error("Error parsing file data:", error);
    throw new Error("Failed to parse file data. Please check the file format.");
  }
  
  return rows;
}

export async function POST(request) {
  try {
    console.log("POST request received at bulk-upload/csv");
    
    await connectDB();
    
    const formData = await request.formData();
    const file = formData.get("file");
    
    if (!file) {
      return NextResponse.json(
        { success: false, message: "No file uploaded" },
        { status: 400 }
      );
    }
    
    console.log("File received:", file.name, "Size:", file.size);
    
    // Read file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Parse file data
    const shipments = parseFileData(buffer);
    
    if (shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No valid data found in file" },
        { status: 400 }
      );
    }
    
    console.log(`Parsed ${shipments.length} shipments from file`);
    
    // Generate AWB numbers
    const awbPrefix = "MPL";
    const latestAwb = await getLatestAwbForPrefix(awbPrefix);
    let startingNumber = latestAwb ? latestAwb.number : 1000000;
    
    const generatedAwbs = generateNextAwb(awbPrefix, startingNumber, shipments.length);
    
    // Assign AWB numbers
    const shipmentsWithAwb = shipments.map((shipment, index) => ({
      ...shipment,
      awbNo: generatedAwbs[index].awbNo,
      flight: "", // Empty flight date as requested
      csb: false,
    }));
    
    // Check for duplicates
    const awbNumbers = shipmentsWithAwb.map(s => s.awbNo);
    const existingShipments = await Shipment.find({
      awbNo: { $in: awbNumbers }
    }).select("awbNo");
    
    const existingAwbSet = new Set(existingShipments.map(s => s.awbNo));
    const newShipments = shipmentsWithAwb.filter(
      shipment => !existingAwbSet.has(shipment.awbNo)
    );
    
    let newRecordsCount = 0;
    let duplicatesCount = shipments.length - newShipments.length;
    
    // Insert new shipments
    if (newShipments.length > 0) {
      const shipmentsToInsert = newShipments.map(shipment => {
        const cleanShipment = {
          awbNo: shipment.awbNo,
          accountCode: shipment.accountCode,
          sector: shipment.sector,
          destination: shipment.destination,
          reference: shipment.reference,
          goodstype: shipment.goodstype,
          payment: shipment.payment,
          boxes: shipment.boxes,
          shipmentAndPackageDetails: shipment.shipmentAndPackageDetails,
          status: shipment.status,
          date: shipment.date,
          flight: shipment.flight,
          csb: shipment.csb,
          pcs: shipment.pcs,
          totalActualWt: shipment.totalActualWt,
          totalInvoiceValue: shipment.totalInvoiceValue,
          currency: shipment.currency,
          receiverFullName: shipment.receiverFullName,
          receiverPhoneNumber: shipment.receiverPhoneNumber,
          receiverEmail: shipment.receiverEmail,
          receiverCity: shipment.receiverCity,
          receiverState: shipment.receiverState,
          receiverPincode: shipment.receiverPincode,
          shipperFullName: shipment.shipperFullName,
          shipperPhoneNumber: shipment.shipperPhoneNumber,
          shipperCity: shipment.shipperCity,
          shipperState: shipment.shipperState,
          shipperPincode: shipment.shipperPincode,
          shipperKycType: shipment.shipperKycType,
          shipperKycNumber: shipment.shipperKycNumber,
          shipmentType: shipment.shipmentType,
          operationRemark: shipment.operationRemark,
          service: shipment.service,
          createdAt: shipment.createdAt,
          updatedAt: shipment.updatedAt,
        };
        
        // Only add origin if it has a value
        if (shipment.origin !== undefined) {
          cleanShipment.origin = shipment.origin;
        }
        
        // Remove undefined values
        Object.keys(cleanShipment).forEach(key => {
          if (cleanShipment[key] === undefined) {
            delete cleanShipment[key];
          }
        });
        
        return cleanShipment;
      });
      
      try {
        const result = await Shipment.insertMany(shipmentsToInsert, { ordered: false });
        newRecordsCount = result.length;
        
        console.log(`Successfully inserted ${newRecordsCount} shipments`);
        
        // Update account ledgers
        for (const shipment of shipmentsToInsert) {
          const customer = await CustomerAccount.findOne({
            accountCode: shipment.accountCode?.toUpperCase(),
          });
          
          if (customer) {
            const oldBal = customer.leftOverBalance || 0;
            const newBal = oldBal + (shipment.totalInvoiceValue || 0);
            
            await AccountLedger.create({
              accountCode: shipment.accountCode,
              customer: customer.companyName || "",
              awbNo: shipment.awbNo,
              payment: shipment.payment,
              date: shipment.date,
              receiverFullName: shipment.receiverFullName,
              sector: shipment.sector,
              destination: shipment.destination,
              receiverCity: shipment.receiverCity,
              receiverPincode: shipment.receiverPincode,
              service: shipment.service,
              pcs: shipment.pcs,
              totalActualWt: shipment.totalActualWt,
              debitAmount: shipment.totalInvoiceValue || 0,
              leftOverBalance: newBal,
            });
            
            customer.leftOverBalance = newBal;
            await customer.save();
          }
        }
        
      } catch (insertError) {
        console.error("Insert error:", insertError);
        return NextResponse.json(
          {
            success: false,
            message: "Error inserting shipments into database",
            error: insertError.message,
          },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Upload completed successfully. ${newRecordsCount} new shipments added.`,
      details: {
        newRecords: newRecordsCount,
        duplicates: duplicatesCount,
        totalProcessed: shipments.length,
        awbRange: `${generatedAwbs[0]?.awbNo || ''} - ${generatedAwbs[generatedAwbs.length - 1]?.awbNo || ''}`
      }
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
  } catch (error) {
    console.error("Upload error:", error);
    
    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "Duplicate AWB numbers detected. Please try again.",
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Error uploading file",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// Explicitly handle other methods
export async function GET() {
  return NextResponse.json(
    { success: false, message: "Method GET not allowed. Use POST to upload files." },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { success: false, message: "Method PUT not allowed. Use POST to upload files." },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, message: "Method DELETE not allowed. Use POST to upload files." },
    { status: 405 }
  );
}