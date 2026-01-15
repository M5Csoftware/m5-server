import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";
import Employee from "@/app/model/Employee";
import Ticket from "@/app/model/portal/Ticket";

export async function GET(req) {
  try {
    await connectDB();

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "registered"; // default

    const employees = await Employee.find({ department: "Customer Support" });

    // Choose collection based on type
    const Model = type === "portal" ? Ticket : Complaint;

    // Summary counts
    const field = type === "portal" ? "assignedTo" : "assignTo";

    const summary = await Promise.all(
      employees.map(async (emp) => {
        const count = await Model.countDocuments({
          [field]: new RegExp(emp.userName, "i"), // dynamic field
        });

        return {
          id: emp.userId,
          name: emp.userName,
          count,
        };
      })
    );

    // Dropdown data (id + name)
    const dropdown = employees.map((emp) => ({
      id: emp.userId,
      name: emp.userName,
    }));

    return new Response(JSON.stringify({ summary, dropdown }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
}
