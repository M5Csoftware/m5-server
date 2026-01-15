import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req) {
    try {
        await connectDB();

        const formData = await req.formData();
        const accountCode = formData.get("accountCode");
        const kycFront = formData.get("kycFront");
        const kycBack = formData.get("kycBack");

        if (!accountCode || !kycFront || !kycBack) {
            return NextResponse.json(
                { success: false, message: "accountCode, front and back images required" },
                { status: 400 }
            );
        }

        const customer = await CustomerAccount.findOne({ accountCode });
        if (!customer) {
            return NextResponse.json(
                { success: false, message: "Customer not found" },
                { status: 404 }
            );
        }

        // Helper: upload one image
        const uploadImage = (file, side) => {
            return new Promise(async (resolve, reject) => {
                const bytes = await file.arrayBuffer();
                const buffer = Buffer.from(bytes);

                cloudinary.uploader
                    .upload_stream(
                        {
                            folder: `kyc/${accountCode}`,
                            public_id: `${side}_${Date.now()}`,
                            resource_type: "image",
                        },
                        (err, result) => {
                            if (err) reject(err);
                            else resolve(result.secure_url);
                        }
                    )
                    .end(buffer);
            });
        };

        const frontUrl = await uploadImage(kycFront, "front");
        const backUrl = await uploadImage(kycBack, "back");

        // Save to DB
        customer.kycDetails = {
            kycFrontUrl: frontUrl,
            kycBackUrl: backUrl,
            uploadedAt: new Date(),
        };

        await customer.save();

        return NextResponse.json({
            success: true,
            data: {
                kycFrontUrl: frontUrl,
                kycBackUrl: backUrl,
            },
        });
    } catch (error) {
        console.error("KYC Upload Error:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
