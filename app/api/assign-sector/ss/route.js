import connectDB from "@/app/lib/db";
import AssignedSector from "@/app/model/AssignedSector";
import Employee from "@/app/model/Employee";

export async function GET(req) {
  await connectDB();

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const month = searchParams.get("month");

    if (userId) {
      // Fetch single employee from Employee collection ONLY
      const employee = await Employee.findOne({ userId }).select(
        "userId userName department _id"
      );

      if (!employee) {
        return new Response(JSON.stringify({ message: "User not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Fetch assigned sectors for this employee & month
      let assignedData = null;
      if (month) {
        assignedData = await AssignedSector.findOne({
          employeeId: employee._id,
          month,
        }).select("sectors remarks month department");
      }

      return new Response(
        JSON.stringify({
          ...employee.toObject(),
          assignedSectors: assignedData?.sectors || [],
          remarks: assignedData?.remarks || "",
          month: assignedData?.month || month || null,
          department: employee.department, // ✅ always from Employee collection
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch all Sale Support employees
    const employees = await Employee.find({ department: "Sale Support" })
      .select("userId userName department _id")
      .sort({ userName: 1 });

    const employeesWithSectors = await Promise.all(
      employees.map(async (emp) => {
        let assignedData = [];
        if (month) {
          const assignment = await AssignedSector.findOne({
            employeeId: emp._id,
            month,
          }).select("sectors");
          assignedData = assignment?.sectors || [];
        }
        return {
          ...emp.toObject(),
          assignedSectors: assignedData,
        };
      })
    );

    return new Response(JSON.stringify(employeesWithSectors), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching Sale Support Executives:", error);
    return new Response(
      JSON.stringify({ message: "Failed to fetch employees" }),
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  await connectDB();

  try {
    const data = await req.json();
    const { userId, userName, month, sectors, remarks } = data;

    if (!userId || !userName || !month || !sectors || sectors.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate department from Employee collection ONLY
    const employee = await Employee.findOne({ userId });
    if (!employee || employee.department !== "Sale Support") {
      return new Response(
        JSON.stringify({ error: "Only Sale Support Executives can be assigned sectors" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Save/Update AssignedSector, always save department as "Sale Support"
    const assignment = await AssignedSector.findOneAndUpdate(
      { employeeId: employee._id, month },
      {
        $set: {
          userName,
          remarks,
          sectors,
          department: "Sale Support", // ✅ always save
        },
      },
      { upsert: true, new: true }
    );

    return new Response(JSON.stringify(assignment), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error saving sector assignment:", err);
    return new Response(
      JSON.stringify({ error: "Failed to save sector assignment" }),
      { status: 500 }
    );
  }
}
