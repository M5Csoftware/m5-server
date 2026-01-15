import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CANWeightValue from "@/app/model/CANWeightValue";
import * as XLSX from "xlsx";

export async function GET(request) {
  try {
    // Connect to database
    await connectDB();

    // Get all weight values from database
    const weightValues = await CANWeightValue.find({})
      .sort({ weight: 1 })
      .lean();

    if (weightValues.length === 0) {
      return NextResponse.json(
        { success: false, message: "No weight values found in database" },
        { status: 404 }
      );
    }

    // Prepare data for Excel
    const data = weightValues.map(item => ({
      WEIGHT: item.weight,
      "VALUE PER KG": item.valuePerKg,
      "UPLOADED DATE": item.uploadedAt 
        ? new Date(item.uploadedAt).toLocaleDateString() 
        : "N/A",
    }));

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Set column widths
    const colWidths = [
      { wch: 10 },  // WEIGHT
      { wch: 15 },  // VALUE PER KG
      { wch: 15 },  // UPLOADED DATE
    ];
    worksheet["!cols"] = colWidths;

    // Add header styling
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!worksheet[cellAddress]) continue;
      
      worksheet[cellAddress].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4F81BD" } },
        alignment: { horizontal: "center" },
      };
    }

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Weight Values");

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Create headers for file download
    const headers = new Headers();
    headers.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    headers.set("Content-Disposition", `attachment; filename="CAN_Weight_Values_${Date.now()}.xlsx"`);
    headers.set("Content-Length", buffer.length);

    return new NextResponse(buffer, {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error("Error downloading data:", error);
    return NextResponse.json(
      { success: false, message: "Error downloading data" },
      { status: 500 }
    );
  }
}