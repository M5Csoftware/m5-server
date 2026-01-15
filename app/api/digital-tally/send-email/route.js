// app/api/portal/send-email/route.js
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, customerName, cdNumber, tableData } = body;

    // Validate required fields
    if (!email || !tableData || tableData.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Email and table data are required",
        },
        { status: 400 }
      );
    }

    // Get current date and time
    const today = new Date();
    const dateStr = today.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = today.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

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

    // Generate table HTML from tableData
    const tableRows = tableData
      .map(
        (row) => `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${
          row.awbNo || ""
        }</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${
          row.rcvDate || ""
        }</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${
          row.actWgt || ""
        }</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${
          row.volwgt || ""
        }</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${
          row.service || ""
        }</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${
          row.status || ""
        }</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${
          row.holdReason || row["Hold Reason"] || "-"
        }</td>
      </tr>
    `
      )
      .join("");

    const emailHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              max-width: 900px;
              margin: 0 auto;
              background-color: #ffffff;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h2 {
              color: #EA2147;
              border-bottom: 3px solid #EA2147;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 20px 0;
              background-color: #fff;
            }
            th {
              background-color: #EA2147;
              color: white;
              border: 1px solid #ddd;
              padding: 12px;
              text-align: center;
              font-weight: bold;
            }
            td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: center;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            tr:hover {
              background-color: #f5f5f5;
            }
            .info-section {
              background-color: #f8f8f8;
              padding: 15px;
              border-left: 4px solid #EA2147;
              margin: 20px 0;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 2px solid #ddd;
              color: #666;
            }
            .footer strong {
              color: #EA2147;
              font-size: 16px;
            }
            .footer a {
              color: #EA2147;
              text-decoration: none;
            }
            .footer a:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>M5 CONTINENTS LOGISTICS SOLUTIONS Pvt. LTD</h2>
            
            <p>Dear Customer,</p>
            
            <div class="info-section">
              <p style="margin: 5px 0;"><strong>Load Received / CD No.:</strong> ${
                cdNumber || "N/A"
              }</p>
              <p style="margin: 5px 0;"><strong>Customer Name:</strong> ${
                customerName || "N/A"
              }</p>
              <p style="margin: 5px 0;"><strong>Date:</strong> ${dateStr}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${timeStr}</p>
            </div>

            <p>Please find details of Load Received below:</p>
            
            <table>
              <thead>
                <tr>
                  <th>AWB No.</th>
                  <th>Rcv Date</th>
                  <th>Act Wgt</th>
                  <th>Vol Wgt</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Hold Reason</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>

            <div class="footer">
              <p>
                <strong>CUSTOMER SERVICE TEAM</strong><br><br>
                M5 CONTINENTS LOGISTICS SOLUTIONS Pvt. LTD<br>
                KHASRA NO 91 BAMNOLI<br>
                VILLAGE DWARKA SECTOR 28, NEW DELHI 110061<br>
                Tel: 0000000000 | <a href="http://www.m5clogs.com">www.m5clogs.com</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send email
    const mailOptions = {
      from: '"M5 CONTINENTS LOGISTICS" <harmanjeet.singh@iic.ac.in>',
      to: email,
      subject: `Load Received Details from M5 CONTINENTS LOGISTICS SOLUTIONS Pvt. LTD on ${dateStr} - ${timeStr} to ${
        customerName || "Customer"
      }`,
      html: emailHTML,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("Email sent successfully:", info.messageId);

    return NextResponse.json({
      success: true,
      message: "Email sent successfully",
      messageId: info.messageId,
      emailSentTo: email,
      customerName: customerName,
      shipmentsCount: tableData.length,
    });
  } catch (error) {
    console.error("Email sending failed:", error);
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