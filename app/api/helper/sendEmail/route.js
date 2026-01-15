import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { v2 as cloudinary } from "cloudinary";
import https from "https";
import http from "http";
import { URL } from "url";
import path from "path";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// In-memory storage for scheduled emails (replace with DB in production)
const scheduledEmails = new Map();

// ============ ALL HELPER FUNCTIONS FROM ORIGINAL CODE ============

const determineResourceTypeFromPublicId = (publicId) => {
  const ext = path.extname(publicId).toLowerCase();
  const imageTypes = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"];
  const videoTypes = [".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm"];
  if (imageTypes.includes(ext)) return "image";
  if (videoTypes.includes(ext)) return "video";
  return "raw";
};

const downloadFile = (url) =>
  new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === "https:" ? https : http;

    const request = protocol.get(
      url,
      {
        timeout: 60000,
        headers: {
          "User-Agent": "Node.js Email Service",
          Accept: "*/*",
          "Accept-Encoding": "identity",
          "Cache-Control": "no-cache",
        },
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          request.destroy();
          downloadFile(response.headers.location).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          request.destroy();
          reject(new Error(`Failed: ${response.statusCode} ${response.statusMessage}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          if (!buffer.length) {
            reject(new Error("Downloaded file is empty"));
            return;
          }
          resolve(buffer);
        });
      }
    );

    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy();
      reject(new Error("Download timeout"));
    });
  });

const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
  };
  return types[ext] || "application/octet-stream";
};

const extractOriginalFilename = (publicId) => {
  console.log(`🔧 Extracting original filename from publicId: ${publicId}`);
  
  const lastPart = publicId.split('/').pop();
  const timestampPattern = /^\d+_\d+_(.+)$/;
  const match = lastPart.match(timestampPattern);
  
  if (match) {
    const originalName = match[1];
    console.log(`✅ Extracted original filename: ${originalName}`);
    return originalName;
  }
  
  console.log(`✅ Using entire last part as filename: ${lastPart}`);
  return lastPart;
};

const isCSVBuffer = (buffer) => {
  if (!buffer || buffer.length === 0) return false;
  
  const sample = buffer.slice(0, Math.min(buffer.length, 2000)).toString('utf8');
  const lines = sample.split('\n').slice(0, 10);
  
  if (lines.length < 2) return false;
  
  let csvScore = 0;
  let totalLines = 0;
  
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    totalLines++;
    
    const commas = (line.match(/,/g) || []).length;
    
    if (commas > 0) csvScore += 2;
    
    if (totalLines === 1) {
      var firstLineCommas = commas;
    } else if (Math.abs(commas - firstLineCommas) <= 1) {
      csvScore += 1;
    }
    
    if (line.includes('"') && line.match(/("[^"]*")/)) {
      csvScore += 1;
    }
    
    if (totalLines === 1 && /^[a-zA-Z]/.test(line.trim())) {
      csvScore += 1;
    }
    
    if (!line.includes('<') && !line.includes('>')) {
      csvScore += 1;
    }
  }
  
  console.log(`📊 CSV detection score: ${csvScore} for ${totalLines} lines`);
  console.log(`📊 First line: ${lines[0]?.substring(0, 100)}...`);
  
  return csvScore > (totalLines * 2);
};

const isTextBuffer = (buffer) => {
  const sample = buffer.slice(0, Math.min(buffer.length, 1000));
  let textChars = 0;
  
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      textChars++;
    }
  }
  
  return (textChars / sample.length) > 0.9;
};

const detectFileTypeFromBuffer = (buffer) => {
  if (!buffer || buffer.length < 8) return null;
  
  console.log(`🔍 Analyzing file buffer. Size: ${buffer.length} bytes`);
  console.log(`🔍 First 16 bytes: ${Array.from(buffer.slice(0, 16), b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
  
  if (isCSVBuffer(buffer)) {
    console.log(`📊 Detected CSV file from content analysis`);
    return 'csv';
  }
  
  if (buffer.slice(0, 4).toString() === '%PDF') {
    console.log(`📄 Detected PDF file`);
    return 'pdf';
  }
  
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    console.log(`📦 ZIP-based file detected, analyzing content...`);
    const bufferStr = buffer.toString('ascii', 0, Math.min(buffer.length, 4000));
    
    if (bufferStr.includes('xl/') || 
        bufferStr.includes('worksheets/') || 
        bufferStr.includes('sharedStrings.xml') ||
        bufferStr.includes('workbook.xml') ||
        bufferStr.includes('xl/_rels/') ||
        bufferStr.includes('xl/worksheets/')) {
      console.log(`📊 Detected XLSX file`);
      return 'xlsx';
    }
    
    if (bufferStr.includes('word/') || 
        bufferStr.includes('document.xml') ||
        bufferStr.includes('word/_rels/')) {
      console.log(`📝 Detected DOCX file`);
      return 'docx';
    }
    
    if (bufferStr.includes('ppt/') || 
        bufferStr.includes('slides/') ||
        bufferStr.includes('presentation.xml')) {
      console.log(`📽️ Detected PPTX file`);
      return 'pptx';
    }
    
    console.log(`📦 Generic ZIP file detected`);
    return 'zip';
  }
  
  if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
    console.log(`📋 OLE2 compound document detected, analyzing...`);
    
    const searchLength = Math.min(buffer.length, 8192);
    const bufferStr = buffer.toString('ascii', 0, searchLength);
    const bufferLatin1 = buffer.toString('latin1', 0, searchLength);
    
    const excelSignatures = [
      'Microsoft Excel',
      'Excel',
      'Workbook',
      'Worksheet',
      '\x09\x08\x00\x00',
      '\x05\x00\x00\x00',
    ];
    
    const wordSignatures = [
      'Microsoft Word',
      'Word.Document',
      'Microsoft Office Word',
      '\xDB\xA5\x2D\x00',
    ];
    
    const powerpointSignatures = [
      'Microsoft PowerPoint',
      'PowerPoint Document',
      'Microsoft Office PowerPoint',
    ];
    
    let excelScore = 0;
    let wordScore = 0;
    let powerpointScore = 0;
    
    for (const sig of excelSignatures) {
      if (bufferStr.includes(sig) || bufferLatin1.includes(sig)) {
        excelScore++;
      }
    }
    
    for (const sig of wordSignatures) {
      if (bufferStr.includes(sig) || bufferLatin1.includes(sig)) {
        wordScore++;
      }
    }
    
    for (const sig of powerpointSignatures) {
      if (bufferStr.includes(sig) || bufferLatin1.includes(sig)) {
        powerpointScore++;
      }
    }
    
    if (buffer.includes(Buffer.from([0x09, 0x08, 0x00, 0x00])) ||
        buffer.includes(Buffer.from([0x05, 0x00, 0x00, 0x00]))) {
      excelScore += 2;
    }
    
    if (buffer.includes(Buffer.from([0xDB, 0xA5, 0x2D, 0x00]))) {
      wordScore += 2;
    }
    
    console.log(`📊 Detection scores - Excel: ${excelScore}, Word: ${wordScore}, PowerPoint: ${powerpointScore}`);
    
    if (excelScore > wordScore && excelScore > powerpointScore) {
      console.log(`📊 Detected Excel (XLS) file`);
      return 'xls';
    } else if (wordScore > excelScore && wordScore > powerpointScore) {
      console.log(`📝 Detected Word (DOC) file`);
      return 'doc';
    } else if (powerpointScore > 0) {
      console.log(`📽️ Detected PowerPoint (PPT) file`);
      return 'ppt';
    }
    
    console.log(`📋 OLE2 file with unclear type, defaulting to XLS`);
    return 'xls';
  }
  
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    console.log(`🖼️ Detected JPEG file`);
    return 'jpg';
  }
  
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
    console.log(`🖼️ Detected PNG file`);
    return 'png';
  }
  
  if ((buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
       (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61)) {
    console.log(`🖼️ Detected GIF file`);
    return 'gif';
  }
  
  if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') {
    console.log(`🖼️ Detected WebP file`);
    return 'webp';
  }
  
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    console.log(`🖼️ Detected BMP file`);
    return 'bmp';
  }
  
  if (isTextBuffer(buffer)) {
    console.log(`📄 Detected text file (but might be CSV or other data format)`);
    return 'txt';
  }
  
  console.log(`❓ Could not detect file type`);
  return null;
};

const getCorrectFilename = (publicId, fileMeta, fileBuffer) => {
  console.log(`🔧 Getting filename for publicId: ${publicId}`);
  console.log(`📋 File metadata:`, {
    original_filename: fileMeta.original_filename,
    format: fileMeta.format,
    resource_type: fileMeta.resource_type,
    bytes: fileMeta.bytes
  });

  if (fileMeta.original_filename && fileMeta.original_filename.includes('.')) {
    console.log(`✅ Using original filename: ${fileMeta.original_filename}`);
    return fileMeta.original_filename;
  }
  
  if (fileMeta.original_filename && fileMeta.format) {
    const filename = `${fileMeta.original_filename}.${fileMeta.format}`;
    console.log(`✅ Using original filename + format: ${filename}`);
    return filename;
  }
  
  const extractedName = extractOriginalFilename(publicId);
  
  if (path.extname(extractedName)) {
    console.log(`✅ Using extracted filename with extension: ${extractedName}`);
    return extractedName;
  }
  
  if (fileBuffer && isCSVBuffer(fileBuffer)) {
    const filename = `${extractedName}.csv`;
    console.log(`🎯 Detected CSV content, filename: ${filename}`);
    return filename;
  }
  
  const detectedType = detectFileTypeFromBuffer(fileBuffer);
  if (detectedType && detectedType !== 'txt') {
    const filename = `${extractedName}.${detectedType}`;
    console.log(`🔍 Detected file type from buffer: ${detectedType}, final filename: ${filename}`);
    return filename;
  }
  
  if (fileMeta.format) {
    const filename = `${extractedName}.${fileMeta.format}`;
    console.log(`✅ Using Cloudinary format: ${filename}`);
    return filename;
  }
  
  const filenameLower = extractedName.toLowerCase();
  
  if (filenameLower.includes('csv') || 
      filenameLower.includes('export') || 
      filenameLower.includes('import') ||
      filenameLower.includes('list') ||
      filenameLower.includes('contacts') ||
      filenameLower.includes('customers') ||
      filenameLower.includes('complaint') ||
      filenameLower.includes('report') ||
      filenameLower.includes('data')) {
    const filename = `${extractedName}.csv`;
    console.log(`🎯 Guessed CSV format from filename pattern: ${filename}`);
    return filename;
  }
  
  if (filenameLower.includes('tracking') || 
      filenameLower.includes('sheet') || 
      filenameLower.includes('excel') ||
      filenameLower.includes('workbook')) {
    const filename = `${extractedName}.xlsx`;
    console.log(`🎯 Guessed Excel format from filename pattern: ${filename}`);
    return filename;
  }
  
  if (fileBuffer && fileBuffer.length >= 8 && 
      fileBuffer[0] === 0xD0 && fileBuffer[1] === 0xCF) {
    const filename = `${extractedName}.xls`;
    console.log(`📊 OLE2 file detected, defaulting to Excel: ${filename}`);
    return filename;
  }
  
  if (fileBuffer && isTextBuffer(fileBuffer)) {
    const filename = `${extractedName}.csv`;
    console.log(`📄 Text file with potential data content, defaulting to CSV: ${filename}`);
    return filename;
  }
  
  console.log(`⚠️ Using fallback filename (no extension): ${extractedName}`);
  return extractedName;
};

// ============ MAIN EMAIL SENDING FUNCTION ============

async function sendEmails(emailData, cleanupAfterSend = true) {
  const results = [];
  const processedAttachments = new Map();

  for (let i = 0; i < emailData.length; i++) {
    const emailInfo = emailData[i];
    const {
      accNo,
      email,
      subject,
      cc,
      bcc,
      attachments,
      body,
      fromEmail,
      smtp,
      port = 587,
      password,
    } = emailInfo;

    try {
      if (!email || !fromEmail || !smtp || !password) {
        results.push({ accNo, status: "failed", error: "Missing required fields" });
        continue;
      }

      console.log(`📧 Processing email for ${email}`);
      console.log(`📎 Attachments array:`, attachments);

      const transporter = nodemailer.createTransport({
        host: smtp,
        port: parseInt(port),
        secure: port == 465,
        auth: { user: fromEmail, pass: password },
        tls: { rejectUnauthorized: false },
      });

      await transporter.verify();

      const mailOptions = {
        from: fromEmail,
        to: email,
        subject: subject || "No Subject",
        html: body || "",
        attachments: [],
      };
      if (cc) mailOptions.cc = cc;
      if (bcc) mailOptions.bcc = bcc;

      // 📎 Handle attachments with FULL file processing
      if (attachments && attachments.length > 0) {
        console.log(`📎 Processing ${attachments.length} attachment(s)`);
        
        for (const publicId of attachments) {
          try {
            console.log(`🔍 Processing attachment: ${publicId}`);
            
            const resourceType = determineResourceTypeFromPublicId(publicId);
            console.log(`📦 Resource type: ${resourceType}`);
            
            let fileMeta;
            try {
              fileMeta = await cloudinary.api.resource(publicId, {
                resource_type: resourceType,
              });
            } catch (metaError) {
              if (resourceType === 'raw') {
                console.log(`🔄 Retrying with auto resource type...`);
                fileMeta = await cloudinary.api.resource(publicId, {
                  resource_type: 'auto',
                });
              } else {
                throw metaError;
              }
            }

            console.log(`✅ File metadata retrieved:`, {
              original_filename: fileMeta.original_filename,
              format: fileMeta.format,
              bytes: fileMeta.bytes
            });

            const cloudinaryUrl = cloudinary.url(publicId, {
              resource_type: resourceType,
              type: "upload",
              secure: true,
            });

            console.log(`📥 Downloading from: ${cloudinaryUrl}`);
            const fileBuffer = await downloadFile(cloudinaryUrl);
            console.log(`✅ Downloaded file, size: ${fileBuffer.length} bytes`);

            // ✅ Get correct filename with FULL detection logic
            const displayFilename = getCorrectFilename(publicId, fileMeta, fileBuffer);
            const contentType = getMimeType(displayFilename);

            console.log(`📎 Attaching file: ${displayFilename} (${contentType})`);

            mailOptions.attachments.push({
              filename: displayFilename,
              content: fileBuffer,
              contentType,
              contentDisposition: "attachment",
            });

            processedAttachments.set(publicId, resourceType);
            console.log(`✅ Successfully prepared attachment: ${displayFilename}`);
            
          } catch (err) {
            console.error(`❌ Attachment error for ${publicId}:`, err.message);
            console.error(`❌ Full error:`, err);
          }
        }
      }

      console.log(`📤 Sending email with ${mailOptions.attachments.length} attachment(s)`);
      const info = await transporter.sendMail(mailOptions);
      results.push({
        accNo,
        status: "success",
        messageId: info.messageId,
        response: info.response,
        attachmentCount: mailOptions.attachments.length
      });
      console.log(`✅ Email sent successfully to ${email}`);

      transporter.close();
    } catch (err) {
      console.error(`❌ Email error for ${accNo}:`, err.message);
      console.error(`❌ Full error:`, err);
      results.push({ accNo, status: "failed", error: err.message });
    }
  }

  // 🧹 Cleanup attachments from Cloudinary
  if (cleanupAfterSend) {
    console.log(`🧹 Cleaning up ${processedAttachments.size} attachment(s) from Cloudinary...`);
    for (const [publicId, resourceType] of processedAttachments) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        console.log(`🗑️ Cleaned up: ${publicId}`);
      } catch (err) {
        console.error(`⚠️ Cleanup failed for ${publicId}:`, err.message);
      }
    }
  } else {
    console.log(`📌 Skipping cleanup (scheduled email, will cleanup after send)`);
  }

  return results;
}

// ============ SCHEDULE PROCESSOR ============

async function processScheduledEmails() {
  const now = new Date();
  
  for (const [scheduleId, scheduleData] of scheduledEmails.entries()) {
    if (scheduleData.scheduledTime <= now && scheduleData.status === 'pending') {
      console.log(`⏰ Processing scheduled email: ${scheduleId}`);
      console.log(`📎 Attachments to process: ${JSON.stringify(scheduleData.emailData[0]?.attachments)}`);
      
      try {
        scheduleData.status = 'processing';
        
        // Send emails with FULL file processing and cleanup
        const results = await sendEmails(scheduleData.emailData, true);
        
        scheduleData.status = 'completed';
        scheduleData.results = results;
        scheduleData.completedAt = new Date();
        
        console.log(`✅ Scheduled email completed: ${scheduleId}`);
        
        // Remove after 24 hours
        setTimeout(() => {
          scheduledEmails.delete(scheduleId);
          console.log(`🗑️ Removed completed schedule: ${scheduleId}`);
        }, 24 * 60 * 60 * 1000);
        
      } catch (error) {
        console.error(`❌ Scheduled email failed: ${scheduleId}`, error);
        scheduleData.status = 'failed';
        scheduleData.error = error.message;
      }
    }
  }
}

// Start the scheduler (checks every minute)
setInterval(processScheduledEmails, 60 * 1000);

// ============ API ROUTES ============

export async function POST(request) {
  console.log("🚀 Email API started");

  try {
    const body = await request.json();
    
    // 🆕 Check if this is a scheduling request
    if (body.isScheduled === true) {
      console.log("📅 Processing schedule request");
      
      const { scheduleDate, scheduleTime, emailData } = body;
      
      if (!scheduleDate || !scheduleTime || !emailData) {
        return NextResponse.json(
          { success: false, error: "Missing schedule parameters" },
          { status: 400 }
        );
      }

      // Parse the scheduled date/time
      const scheduledDateTime = new Date(`${scheduleDate} ${scheduleTime}`);
      
      if (isNaN(scheduledDateTime.getTime())) {
        return NextResponse.json(
          { success: false, error: "Invalid date/time format" },
          { status: 400 }
        );
      }

      if (scheduledDateTime <= new Date()) {
        return NextResponse.json(
          { success: false, error: "Scheduled time must be in the future" },
          { status: 400 }
        );
      }

      // Generate unique ID for this scheduled email
      const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the scheduled email with ALL data
      scheduledEmails.set(scheduleId, {
        id: scheduleId,
        emailData: emailData, // Contains all email info including attachments array
        scheduledTime: scheduledDateTime,
        createdAt: new Date(),
        status: 'pending',
        recipientCount: emailData.length,
        attachmentCount: emailData[0]?.attachments?.length || 0
      });

      console.log(`✅ Email scheduled for ${scheduledDateTime.toISOString()}`);
      console.log(`📧 Schedule ID: ${scheduleId}`);
      console.log(`👥 Recipients: ${emailData.length}`);
      console.log(`📎 Attachments: ${emailData[0]?.attachments?.length || 0}`);
      console.log(`📎 Attachment IDs: ${JSON.stringify(emailData[0]?.attachments)}`);

      return NextResponse.json({
        success: true,
        scheduled: true,
        scheduleId: scheduleId,
        scheduledTime: scheduledDateTime.toISOString(),
        recipientCount: emailData.length,
        attachmentCount: emailData[0]?.attachments?.length || 0,
        message: `Email scheduled successfully for ${scheduleDate} at ${scheduleTime}`
      });
    }

    // 📧 Handle immediate email sending
    const emailData = body;
    
    if (!Array.isArray(emailData)) {
      return NextResponse.json(
        { success: false, error: "Expected array of email objects" },
        { status: 400 }
      );
    }

    console.log(`📧 Sending immediate email to ${emailData.length} recipient(s)`);
    const results = await sendEmails(emailData, true); // true = cleanup attachments after send

    return NextResponse.json({ success: true, results });
    
  } catch (err) {
    console.error("❌ API Error:", err);
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}

// 🆕 GET endpoint to check scheduled emails
export async function GET(request) {
  const schedules = Array.from(scheduledEmails.values()).map(schedule => ({
    id: schedule.id,
    scheduledTime: schedule.scheduledTime,
    recipientCount: schedule.recipientCount,
    attachmentCount: schedule.attachmentCount,
    status: schedule.status,
    createdAt: schedule.createdAt
  }));

  return NextResponse.json({
    success: true,
    scheduledEmails: schedules,
    count: schedules.length
  });
}