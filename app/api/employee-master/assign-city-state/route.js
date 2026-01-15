import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";

export async function PUT(req) {
    try {
        await connectDB();

        const body = await req.json();
        const { userId, state, city } = body;

        console.log("Received data:", { userId, state, city });

        if (!userId || !city) {
            return NextResponse.json(
                { error: "userId and city are required." },
                { status: 400 }
            );
        }

        // Build dynamic update object
        const update = {
            $addToSet: { cityAssigned: city },
        };

        if (state) {
            update.$set = { stateAssigned: state };
        }

        const updatedEmployee = await Employee.findOneAndUpdate(
            { userId },
            update,
            { new: true }
        );

        if (!updatedEmployee) {
            return NextResponse.json({ error: "Employee not found." }, { status: 404 });
        }

        console.log("Updated Employee:", updatedEmployee);

        return NextResponse.json(updatedEmployee, { status: 200 });
    } catch (error) {
        console.error("Error updating employee:", error.message, error.stack);
        return NextResponse.json(
            { error: "Failed to update employee", details: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(req) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get("userId");
        const city = searchParams.get("city");

        if (!userId || !city) {
            return new Response(
                JSON.stringify({ message: "Both userId and city are required" }),
                { status: 400 }
            );
        }

        const updatedEmployee = await Employee.findOneAndUpdate(
            { userId },
            { $pull: { cityAssigned: city } },
            { new: true }
        );

        if (!updatedEmployee) {
            return new Response(
                JSON.stringify({ message: "Employee not found" }),
                { status: 404 }
            );
        }

        return new Response(
            JSON.stringify({
                message: `City '${city}' removed successfully`,
                updated: updatedEmployee,
            }),
            { status: 200 }
        );
    } catch (err) {
        console.error("Delete error:", err.message);
        return new Response(
            JSON.stringify({ message: "Server error", error: err.message }),
            { status: 500 }
        );
    }
}