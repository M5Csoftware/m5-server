import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import User from "@/app/model/portal/User";
import nodemailer from "nodemailer";
import otpStore from "@/app/lib/portalOtpStore";

await connectDB();

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Email transporter with your Gmail credentials
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "harmanjeet.singh@iic.ac.in",
    pass: "twmy flrf saih grnq"
  }
});

/**
 * POST /api/portal/recover-password/forgot-password
 * Send OTP to user's email
 */
export async function POST(request) {
  try {
    await connectDB();

    const { emailId } = await request.json();

    console.log("🔐 Forgot password request for:", emailId);

    if (!emailId) {
      return NextResponse.json(
        { success: false, message: "Email is required" },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await User.findOne({ emailId: emailId.toLowerCase() });
    
    if (!user) {
      console.log("❌ User not found:", emailId);
      return NextResponse.json(
        { success: false, message: "No account found with this email" },
        { status: 404 }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

    // Delete any existing OTP for this email
    otpStore.delete(emailId);
    
    // Store new OTP
    otpStore.set(emailId, {
      otp,
      expiresAt,
      attempts: 0,
      verified: false,
      userId: user._id.toString()
    });

    console.log(`✅ OTP generated and stored for ${emailId}`);

    // Send email with OTP
    const mailOptions = {
      from: "harmanjeet.singh@iic.ac.in",
      to: emailId,
      subject: "Password Reset OTP - M5C Logistics",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background-color: #EA1B40; padding: 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">M5C Logistics</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333333; margin-top: 0;">Password Reset Request</h2>
              <p style="color: #666666; font-size: 16px; line-height: 1.5;">
                Hello <strong style="color: #333333;">${user.fullName || user.companyName || 'User'}</strong>,
              </p>
              <p style="color: #666666; font-size: 16px; line-height: 1.5;">
                We received a request to reset your password. Use the following OTP to proceed:
              </p>
              <div style="background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%); padding: 30px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <div style="font-size: 48px; letter-spacing: 12px; font-weight: 800; color: #EA1B40; font-family: monospace;">
                  ${otp}
                </div>
              </div>
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  ⏰ This OTP will expire in <strong>10 minutes</strong>
                </p>
                <p style="color: #856404; margin: 5px 0 0 0; font-size: 14px;">
                  🔒 Never share this OTP with anyone
                </p>
              </div>
              <p style="color: #666666; font-size: 14px; line-height: 1.5;">
                If you didn't request this password reset, please ignore this email.
              </p>
            </div>
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
              <p style="color: #6c757d; margin: 0; font-size: 12px;">
                © ${new Date().getFullYear()} M5C Logistics. All rights reserved.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("📧 OTP email sent successfully to:", emailId);

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully to your email",
    });

  } catch (error) {
    console.error("❌ Forgot password error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error sending OTP. Please try again.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}