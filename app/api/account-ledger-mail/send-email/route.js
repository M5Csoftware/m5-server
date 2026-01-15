import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { v2 as cloudinary } from 'cloudinary';
import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dhlrogvj1",
  api_key: process.env.CLOUDINARY_API_KEY || "642583471231691",
  api_secret: process.env.CLOUDINARY_API_SECRET || "mEhp5rJDSOkffyh2gTYVxkwlYUU"
});

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { files, customers } = body;

    console.log("========== EMAIL SENDING STARTED ==========");
    console.log(`Total files received: ${files?.length || 0}`);
    console.log(`Total customers received: ${customers?.length || 0}`);

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, message: "No files provided" },
        { status: 400 }
      );
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json(
        { success: false, message: "No customer data provided" },
        { status: 400 }
      );
    }

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "harmanjeet.singh@iic.ac.in",
        pass: "twmy flrf saih grnq"
      }
    });

    const sentEmails = [];
    const failedEmails = [];

    // Get current date
    const currentDate = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // Process each customer and their corresponding file
    for (const customer of customers) {
      console.log(`\n📦 Processing customer: ${customer.customerCode} - ${customer.customerName}`);
      
      // Find the corresponding file for this customer
      const file = files.find(f => f.accountCode === customer.customerCode);
      
      if (!file) {
        console.log(`❌ No file found for customer: ${customer.customerCode}`);
        failedEmails.push({
          accountCode: customer.customerCode,
          customerName: customer.customerName,
          reason: "No Excel file generated for this account"
        });
        continue;
      }

      if (!customer.emailId) {
        console.log(`❌ No email address for customer: ${customer.customerCode}`);
        failedEmails.push({
          accountCode: customer.customerCode,
          customerName: customer.customerName,
          reason: "No email address found"
        });
        continue;
      }

      try {
        let ccEmail = null;

        // If salePerson exists in customer data, fetch employee email for CC
        if (customer.salePerson) {
          console.log(`🔍 Looking for employee with salePerson: ${customer.salePerson}`);
          
          // Try to find employee by userId first, then by userName
          let employee = await Employee.findOne({ 
            userId: customer.salePerson 
          }).select("email userId userName");

          // If not found by userId, try userName
          if (!employee) {
            employee = await Employee.findOne({ 
              userName: customer.salePerson 
            }).select("email userId userName");
          }

          if (employee && employee.email) {
            ccEmail = employee.email;
            console.log(`✅ CC email found:`);
            console.log(`   - Sale Person: ${customer.salePerson}`);
            console.log(`   - Employee UserID: ${employee.userId}`);
            console.log(`   - Employee UserName: ${employee.userName}`);
            console.log(`   - CC Email: ${ccEmail}`);
          } else {
            console.log(`⚠️ No employee found for salePerson: ${customer.salePerson}`);
          }
        } else {
          console.log(`⚠️ No salePerson assigned for account: ${customer.customerCode}`);
        }

        // Fetch file from Cloudinary URL
        console.log(`📥 Fetching file from Cloudinary: ${file.fileName}`);
        const response = await fetch(file.cloudinaryUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`✅ File fetched successfully, size: ${buffer.length} bytes`);

        // Email content
        const mailOptions = {
          from: '"M5C Continents Logistics" <harmanjeet.singh@iic.ac.in>',
          to: customer.emailId,
          subject: `Account Ledger ${currentDate} from M5C Continents Logistics Solutions Pvt. Ltd`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
              <p>Dear ${customer.customerName},</p>
              <p>Please find your account ledger attached.</p>
              <p><strong>Attachment:</strong> ${file.fileName}</p>
              <p>Please find your Attachment here.</p>
              
              <p style="margin-top: 30px;">
                <strong>CUSTOMER SERVICE TEAM</strong><br><br>
                KHASRA NO 91 BAMNOLI<br>
                VILLAGE DWARKA SECTOR 28, NEW DELHI 110061<br>
                Tel: 0000000000 | <a href="http://www.m5clogs.com">www.m5clogs.com</a>
              </p>
            </div>
          `,
          attachments: [
            {
              filename: file.fileName,
              content: buffer
            }
          ]
        };

        // Add CC if employee email found
        if (ccEmail) {
          mailOptions.cc = ccEmail;
          console.log(`📧 Adding CC to email: ${ccEmail}`);
        }

        // Send email
        console.log(`📤 Sending email...`);
        const info = await transporter.sendMail(mailOptions);
        
        console.log(`✉️ Email sent successfully:`);
        console.log(`   - To: ${customer.emailId}`);
        console.log(`   - CC: ${ccEmail || 'None'}`);
        console.log(`   - Account: ${customer.customerCode}`);
        console.log(`   - Customer: ${customer.customerName}`);
        console.log(`   - File: ${file.fileName}`);
        console.log(`   - Message ID: ${info.messageId}`);
        
        sentEmails.push({
          accountCode: customer.customerCode,
          customerName: customer.customerName,
          email: customer.emailId,
          cc: ccEmail || "None",
          salePerson: customer.salePerson || "Not assigned",
          fileName: file.fileName
        });

        // Delete file from Cloudinary after sending
        try {
          await cloudinary.uploader.destroy(file.publicId, { resource_type: 'raw' });
          console.log(`🗑️ Deleted file from Cloudinary: ${file.publicId}`);
        } catch (deleteError) {
          console.error(`⚠️ Error deleting file from Cloudinary: ${file.publicId}`, deleteError);
        }

        console.log('-----------------------------------');

      } catch (error) {
        console.error(`❌ Error sending email for ${customer.customerCode}:`, error);
        failedEmails.push({
          accountCode: customer.customerCode,
          customerName: customer.customerName,
          reason: error.message
        });
      }
    }

    console.log("\n========== EMAIL SENDING COMPLETED ==========");
    console.log(`✅ Successfully sent: ${sentEmails.length}`);
    console.log(`❌ Failed: ${failedEmails.length}`);

    // Return response
    if (sentEmails.length > 0 && failedEmails.length === 0) {
      return NextResponse.json({
        success: true,
        message: `Emails sent successfully to ${sentEmails.length} customer(s)`,
        sentEmails
      });
    } else if (sentEmails.length > 0 && failedEmails.length > 0) {
      return NextResponse.json({
        success: true,
        message: `${sentEmails.length} email(s) sent successfully. ${failedEmails.length} failed.`,
        sentEmails,
        failedEmails
      });
    } else {
      return NextResponse.json({
        success: false,
        message: "Failed to send any emails",
        failedEmails
      }, { status: 500 });
    }

  } catch (error) {
    console.error("❌ Error sending emails:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send emails", error: error.message },
      { status: 500 }
    );
  }
}