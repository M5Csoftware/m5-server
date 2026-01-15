import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import MonthFile from "@/app/model/MonthFile";

// GET method - Fetch all month files
export async function GET(request) {
  try {
    await connectDB();

    try {
      const monthFiles = await MonthFile.find({})
        .sort({ createdAt: -1 })
        .lean();

      // Format dates for display
      const formattedData = monthFiles.map(file => ({
        ...file,
        _id: file._id.toString(),
        createdAt: new Date(file.createdAt).toLocaleDateString('en-IN'),
      }));

      return NextResponse.json({
        success: true,
        data: formattedData,
        totalRecords: formattedData.length
      });
    } catch (error) {
      console.error('Error fetching month files:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch month files',
          details: error.message
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Database connection failed",
        details: error.message
      },
      { status: 500 }
    );
  }
}

// POST method - Create new month file
export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { month, year, monthFile } = body;

    // Validation
    if (!month || !year || !monthFile) {
      return NextResponse.json(
        {
          success: false,
          error: 'Month, year, and month file are required'
        },
        { status: 400 }
      );
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json(
        {
          success: false,
          error: 'Month must be between 1 and 12'
        },
        { status: 400 }
      );
    }

    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2099) {
      return NextResponse.json(
        {
          success: false,
          error: 'Year must be between 2000 and 2099'
        },
        { status: 400 }
      );
    }

    try {
      // Check if month file already exists
      const existingFile = await MonthFile.findOne({ monthFile: monthFile.trim() });

      if (existingFile) {
        return NextResponse.json(
          {
            success: false,
            error: 'This month file already exists'
          },
          { status: 409 }
        );
      }

      // Create new month file
      const newMonthFile = await MonthFile.create({
        month: monthNum,
        year: yearNum,
        monthFile: monthFile.trim()
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            ...newMonthFile.toObject(),
            _id: newMonthFile._id.toString()
          },
          message: 'Month file created successfully'
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Error creating month file:', error);
      
      // Handle duplicate key error
      if (error.code === 11000) {
        return NextResponse.json(
          {
            success: false,
            error: 'This month file already exists'
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create month file',
          details: error.message
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Database connection failed",
        details: error.message
      },
      { status: 500 }
    );
  }
}