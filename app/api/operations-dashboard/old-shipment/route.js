import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import HoldLog from "@/app/model/HoldLog";
import ExcelJS from 'exceljs';

export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const origin = searchParams.get("origin");
    const download = searchParams.get("download");
    
    // Calculate date threshold (4 days ago from selected date)
    const selectedDate = new Date(date);
    const fourDaysAgo = new Date(selectedDate);
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    
    const startOfThreshold = new Date(fourDaysAgo);
    startOfThreshold.setHours(0, 0, 0, 0);

    // Build filter for old shipments
    const shipmentFilter = {
      date: {
        $lt: startOfThreshold
      },
      isHold: false
    };

    // Add origin filter if provided
    if (origin && origin !== "All") {
      shipmentFilter.origin = origin;
    }

    // Get old shipments
    const oldShipments = await Shipment.find(shipmentFilter)
      .sort({ date: -1 })
      .limit(50);

    // Get AWB numbers to fetch hold logs
    const awbNumbers = oldShipments.map(shipment => shipment.awbNo);

    // Get latest hold log for each AWB where action is "unhold"
    const holdLogs = await HoldLog.aggregate([
      {
        $match: {
          awbNo: { $in: awbNumbers },
          action: "unhold" // Only get unhold actions
        }
      },
      {
        $sort: { actionLogDate: -1 }
      },
      {
        $group: {
          _id: "$awbNo",
          latestHoldLog: { $first: "$$ROOT" }
        }
      }
    ]);

    // Create a map for quick lookup
    const holdLogMap = {};
    holdLogs.forEach(log => {
      holdLogMap[log._id] = log.latestHoldLog;
    });

    // Combine data
    const result = oldShipments.map(shipment => {
      const holdLog = holdLogMap[shipment.awbNo];
      
      return {
        bookingDate: shipment.date ? new Date(shipment.date).toLocaleDateString('en-GB') : "N/A",
        awbNo: shipment.awbNo || "N/A",
        weight: shipment.totalActualWt || 0,
        accountCode: shipment.accountCode || "N/A",
        unholdDate: holdLog && holdLog.actionLogDate 
          ? new Date(holdLog.actionLogDate).toLocaleDateString('en-GB') 
          : "N/A"
      };
    });

    // If download parameter is present, return Excel file
    if (download === "true") {
      return generateExcelFile(result, date, origin);
    }

    // Return JSON response for normal API call
    return NextResponse.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("Error fetching old shipment data:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch old shipment data: " + error.message },
      { status: 500 }
    );
  }
}

// Function to generate Excel file
async function generateExcelFile(data, date, origin) {
  try {
    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Old Shipments');

    // Add headers
    worksheet.columns = [
      { header: 'Booking Date', key: 'bookingDate', width: 15 },
      { header: 'AWB No', key: 'awbNo', width: 20 },
      { header: 'Weight', key: 'weight', width: 15 },
      { header: 'Account Code', key: 'accountCode', width: 15 },
      { header: 'Unhold Date', key: 'unholdDate', width: 15 }
    ];

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    // Add data rows
    data.forEach(item => {
      worksheet.addRow({
        bookingDate: item.bookingDate,
        awbNo: item.awbNo,
        weight: item.weight,
        accountCode: item.accountCode,
        unholdDate: item.unholdDate
      });
    });

    // Add summary row
    const totalWeight = data.reduce((sum, item) => sum + (item.weight || 0), 0);
    worksheet.addRow([]); // Empty row
    worksheet.addRow(['Total Shipments:', data.length, '', '', '']);
    worksheet.addRow(['Total Weight:', totalWeight, '', '', '']);

    // Style summary rows
    const summaryRow1 = worksheet.getRow(worksheet.rowCount - 2);
    const summaryRow2 = worksheet.getRow(worksheet.rowCount - 1);
    summaryRow1.font = { bold: true };
    summaryRow2.font = { bold: true };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Create filename
    const filename = `old-shipments-${date}-${origin || 'all'}.xlsx`;

    // Return Excel file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (error) {
    console.error("Error generating Excel file:", error);
    return NextResponse.json(
      { success: false, message: "Failed to generate Excel file: " + error.message },
      { status: 500 }
    );
  }
}