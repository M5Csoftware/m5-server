// app/api/offload-shipment/send-alert/route.js
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request) {
  try {
    const body = await request.json();
    const { shipments, alertOnEmail, alertOnPortal, updateInEvents } = body;

    if (!shipments || shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments provided" },
        { status: 400 }
      );
    }

    let emailResults = [];

    // Send emails if alertOnEmail is checked
    if (alertOnEmail) {
      // Configure nodemailer transporter
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: "harmanjeet.singh@iic.ac.in",
          pass: "twmy flrf saih grnq",
        },
      });

      // Send email to each customer
      for (const shipment of shipments) {
        try {
          const mailOptions = {
            from: "harmanjeet.singh@iic.ac.in",
            to: shipment.email,
            subject: `Update on Your Shipment – AWB No. ${shipment.awbNo}`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <p>Dear ${shipment.customerName},</p>
                
                <p>We would like to inform you that the shipment under <strong>AWB No. ${shipment.awbNo}</strong>  was offloaded by customs authorities during the scheduled flight due to operational reasons.</p>
                
                
                <p>Please be assured that our team is closely coordinating with the airline and customs department to ensure the shipment is uplifted on the next available flight.</p>
                
                <p>We regret any inconvenience this delay may cause and appreciate your understanding and cooperation. We will keep you informed once the shipment has been rebooked and departs.
</p>
                
                <p>For any further clarification or assistance, please feel free to contact us directly.</p>
                
                <br>
                <p style="margin-top: 30px;">
                <strong>CUSTOMER SERVICE TEAM</strong><br><br>
                KHASRA NO 91 BAMNOLI<br>
                VILLAGE DWARKA SECTOR 28, NEW DELHI 110061<br>
                Tel: 0000000000 | <a href="http://www.m5clogs.com">www.m5clogs.com</a>
              </p>
              </div>
            `,
          };

          const info = await transporter.sendMail(mailOptions);

          emailResults.push({
            awbNo: shipment.awbNo,
            email: shipment.email,
            success: true,
            messageId: info.messageId,
          });
        } catch (emailError) {
          console.error(
            `Failed to send email to ${shipment.email}:`,
            emailError
          );
          emailResults.push({
            awbNo: shipment.awbNo,
            email: shipment.email,
            success: false,
            error: emailError.message,
          });
        }
      }
    }

    // TODO: Implement portal alert logic if alertOnPortal is true
    // TODO: Implement update events logic if updateInEvents is true

    const successfulEmails = emailResults.filter(
      (result) => result.success
    ).length;
    const failedEmails = emailResults.filter(
      (result) => !result.success
    ).length;

    return NextResponse.json({
      success: true,
      message: `Alert sent successfully`,
      emailResults: alertOnEmail
        ? {
            total: emailResults.length,
            successful: successfulEmails,
            failed: failedEmails,
            details: emailResults,
          }
        : null,
      alertOnEmail,
      alertOnPortal,
      updateInEvents,
    });
  } catch (error) {
    console.error("Error sending alerts:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
