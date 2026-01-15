import { NextResponse } from "next/server";
import User from "@/app/model/portal/User";
import connectDB from "@/app/lib/db";

// PUT: Update user onboarding progress or profile fields
export async function PUT(req) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "User ID is required!" },
                { status: 400 }
            );
        }

        const updatedData = await req.json();

        // ✅ Merge onboarding progress updates
        if (updatedData.onboardingProgress) {
            const user = await User.findById(id);
            user.onboardingProgress = {
                ...user.onboardingProgress.toObject(),
                ...updatedData.onboardingProgress,
            };
            await user.save();

            return NextResponse.json(
                { message: "Onboarding progress updated", user },
                { status: 200 }
            );
        }

        // For normal updates
        const updatedUser = await User.findByIdAndUpdate(
            id,
            { $set: updatedData },
            { new: true, lean: true }
        );

        if (!updatedUser)
            return NextResponse.json({ error: "User not found" }, { status: 404 });

        return NextResponse.json(
            { message: "User updated successfully", user: updatedUser },
            { status: 200 }
        );
    } catch (error) {
        console.error("Update error:", error);
        return NextResponse.json(
            { error: "Failed to update user", details: error.message },
            { status: 500 }
        );
    }
}
