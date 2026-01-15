import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import connectDB from "@/app/lib/db";

export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      transporter,
      cdNumber,
      totalWeight,
      totalBags,
      shipments,
      alertOnPortal,
      alertOnEmail,
      updateInEvents,
    } = body;

    // Validation
    if (!shipments || shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No shipments provided" },
        { status: 400 }
      );
    }

    if (!alertOnEmail) {
      return NextResponse.json(
        { success: false, message: "Email alert is required" },
        { status: 400 }
      );
    }

    // Configure nodemailer transporter
    const transporter_mail = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "harmanjeet.singh@iic.ac.in",
        pass: "twmy flrf saih grnq",
      },
    });

    // Group shipments by email
    const shipmentsByEmail = shipments.reduce((acc, shipment) => {
      const email = shipment.email || "no-email@example.com";
      if (!acc[email]) {
        acc[email] = [];
      }
      acc[email].push(shipment);
      return acc;
    }, {});

    // Current date
    const currentDate = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    // Send emails for each group
    const emailPromises = Object.entries(shipmentsByEmail).map(
      async ([email, emailShipments]) => {
        if (email === "no-email@example.com") {
          console.log("Skipping shipments without email");
          return null;
        }

        const htmlContent = generateEmailHTML(
          transporter,
          cdNumber,
          totalWeight,
          totalBags,
          currentDate,
          emailShipments
        );

        const mailOptions = {
          from: '"M5 Continents Logistics" <harmanjeet.singh@iic.ac.in>',
          to: email,
          subject: "REMOVED ITEMS",
          html: htmlContent,
        };

        try {
          await transporter_mail.sendMail(mailOptions);
          console.log(`Email sent successfully to ${email}`);
          return { email, success: true };
        } catch (error) {
          console.error(`Error sending email to ${email}:`, error);
          return { email, success: false, error: error.message };
        }
      }
    );

    const results = await Promise.all(emailPromises);
    const successCount = results.filter((r) => r && r.success).length;

    // TODO: Implement portal alert and events update logic here
    if (alertOnPortal) {
      // Add portal notification logic
    }

    if (updateInEvents) {
      // Add events update logic
    }

    return NextResponse.json(
      {
        success: true,
        message: `Alerts sent successfully to ${successCount} recipient(s)`,
        details: results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending alert:", error);
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

// Helper function to generate email HTML
function generateEmailHTML(
  transporter,
  cdNumber,
  totalWeight,
  totalBags,
  currentDate,
  shipments
) {
  const tableRows = shipments
    .map(
      (shipment, index) => `
    <tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 12px; text-align: left; border: 1px solid #ddd;">${index + 1}</td>
      <td style="padding: 12px; text-align: left; border: 1px solid #ddd;">${shipment.awbNo || ""}</td>
      <td style="padding: 12px; text-align: left; border: 1px solid #ddd;">${shipment.accountCode || ""}</td>
      <td style="padding: 12px; text-align: left; border: 1px solid #ddd;">${shipment.customerName || ""}</td>
      <td style="padding: 12px; text-align: left; border: 1px solid #ddd;">${shipment.consignorName || ""}</td>
      <td style="padding: 12px; text-align: left; border: 1px solid #ddd;">${shipment.consigneeName || ""}</td>
      <td style="padding: 12px; text-align: left; border: 1px solid #ddd;">${shipment.weight || ""}</td>
      <td style="padding: 12px; text-align: left; border: 1px solid #ddd;">${shipment.bagNo || ""}</td>
      <td style="padding: 12px; text-align: left; border: 1px solid #ddd;">${shipment.transporterAndCd || ""}</td>
      <td style="padding: 12px; text-align: left; border: 1px solid #ddd;">${shipment.removedItem || ""}</td>
    </tr>
  `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RTO Shipment - Removed Items</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4;">
      <div style="max-width: 1200px; margin: 0 auto; background-color: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        
        <h2 style="color: #d32f2f; margin-bottom: 20px;">REMOVED ITEMS</h2>
        
        <div style="margin-bottom: 20px; line-height: 1.8;">
          <p style="margin: 5px 0;">We have sent Load thru <strong>${transporter || "N/A"}</strong> - <strong>${cdNumber || "N/A"}</strong></p>
          <p style="margin: 5px 0;">Total Weight: <strong>${totalWeight ? totalWeight.toFixed(2) : "0.00"} kg</strong></p>
          <p style="margin: 5px 0;">Total Bags: <strong>${totalBags || 0}</strong></p>
          <p style="margin: 5px 0;">Date: <strong>${currentDate}</strong></p>
        </div>

        <h3 style="color: #000; margin: 30px 0 15px 0; font-weight: bold;">KINDLY CONFIRM RECEIVED BELOW SHIPMENTS</h3>
        
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
              <tr style="background-color: #d32f2f; color: white;">
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">#</th>
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">AWB No</th>
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Customer Code</th>
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Customer Name</th>
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Consignor Name</th>
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Consignee Name</th>
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Weight</th>
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Bag No.</th>
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Transporter & CD No.</th>
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Removed Items</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <div style="margin-top: 30px; color: #666; font-size: 14px;">
          <p style="margin: 5px 0;">
            <strong style="color: #000;">CUSTOMER SERVICE TEAM</strong><br><br>
            M5 CONTINENTS LOGISTICS SOLUTIONS Pvt. LTD<br>
            KHASRA NO 91 BAMNOLI<br>
            VILLAGE DWARKA SECTOR 28, NEW DELHI 110061<br>
            Tel: 0000000000 | <a href="http://www.m5clogs.com" style="color: #d32f2f; text-decoration: none;">www.m5clogs.com</a>
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}