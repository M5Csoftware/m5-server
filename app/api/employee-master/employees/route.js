// import { NextResponse } from "next/server";
// import connectDB from "@/app/lib/db";
// import Employee from "@/app/model/Employee";

// // Ensure DB is connected
// connectDB();

// export async function GET(req) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const department = searchParams.get("department");

//     const query = {};

//     // Filter by department if the param exists
//     if (department) {
//       query.department = department;
//     }

//     const employees = await Employee.find(query);

//     return NextResponse.json(employees, { status: 200 });
//   } catch (error) {
//     console.error("Error in fetching Employees:", error.message, error.stack);
//     return NextResponse.json(
//       { error: "Failed to fetch Employees", details: error.message },
//       { status: 400 }
//     );
//   }
// }

import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";

// Ensure DB is connected
await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const department = searchParams.get("department");

    const query = {
      deactivated: false // Only fetch active employees
    };

    // Filter by department if the param exists
    if (department) {
      query.department = department; // Exact match (case-sensitive)
    }

    // Only return userId and userName fields, exclude _id
    const employees = await Employee.find(query, { 
      userId: 1, 
      userName: 1, 
      _id: 0 
    }).sort({ userName: 1 }); // Sort alphabetically by userName

    return NextResponse.json({
      success: true,
      data: employees,
      count: employees.length
    }, { status: 200 });
  } catch (error) {
    console.error("Error in fetching Employees:", error.message, error.stack);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to fetch Employees", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}