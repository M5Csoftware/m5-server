import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request) {
  try {
    const { email, fullName, accountCode, status, reason } =
      await request.json();

    // Validate required fields
    if (!email || !fullName || !status) {
      console.error("Missing required fields:", { email, fullName, status });
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: `Email: ${!!email}, FullName: ${!!fullName}, Status: ${!!status}`,
        },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          error: "Invalid email format",
          details: `The provided email "${email}" is not valid`,
        },
        { status: 400 }
      );
    }

    console.log("Attempting to send email to:", email);

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

    // Verify transporter configuration
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError) {
      console.error("SMTP verification failed:", verifyError);
      return NextResponse.json(
        {
          error: "SMTP configuration error",
          details: verifyError.message,
        },
        { status: 500 }
      );
    }

    let mailOptions;

    if (status === "approved") {
      // Approval email
      mailOptions = {
        from: {
          name: "M5C Logistics",
          address: "harmanjeet.singh@iic.ac.in",
        },
        to: email,
        subject: "Welcome to M5C! Your Agent Account is Now Active 🎉",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #047644;">Welcome to M5C Logistics Portal!</h2>
            
            <p>Dear <strong>${fullName}</strong>,</p>
            
            <p>We're excited to welcome you to M5C Logistics Portal! Your account has been successfully approved and will be activated soon. We'll share your account code and portal link within 24 hours.</p>
            
            
            <p>If you need any help getting started, our support team is available via the "Need Help / Find Documentation" section within the portal or at <a href="mailto:support@m5clogistics.com" style="color: #EA1B40;">support@m5clogistics.com</a>.</p>
            
            <p style="margin-top: 30px;">Welcome aboard,<br>
            <strong>Team M5C Logistics</strong><br>
            <em>Bridging Continents</em></p>
          </div>
        `,
      };
    } else if (status === "rejected") {
      // Rejection email
      const rejectionReason =
        reason ||
        "incomplete details / verification issues / internal criteria";

      mailOptions = {
        from: {
          name: "M5C Logistics",
          address: "harmanjeet.singh@iic.ac.in",
        },
        to: email,
        subject: "Update on Your M5C Agent Account Application",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #18181B;">Update on Your Application</h2>
            
            <p>Dear <strong>${fullName}</strong>,</p>
            
            <p>Thank you for showing interest in joining M5C Logistics as an agent.</p>
            
            <p>After reviewing your application, we regret to inform you that your account could not be approved at this time due to <strong>${rejectionReason}</strong>.</p>
            
            <p>You can reapply after updating your information or contact our support team for clarification at <a href="mailto:support@m5clogistics.com" style="color: #EA1B40;">support@m5clogistics.com</a>.</p>
            
            <p>We appreciate your time and interest in partnering with M5C.</p>
            
            <p style="margin-top: 30px;">Warm regards,<br>
            <strong>Team M5C Logistics</strong><br>
            <em>Bridging Continents</em></p>
          </div>
        `,
      };
    } else {
      return NextResponse.json(
        { error: "Invalid status. Must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    console.log("Sending email with options:", {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
    });

    // Send email
    const info = await transporter.sendMail(mailOptions);

    console.log("Email sent successfully:", info.messageId);
    console.log("Accepted recipients:", info.accepted);
    console.log("Rejected recipients:", info.rejected);

    return NextResponse.json(
      {
        success: true,
        message: "Email sent successfully",
        messageId: info.messageId,
        recipient: email,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      {
        error: "Failed to send email",
        details: error.message,
        code: error.code,
      },
      { status: 500 }
    );
  }
}
