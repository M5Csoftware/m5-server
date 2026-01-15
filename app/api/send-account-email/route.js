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

    // Email template with professional design
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
          }
          .email-wrapper {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
          }
          .header {
            background: linear-gradient(135deg, #EA1B40 0%, #c41536 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
          }
          .header h1 {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 10px;
          }
          .header p {
            font-size: 16px;
            opacity: 0.95;
          }
          .content {
            padding: 40px 30px;
            background-color: white;
          }
          .greeting {
            font-size: 18px;
            color: #333;
            margin-bottom: 20px;
            font-weight: 500;
          }
          .message {
            font-size: 15px;
            color: #555;
            line-height: 1.8;
            margin-bottom: 25px;
          }
          .account-code-box {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border-left: 5px solid #EA1B40;
            padding: 25px;
            margin: 30px 0;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          }
          .account-code-label {
            font-size: 13px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            font-weight: 600;
          }
          .account-code-value {
            font-size: 32px;
            color: #EA1B40;
            font-weight: 700;
            letter-spacing: 2px;
            font-family: 'Courier New', monospace;
          }
          .info-box {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px 20px;
            margin: 25px 0;
            border-radius: 4px;
            font-size: 14px;
            color: #856404;
          }
          .next-steps {
            background-color: #f8f9fa;
            padding: 25px;
            border-radius: 8px;
            margin: 25px 0;
          }
          .next-steps h3 {
            color: #EA1B40;
            font-size: 18px;
            margin-bottom: 15px;
            font-weight: 600;
          }
          .steps-list {
            list-style: none;
            padding: 0;
          }
          .steps-list li {
            padding: 12px 0;
            padding-left: 30px;
            position: relative;
            color: #555;
            font-size: 15px;
          }
          .steps-list li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #28a745;
            font-weight: bold;
            font-size: 18px;
          }
          .button {
            display: inline-block;
            padding: 14px 32px;
            background: linear-gradient(135deg, #EA1B40 0%, #c41536 100%);
            color: white !important;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: 600;
            font-size: 16px;
            box-shadow: 0 4px 12px rgba(234, 27, 64, 0.3);
            transition: all 0.3s ease;
          }
          .button:hover {
            box-shadow: 0 6px 16px rgba(234, 27, 64, 0.4);
            transform: translateY(-2px);
            color: white !important;
          }
          .support-section {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 25px 0;
            text-align: center;
          }
          .support-section p {
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
          }
          .support-section a {
            color: #EA1B40;
            text-decoration: none;
            font-weight: 600;
          }
          .footer {
            background-color: #2c3e50;
            color: #ecf0f1;
            padding: 30px;
            text-align: center;
          }
          .footer p {
            margin: 8px 0;
            font-size: 13px;
            opacity: 0.9;
          }
          .footer-links {
            margin: 15px 0;
          }
          .footer-links a {
            color: #EA1B40;
            text-decoration: none;
            margin: 0 10px;
            font-size: 13px;
          }
          .social-links {
            margin-top: 20px;
          }
          .social-links a {
            display: inline-block;
            margin: 0 8px;
            color: #ecf0f1;
            font-size: 20px;
          }
          .divider {
            height: 1px;
            background: linear-gradient(to right, transparent, #ddd, transparent);
            margin: 30px 0;
          }
          @media only screen and (max-width: 600px) {
            .content, .header, .footer {
              padding: 20px 15px;
            }
            .account-code-value {
              font-size: 24px;
            }
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <!-- Header -->
          <div class="header">
            <h1>🎉 Welcome to M5C!</h1>
            <p>Your account has been successfully created</p>
          </div>
          
          <!-- Content -->
          <div class="content">
            <p class="greeting">Dear ${fullName},</p>
            
            <p class="message">
              Congratulations! We're thrilled to welcome you to the M5C family. Your account has been successfully 
              created and you're all set to start shipping with us.
            </p>
            
            <!-- Account Code Box -->
            <div class="account-code-box">
              <div class="account-code-label">Your Unique Account Code</div>
              <div class="account-code-value">${accountCode}</div>
            </div>
            
            <!-- Important Notice -->
            <div class="info-box">
              <strong>⚠️ Important:</strong> Please save this account code securely. You'll need it to access 
              your account and use our services.
            </div>
            
            <!-- Next Steps -->
            <div class="next-steps">
              <h3>🚀 Get Started in 3 Easy Steps:</h3>
              <ul class="steps-list">
                <li><strong>Log in to your account</strong> using your credentials and account code</li>
                <li><strong>Complete your profile</strong> to unlock all features</li>
                <li><strong>Start shipping!</strong> Create your first shipment and experience hassle-free logistics</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://m5c-web.vercel.app/auth/login" class="button">
                Access Your Account →
              </a>
            </div>
            
            <div class="divider"></div>
            
            <!-- Support Section -->
            <div class="support-section">
              <p><strong>Need Help?</strong></p>
              <p>Our support team is here for you 24/7</p>
              <p>
                📧 <a href="mailto:support@m5c.com">support@m5c.com</a> | 
                📞 <a href="tel:+911234567890">+91 123 456 7890</a>
              </p>
            </div>
            
            <p class="message" style="margin-top: 30px;">
              Thank you for choosing M5C. We're committed to providing you with the best shipping experience.
            </p>
            
            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              Best regards,<br>
              <strong style="color: #EA1B40;">The M5C Team</strong>
            </p>
          </div>
          
          <!-- Footer -->
          <div class="footer">
            <p style="font-size: 14px; font-weight: 600; margin-bottom: 15px;">M5C - Your Logistics Partner</p>
            <div class="footer-links">
              <a href="https://m5c-web.vercel.app">Website</a> •
              <a href="https://m5c-web.vercel.app/about">About Us</a> •
              <a href="https://m5c-web.vercel.app/contact">Contact</a> •
              <a href="https://m5c-web.vercel.app/privacy">Privacy Policy</a>
            </div>
            <div class="divider" style="background: linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent); margin: 20px 0;"></div>
            <p>This is an automated email. Please do not reply directly to this message.</p>
            <p>&copy; ${new Date().getFullYear()} M5C. All rights reserved.</p>
            <p style="margin-top: 15px; font-size: 12px; opacity: 0.7;">
              You received this email because an account was created for you at M5C.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Plain text version for email clients that don't support HTML
    const textContent = `
Dear ${fullName},

Congratulations! Welcome to M5C!

Your account has been successfully created and approved.

YOUR ACCOUNT CODE: ${accountCode}

Please save this account code securely. You'll need it to access your account and use our services.

GET STARTED IN 3 EASY STEPS:
1. Log in to your account using your credentials and account code
2. Complete your profile to unlock all features  
3. Start shipping! Create your first shipment and experience hassle-free logistics

Access your account at: https://m5c-web.vercel.app/auth/login

NEED HELP?
Our support team is here for you 24/7
Email: support@m5c.com
Phone: +91 123 456 7890

Thank you for choosing M5C. We're committed to providing you with the best shipping experience.

Best regards,
The M5C Team

---
This is an automated email. Please do not reply directly to this message.
© ${new Date().getFullYear()} M5C. All rights reserved.
    `.trim();

    // Send email
    const info = await transporter.sendMail({
      from: '"M5C Account Management" <harmanjeet.singh@iic.ac.in>',
      to: email,
      subject: `🎉 Welcome to M5C - Account Code: ${accountCode}`,
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