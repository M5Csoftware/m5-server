import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request) {
  try {
    const { shipments } = await request.json();

    if (!shipments || shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments provided" },
        { status: 400 }
      );
    }

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

    // Group shipments by account code (email)
    const groupedShipments = {};

    shipments.forEach((shipment) => {
      const email = shipment.email;

      if (!email) {
        return; // Skip shipments without email
      }

      if (!groupedShipments[email]) {
        groupedShipments[email] = {
          accountCode: shipment.accountCode,
          customerName: shipment.customerName,
          email: email,
          shipments: [],
        };
      }

      groupedShipments[email].shipments.push(shipment);
    });

    // Send emails
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const [email, group] of Object.entries(groupedShipments)) {
      try {
        const emailHtml = generateEmailHTML(group);

        await transporter.sendMail({
          from: '"M5C Continents Logistics" <harmanjeet.singh@iic.ac.in>',
          to: email,
          subject: "POD - Proof of Delivery Confirmation",
          html: emailHtml,
        });

        successCount++;
      } catch (error) {
        failCount++;
        errors.push({
          email: email,
          error: error.message,
        });
        console.error(`Failed to send email to ${email}:`, error);
      }
    }

    const totalGroups = Object.keys(groupedShipments).length;

    return NextResponse.json(
      {
        success: true,
        message: `Emails sent successfully to ${successCount} out of ${totalGroups} recipients`,
        details: {
          totalShipments: shipments.length,
          totalRecipients: totalGroups,
          successCount,
          failCount,
          errors: failCount > 0 ? errors : undefined,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in send email:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to send emails",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

function generateEmailHTML(group) {
  const { customerName, accountCode, shipments } = group;

  const tableRows = shipments
    .map(
      (shipment) => `
    <tr>
      <td style="padding: 12px; border: 1px solid #ddd;">${shipment.awbNo}</td>
      <td style="padding: 12px; border: 1px solid #ddd;">${shipment.destination}</td>
      <td style="padding: 12px; border: 1px solid #ddd;">${shipment.weight} kg</td>
      <td style="padding: 12px; border: 1px solid #ddd;">${shipment.receiverName}</td>
      <td style="padding: 12px; border: 1px solid #ddd; color: #22c55e; font-weight: 600;">Delivered</td>
    </tr>
  `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>POD - Proof of Delivery</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 15px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Proof of Delivery</h1>
        <p style="color: #d1fae5; margin: 8px 0 0 0; font-size: 14px;">Shipment Delivery Confirmation</p>
      </div>
      
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <div style="margin-bottom: 25px;">
          <p style="margin: 5px 0; font-size: 16px;">Dear <strong>${customerName}</strong>,</p>
          <p style="margin: 5px 0; color: #6b7280;">Account Code: <strong>${accountCode}</strong></p>
        </div>
        
        <p style="margin: 20px 0; font-size: 15px;">
          We are pleased to inform you that the following shipment(s) have been successfully delivered:
        </p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 25px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <thead>
            <tr style="background-color: #f9fafb;">
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left; font-weight: 600; color: #374151;">AWB No.</th>
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left; font-weight: 600; color: #374151;">Destination</th>
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left; font-weight: 600; color: #374151;">Weight</th>
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left; font-weight: 600; color: #374151;">Receiver Name</th>
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left; font-weight: 600; color: #374151;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        
        <div style="margin-top: 30px; padding: 20px; background-color: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px;">
          <p style="margin: 0; color: #166534; font-size: 14px;">
            ✓ All shipments have been delivered successfully to the respective receivers.
          </p>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 5px 0; font-size: 14px; color: #6b7280;">
            If you have any questions or concerns regarding your delivery, please don't hesitate to contact us.
          </p>
          <p style="margin: 15px 0 5px 0; font-size: 14px; color: #374151;">
            <strong>Thank you for choosing M5C Continents Logistics!</strong>
          </p>
        </div>
        
       
          
           <p style="margin-top: 30px;">
                <strong>CUSTOMER SERVICE TEAM</strong><br><br>
                KHASRA NO 91 BAMNOLI<br>
                VILLAGE DWARKA SECTOR 28, NEW DELHI 110061<br>
                Tel: 0000000000 | <a href="http://www.m5clogs.com">www.m5clogs.com</a>
              </p>
         
      </div>
    </body>
    </html>
  `;
}
