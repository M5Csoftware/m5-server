import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import jwt from "jsonwebtoken";

async function getUserFromToken(req) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return { userId: "Unknown" };

    const token = authHeader.split(" ")[1];
    if (!token) return { userId: "Unknown" };

    if (!token.startsWith("ey")) {
      // not a JWT — fallback
      return { userId: token };
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { userId: decoded.userId };
  } catch {
    return { userId: "Unknown" };
  }
}

await connectDB();

export async function POST(req) {
  try {
    const data = await req.json();

    // Find the last employee by userId descending
    const lastEmployee = await Employee.findOne({ userId: { $ne: null } }).sort(
      { createdAt: -1 }
    );
    // console.log("lastEmployee id", lastEmployee)

    let userId = "11484000"; // Default starting userId

    if (lastEmployee && lastEmployee.userId) {
      const prevId = parseInt(lastEmployee.userId, 10);
      userId = (prevId + 1).toString().padStart(8, "0");
    }

    if (!/^\d{8}$/.test(userId)) {
      throw new Error("Generated userId is not valid (must be 8 digits)");
    }

    // Safely assign userId
    const { userId: createdBy } = await getUserFromToken(req);

    // const newEmployee = new Employee({ ...data, userId });
    // const newEmployee = new Employee({
    //   ...data,
    //   permissions: data.permissions || {}, // keep as plain object
    //   userId,
    //   createdBy,
    // });
    const newEmployee = new Employee({
      ...data,
      permissions: data.permissions || {},
      dashboardAccess: Array.isArray(data.dashboardAccess)
        ? data.dashboardAccess
        : [],
      userId,
      createdBy,
    });

    console.log("newEmployee", newEmployee);

    await newEmployee.save();

    return new Response(
      JSON.stringify({ message: "Employee created", newEmployee }),
      {
        status: 201,
      }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ message: "Server error", error: err.message }),
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    const data = await req.json();

    const updatedBy = await getUserFromToken(req);
    // const updated = await Employee.findOneAndUpdate(
    //   { userId: data.userId },
    //   { ...data, updatedBy },
    //   { new: true }
    // );
    const { userId, ...updateFields } = data;

    const updated = await Employee.findOneAndUpdate(
      { userId },
      {
        $set: {
          ...updateFields,
          permissions: updateFields.permissions || {},
          dashboardAccess: Array.isArray(updateFields.dashboardAccess)
            ? updateFields.dashboardAccess
            : [],
          updatedBy: updatedBy.userId,
        },
      },
      { new: true }
    );

    if (!updated) {
      return new Response(JSON.stringify({ message: "User not found" }), {
        status: 404,
      });
    }

    return new Response(
      JSON.stringify({ message: "Employee updated", updated }),
      {
        status: 200,
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ message: "Server error", error: err.message }),
      {
        status: 500,
      }
    );
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (userId) {
      // Return a specific employee
      const employee = await Employee.findOne({ userId });

      if (!employee) {
        return new Response(JSON.stringify({ message: "Employee not found" }), {
          status: 404,
        });
      }

      return new Response(JSON.stringify(employee), {
        status: 200,
      });
    } else {
      // Return all employees
      const allEmployees = await Employee.find();

      return new Response(JSON.stringify(allEmployees), {
        status: 200,
      });
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ message: "Server error", error: err.message }),
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return new Response(
        JSON.stringify({ message: "userId is required to delete an employee" }),
        { status: 400 }
      );
    }

    const deletedEmployee = await Employee.findOneAndDelete({ userId });

    if (!deletedEmployee) {
      return new Response(JSON.stringify({ message: "Employee not found" }), {
        status: 404,
      });
    }

    return new Response(
      JSON.stringify({
        message: "Employee deleted successfully",
        deletedEmployee,
      }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ message: "Server error", error: err.message }),
      { status: 500 }
    );
  }
}
