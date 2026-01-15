import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import EventActivity from "@/app/model/EventActivity"; // Adjust path as needed
import Shipment from "@/app/model/portal/Shipment";// Adjust path as needed

export async function POST(request) {
  try {
    console.log("=== Email API Called ===");

    const body = await request.json();
    console.log("Request body:", JSON.stringify(body, null, 2));

    const { cdNumber, receiveDate, clientGroups, totalWeight, totalRows } = body;

    // Validate required fields
    if (!cdNumber || !receiveDate || !clientGroups) {
      console.error("Missing required fields:", {
        cdNumber,
        receiveDate,
        clientGroups,
      });
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get current date and time
    const currentDate = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const currentDateTime = new Date();

    console.log("Creating transporter...");

    // Configure nodemailer
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "harmanjeet.singh@iic.ac.in",
        pass: "twmy flrf saih grnq",
      },
    });

    console.log("Verifying transporter...");

    // Verify connection
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError) {
      console.error("SMTP verification failed:", verifyError);
      return NextResponse.json(
        {
          success: false,
          message: "SMTP connection failed: " + verifyError.message,
        },
        { status: 500 }
      );
    }

    let emailsSent = 0;
    const emailPromises = [];
    const eventActivityPromises = [];
    const shipmentPromises = [];

    console.log("Processing client groups...");

    // Process each client and their AWB entries
    for (const clientCode in clientGroups) {
      const clientGroup = clientGroups[clientCode];
      const { clientName, clientEmail, rows } = clientGroup;

      console.log(`Processing client: ${clientName} (${clientEmail})`);

      // Process each AWB for this client
      for (const row of rows) {
        const { awbNo, receivedWeight, remark, receiveDate } = row;

        console.log(`Processing AWB: ${awbNo}`);

        // Save to EventActivity
        try {
          // Check if EventActivity already exists for this AWB
          let eventActivity = await EventActivity.findOne({ awbNo });

          const eventData = {
            eventCode: "OGH",
            eventDate: currentDate,
            eventTime: currentTime,
            status: "Arrived at Origin Gateway Hub",
            eventUser: "System", // You can change this to actual user
            eventLocation: "Origin Gateway Hub",
            eventLogTime: currentDateTime,
            remark: remark || `CD Number: ${cdNumber}, Weight: ${receivedWeight}kg`,
            receiverName: clientName,
          };

          if (eventActivity) {
            // Update existing EventActivity - push new values to arrays
            eventActivity.eventCode.push(eventData.eventCode);
            eventActivity.eventDate.push(eventData.eventDate);
            eventActivity.eventTime.push(eventData.eventTime);
            eventActivity.status.push(eventData.status);
            eventActivity.eventUser.push(eventData.eventUser);
            eventActivity.eventLocation.push(eventData.eventLocation);
            eventActivity.eventLogTime.push(eventData.eventLogTime);
            
            // Update single fields if they exist
            if (eventData.remark) {
              eventActivity.remark = eventData.remark;
            }
            if (eventData.receiverName) {
              eventActivity.receiverName = eventData.receiverName;
            }
          } else {
            // Create new EventActivity
            eventActivity = new EventActivity({
              awbNo,
              eventCode: [eventData.eventCode],
              eventDate: [eventData.eventDate],
              eventTime: [eventData.eventTime],
              status: [eventData.status],
              eventUser: [eventData.eventUser],
              eventLocation: [eventData.eventLocation],
              eventLogTime: [eventData.eventLogTime],
              remark: eventData.remark,
              receiverName: eventData.receiverName,
            });
          }

          const savedEventActivity = await eventActivity.save();
          eventActivityPromises.push(savedEventActivity);
          console.log(`✓ EventActivity saved/updated for AWB: ${awbNo}`);

          // Update Shipment status
          let shipment = await Shipment.findOne({ awbNo });
          
          if (shipment) {
            // Update existing shipment status
            shipment.status = "Arrived at Hub";
            const updatedShipment = await shipment.save();
            shipmentPromises.push(updatedShipment);
            console.log(`✓ Shipment status updated for AWB: ${awbNo}`);
          } else {
            // Create new shipment if doesn't exist
            shipment = new Shipment({
              awbNo,
              status: "Arrived at Hub",
              clientCode: clientCode,
              clientName: clientName,
              weight: receivedWeight,
              receiveDate: receiveDate,
            });
            const newShipment = await shipment.save();
            shipmentPromises.push(newShipment);
            console.log(`✓ New shipment created for AWB: ${awbNo}`);
          }

        } catch (dbError) {
          console.error(`✗ Database error for AWB ${awbNo}:`, dbError);
          // Continue with other AWBs even if one fails
        }
      }

      // Create email subject
      const subject = `Load Received Details From M5C Continents Logistics P LTD On Date- ${receiveDate} ${currentTime} to ${clientName}`;

      // Calculate client-specific total weight
      const clientTotalWeight = rows
        .reduce((sum, row) => sum + parseFloat(row.receivedWeight || 0), 0)
        .toFixed(2);
      const clientTotalRows = rows.length;

      // Create table HTML for this client
      let tableHTML = `
        <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;">
          <thead style="background-color: #f2f2f2;">
            <tr>
              <th style="padding: 10px; text-align: left;">Receive Date</th>
              <th style="padding: 10px; text-align: left;">AWB No</th>
              <th style="padding: 10px; text-align: left;">Received Weight</th>
              <th style="padding: 10px; text-align: left;">Remark</th>
            </tr>
          </thead>
          <tbody>
      `;

      rows.forEach((row) => {
        tableHTML += `
          <tr>
            <td style="padding: 10px;">${row.receiveDate}</td>
            <td style="padding: 10px;">${row.awbNo}</td>
            <td style="padding: 10px;">${row.receivedWeight} kg</td>
            <td style="padding: 10px;">${row.remark}</td>
          </tr>
        `;
      });

      tableHTML += `
          </tbody>
          <tfoot style="background-color: #f9f9f9; font-weight: bold;">
           <tr>
              <td colspan="2" style="padding: 10px; text-align: right;">Total Rows:</td>
              <td colspan="2" style="padding: 10px; color: red;">${clientTotalRows}</td>
           </tr>
           <tr>
              <td colspan="2" style="padding: 10px; text-align: right;">Total Weight:</td>
              <td colspan="2" style="padding: 10px; color: red;">${clientTotalWeight} kg</td>
           </tr>
          </tfoot>
        </table>
      `;

      // Create email body
      const emailBody = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <p>Dear Customer,</p>
          
          <p>Please find details of Load Received / CD No. - <strong>${cdNumber}</strong></p>
          
          <p><strong>Customer Name:</strong> ${clientName}</p>
          
          <br>
          
          ${tableHTML}
          
          <br><br>
          
          <p style="margin-top: 30px;">
            <strong>CUSTOMER SERVICE TEAM</strong><br><br>
            KHASRA NO 91 BAMNOLI<br>
            VILLAGE DWARKA SECTOR 28, NEW DELHI 110061<br>
            Tel: 0000000000 | <a href="http://www.m5clogs.com">www.m5clogs.com</a>
          </p>
        </div>
      `;

      // Handle multiple email addresses (comma-separated)
      const emailAddresses = clientEmail
        .split(",")
        .map((email) => email.trim())
        .join(",");

      // Send email
      const mailOptions = {
        from: "harmanjeet.singh@iic.ac.in",
        to: emailAddresses,
        subject: subject,
        html: emailBody,
      };

      console.log(`Sending email to: ${emailAddresses}`);

      emailPromises.push(
        transporter
          .sendMail(mailOptions)
          .then(() => {
            emailsSent++;
            console.log(
              `✓ Email sent successfully to ${clientName} (${emailAddresses})`
            );
          })
          .catch((error) => {
            console.error(
              `✗ Failed to send email to ${clientName}:`,
              error.message
            );
          })
      );
    }

    // Wait for all operations to complete
    console.log("Waiting for all operations to complete...");
    
    // Wait for email operations
    await Promise.all(emailPromises);

    console.log(`Total emails sent: ${emailsSent}`);
    console.log(`Total EventActivity records processed: ${eventActivityPromises.length}`);
    console.log(`Total Shipment records processed: ${shipmentPromises.length}`);

    return NextResponse.json({
      success: true,
      message: `Email sent successfully to ${emailsSent} client(s) and data saved to database`,
      emailsSent: emailsSent,
      eventActivitiesProcessed: eventActivityPromises.length,
      shipmentsProcessed: shipmentPromises.length,
    });
  } catch (error) {
    console.error("Error in send-email API:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to process request" },
      { status: 500 }
    );
  }
}