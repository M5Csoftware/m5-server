// app/api/offload-shipment/run-wise/send-alert/route.js
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

      // Group shipments by email to send one email per customer with all their AWBs
      const shipmentsByEmail = {};
      shipments.forEach((shipment) => {
        if (!shipmentsByEmail[shipment.email]) {
          shipmentsByEmail[shipment.email] = {
            customerName: shipment.customerName,
            accountCode: shipment.accountCode,
            awbList: [],
          };
        }
        shipmentsByEmail[shipment.email].awbList.push({
          awbNo: shipment.awbNo,
          offloadReason: shipment.offloadReason,
        });
      });

      // Send email to each customer
      for (const email in shipmentsByEmail) {
        try {
          const customerData = shipmentsByEmail[email];
          const awbListHtml = customerData.awbList
            .map(
              (awb) => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${awb.awbNo}</td>
            
            </tr>
          `
            )
            .join("");

          const mailOptions = {
            from: "harmanjeet.singh@iic.ac.in",
            to: email,
            subject: `Update on Your Shipments - Run Offload Notification`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <p>Dear ${customerData.customerName},</p>
                
                <p>We would like to inform you that the shipment was offloaded by customs authorities during the scheduled flight due to operational reasons:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <thead>
                    <tr style="background-color: #f2f2f2;">
                      <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">AWB Number</th>
                   
                    </tr>
                  </thead>
                  <tbody>
                    ${awbListHtml}
                  </tbody>
                </table>
                
                <p>Please be assured that our team is closely coordinating with the airline and customs department to ensure the shipment is uplifted on the next available flight.</p>
                
                <p>We regret any inconvenience this delay may cause and appreciate your understanding and cooperation. We will keep you informed once the shipment has been rebooked and departs.</p>
                
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
            email: email,
            customerName: customerData.customerName,
            awbCount: customerData.awbList.length,
            success: true,
            messageId: info.messageId,
          });
        } catch (emailError) {
          console.error(`Failed to send email to ${email}:`, emailError);
          emailResults.push({
            email: email,
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
