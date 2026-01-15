import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import nodemailer from "nodemailer";
import otpStore from "@/app/lib/otpStore";

// Configure nodemailer
const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "harmanjeet.singh@iic.ac.in",
        pass: "twmy flrf saih grnq"
      }
    });

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req) {
  try {
    await connectDB();

    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email is required" },
        { status: 400 }
      );
    }

    // Verify employee exists
    const employee = await Employee.findOne({ 
      email: email.toLowerCase() 
    });

    if (!employee) {
      console.log(`✗ Employee not found for email: ${email}`);
      return NextResponse.json(
        { success: false, message: "Email not found in our records" },
        { status: 404 }
      );
    }

    console.log(`✓ Employee found: ${employee.userName} (${employee.userId})`);

    // Generate OTP
    const otp = generateOTP();

    // Store OTP with expiry (10 minutes)
    otpStore.set(email.toLowerCase(), {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0,
      verified: false,
    });

    console.log(`📧 OTP generated for ${email.toLowerCase()}: ${otp} (expires in 10 minutes)`);

    // Send OTP email
    const mailOptions = {
      from: '"M5C Support" <' + process.env.EMAIL_USER + '>',
      to: email,
      subject: "Password Reset OTP - M5C Employee Portal",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #EA1B40; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .otp-box { background-color: white; border: 2px solid #EA1B40; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; color: #EA1B40; letter-spacing: 5px; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            .warning { color: #EA1B40; font-weight: bold; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>M5C Employee Portal</h1>
            </div>
            <div class="content">
              <h2>Password Reset Request</h2>
              <p>Hello ${employee.userName},</p>
              <p>You have requested to reset your password. Please use the following One-Time Password (OTP) to proceed:</p>
              
              <div class="otp-box">${otp}</div>
              
              <p><strong>This OTP is valid for 10 minutes only.</strong></p>
              
              <p class="warning">⚠️ If you did not request this password reset, please ignore this email and contact your administrator immediately.</p>
              
              <p>For security reasons, do not share this OTP with anyone.</p>
              
              <div class="footer">
                <p>This is an automated email. Please do not reply to this message.</p>
                <p>&copy; ${new Date().getFullYear()} M5C. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json(
      {
        success: true,
        message: "OTP sent successfully to your email",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Send OTP error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send OTP. Please try again." },
      { status: 500 }
    );
  }
}