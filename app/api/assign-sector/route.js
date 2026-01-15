import connectDB from "@/app/lib/db";
import AssignedSector from "@/app/model/AssignedSector";
import Employee from "@/app/model/Employee";

export async function GET(req) {
  await connectDB();

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const month = searchParams.get("month"); // optional, used for fetching assigned sectors

    if (userId) {
      // FETCH single employee
      const employee = await Employee.findOne({ userId }).select(
        "userId userName department _id"
      );

      if (!employee) {
        return new Response(JSON.stringify({ message: "User not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

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
          department: assignedData?.department || "Customer Support", // ✅ default
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // FETCH all CS Executives
    const employees = await Employee.find({ department: "Customer Support" })
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
    console.error("Error fetching CS Executives:", error);
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

    // Verify the employee exists and is a CS Executive
    const employee = await Employee.findOne({ userId });
    if (!employee || employee.department !== "Customer Support") {
      return new Response(
        JSON.stringify({ error: "Only CS Executives can be assigned sectors" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ Always save department as "Customer Support"
    const assignment = await AssignedSector.findOneAndUpdate(
      { employeeId: employee._id, month },
      {
        $set: {
          userName,
          remarks,
          sectors,
          department: "Customer Support",
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
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
