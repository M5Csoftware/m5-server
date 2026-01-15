import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

// Create transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "harmanjeet.singh@iic.ac.in",
    pass: "twmy flrf saih grnq",
  },
});

export async function POST(request) {
  try {
    const { email, fullName, accountCode } = await request.json();

    // Validate required fields
    if (!email || !fullName || !accountCode) {
      return NextResponse.json(
        { 
          success: false, 
          message: "Missing required fields: email, fullName, or accountCode" 
        },
        { status: 400 }
      );
    }

    // Email template
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .header {
            background-color: #EA1B40;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: white;
            padding: 30px;
            border-radius: 0 0 5px 5px;
          }
          .account-code {
            background-color: #f0f0f0;
            padding: 15px;
            margin: 20px 0;
            border-left: 4px solid #EA1B40;
            font-size: 18px;
            font-weight: bold;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #EA1B40;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          a {
            color: #EA1B40;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Account Code Assigned</h1>
          </div>
          <div class="content">
            <p>Dear ${fullName},</p>
            
            <p>Good news! Your account has been approved. 🎉</p>
            
            <div class="account-code">
              Your Account Code: ${accountCode}
            </div>
            
            <p>You can now use this account code to access all our services. Please keep this code safe for future reference.</p>
            
            <p><strong>Next Steps:</strong></p>
            <ul>
              <li><a href="https://m5c-web.vercel.app/auth/login">Log in</a> using your credentials.</li>
              <li>Complete your profile (if not already done).</li>
              <li>Start Shipping! ✈️</li>
            </ul>
            
            <p>If you have any questions or need help, our support team is here for you.</p>
            
            <p>Welcome aboard!<br>
            M5C Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Plain text version
    const textContent = `
      Dear ${fullName},

      Good news! Your account has been approved. 🎉

      Your Account Code: ${accountCode}

      You can now use this account code to access all our services. Please keep this code safe for future reference.

      Next Steps:
      - Log in using your credentials at: https://m5c-web.vercel.app/auth/login
      - Complete your profile (if not already done)
      - Start Shipping! ✈️

      If you have any questions or need help, our support team is here for you.

      Welcome aboard!
      M5C Team
    `;

    // Send email
    const info = await transporter.sendMail({
      from: '"Account Management" <harmanjeet.singh@iic.ac.in>',
      to: email,
      subject: `Account Code Assigned - ${accountCode}`,
      text: textContent,
      html: htmlContent,
    });

    console.log("Email sent successfully:", info.messageId);

    return NextResponse.json(
      {
        success: true,
        message: "Email sent successfully",
        messageId: info.messageId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to send email",
        error: error.message,
      },
      { status: 500 }
    );
  }
}