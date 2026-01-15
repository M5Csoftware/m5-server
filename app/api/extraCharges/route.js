import connectDB from "@/app/lib/db";
import ExtraCharges from "@/app/model/extraCharges";

// ✅ GET — fetch single AWB or list of all
export async function GET(req) {
    await connectDB();

    try {
        const { searchParams } = new URL(req.url);
        const awbNo = searchParams.get("awbNo");

        if (awbNo) {
            const record = await ExtraCharges.findOne({ awbNo });
            if (!record) {
                return new Response(JSON.stringify({ message: "AWB not found" }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(JSON.stringify(record), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Fetch all extra charge records (limit 50 by default)
        const allRecords = await ExtraCharges.find().limit(50).sort({ createdAt: -1 });
        return new Response(JSON.stringify(allRecords), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("Error fetching extra charges:", err);
        return new Response(
            JSON.stringify({ error: "Failed to fetch extra charges" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

// ✅ POST — create a new record
export async function POST(req) {
    await connectDB();

    try {
        const data = await req.json();

        if (!data.awbNo || !data.accountCode) {
            return new Response(
                JSON.stringify({ error: "AWB No and Account Code are required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Prevent duplicate AWB
        const existing = await ExtraCharges.findOne({ awbNo: data.awbNo });
        if (existing) {
            return new Response(
                JSON.stringify({ error: "AWB already exists" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const newExtraCharge = new ExtraCharges(data);
        const saved = await newExtraCharge.save();

        return new Response(JSON.stringify(saved), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("Error saving extra charge:", err);
        return new Response(
            JSON.stringify({ error: "Failed to save extra charge" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

// ✅ PUT — update record by AWB
export async function PUT(req) {
    await connectDB();

    try {
        const data = await req.json();
        const { awbNo } = data;

        if (!awbNo) {
            return new Response(
                JSON.stringify({ error: "AWB No is required for update" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const updatedRecord = await ExtraCharges.findOneAndUpdate(
            { awbNo },
            { $set: data },
            { new: true }
        );

        if (!updatedRecord) {
            return new Response(JSON.stringify({ error: "AWB not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify(updatedRecord), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("Error updating extra charge:", err);
        return new Response(
            JSON.stringify({ error: "Failed to update extra charge" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

// ✅ DELETE — remove record by AWB
export async function DELETE(req) {
    await connectDB();

    try {
        const { searchParams } = new URL(req.url);
        const awbNo = searchParams.get("awbNo");

        if (!awbNo) {
            return new Response(
                JSON.stringify({ error: "AWB No is required for delete" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const deleted = await ExtraCharges.findOneAndDelete({ awbNo });

        if (!deleted) {
            return new Response(JSON.stringify({ error: "AWB not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(
            JSON.stringify({ message: `AWB ${awbNo} deleted successfully` }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("Error deleting extra charge:", err);
        return new Response(
            JSON.stringify({ error: "Failed to delete extra charge" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
