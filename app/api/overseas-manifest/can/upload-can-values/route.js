import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CANWeightValue from "@/app/model/CANWeightValue";
import * as XLSX from "xlsx";

export async function POST(request) {
  try {
    // Connect to database
    await connectDB();

    // Get the form data
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { success: false, message: "No file uploaded" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/)) {
      return NextResponse.json(
        { success: false, message: "Invalid file type. Please upload Excel or CSV file" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Read the Excel file
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    // Validate data structure
    if (!data.length) {
      return NextResponse.json(
        { success: false, message: "Excel file is empty" },
        { status: 400 }
      );
    }

    // Check if required columns exist
    const firstRow = data[0];
    const hasWeight = "WEIGHT" in firstRow || "weight" in firstRow || "Weight" in firstRow;
    const hasValue = "VALUE PER KG" in firstRow || "valuePerKg" in firstRow || "value" in firstRow || "Value" in firstRow;
    
    if (!hasWeight || !hasValue) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Excel file must contain "WEIGHT" and "VALUE PER KG" columns' 
        },
        { status: 400 }
      );
    }

    // Clear existing data
    await CANWeightValue.deleteMany({});

    // Process and save each row
    const weightValues = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const weight = row.WEIGHT || row.weight || row.Weight;
      const valuePerKg = row["VALUE PER KG"] || row.valuePerKg || row.value || row.Value;
      
      if (weight !== undefined && valuePerKg !== undefined) {
        const weightNum = Number(weight);
        const valueNum = Number(valuePerKg);
        
        if (isNaN(weightNum) || isNaN(valueNum)) {
          errors.push(`Row ${i + 2}: Invalid number format`);
          continue;
        }

        weightValues.push({
          weight: weightNum,
          valuePerKg: valueNum,
          uploadedAt: new Date(),
        });
      } else {
        errors.push(`Row ${i + 2}: Missing required columns`);
      }
    }

    // Bulk insert
    if (weightValues.length > 0) {
      await CANWeightValue.insertMany(weightValues);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded ${weightValues.length} weight-value pairs`,
      count: weightValues.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error("Error processing upload:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Error processing file: " + error.message 
      },
      { status: 500 }
    );
  }
}