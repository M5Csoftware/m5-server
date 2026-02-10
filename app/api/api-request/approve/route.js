import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import APIRequest from "@/app/model/portal/APIRequest";
import ApiKey from "@/app/model/portal/ApiKey";
import nodemailer from "nodemailer";
import {generateApiKeyWithMetadata} from "@/app/lib/Apikeyutils";

await connectDB();

// Email transporter configuration
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "harmanjeet.singh@iic.ac.in",
    pass: "twmy flrf saih grnq",
  },
});

// API list mapping (same as in AccountDetails)
const API_LIST = [
  { name: "Track Shipment", method: "Get", endpoint: "/v1/track" },
  { name: "Create Shipment", method: "Post", endpoint: "/v1/shipments" },
  { name: "Cancel Shipment", method: "Delete", endpoint: "/v1/shipments/{id}" },
  { name: "Get Rate", method: "Get", endpoint: "/v1/rates" },
  { name: "Update Shipment", method: "Put", endpoint: "/v1/shipments/{id}" },
  { name: "Create Manifest", method: "Post", endpoint: "/v1/manifest/create" },
  { name: "Dispatch Manifest", method: "Put", endpoint: "/v1/manifest/dispatch" },
  { name: "Get Invoice", method: "Get", endpoint: "/v1/invoices" },
];

// Function to send approval email with secure API key
async function sendApprovalEmail(to, customerName, apiKey, useCases) {
  try {
    // Convert useCases to array
    let useCasesArray = [];
    if (Array.isArray(useCases)) {
      useCasesArray = useCases;
    } else if (typeof useCases === "string") {
      try {
        const parsed = JSON.parse(useCases);
        if (Array.isArray(parsed)) {
          useCasesArray = parsed;
        } else {
          useCasesArray = [useCases];
        }
      } catch (e) {
        if (useCases.includes(",")) {
          useCasesArray = useCases.split(",").map((item) => item.trim());
        } else {
          useCasesArray = [useCases];
        }
      }
    }

    const baseUrl = process.env.NEXTAUTH_URL || "https://your-api-base-url.com";

    const mailOptions = {
      from: '"Logistics API Team" <harmanjeet.singh@iic.ac.in>',
      to: to,
      subject: "🎉 Your API Access Has Been Approved!",
      html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
                        .header { background: #EA1B40; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #ddd; }
                        .api-key-box { background: #ffffff; border: 2px solid #EA1B40; padding: 20px; border-radius: 8px; margin: 20px 0; }
                        .api-key { background: #f0f0f0; padding: 15px; border-left: 4px solid #EA1B40; font-family: 'Courier New', monospace; font-size: 14px; margin: 10px 0; word-break: break-all; font-weight: bold; }
                        .warning { background: #fff3cd; border: 2px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0; }
                        .security-tips { background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                        .steps { margin: 20px 0; padding-left: 20px; }
                        .steps li { margin-bottom: 10px; }
                        .code-block { background: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 13px; overflow-x: auto; }
                        .endpoint { background: #f5f5f5; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 12px; margin: 5px 0; }
                        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                        th { background-color: #f5f5f5; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>🎉 API Access Approved!</h1>
                    </div>
                    <div class="content">
                        <h2>Dear ${customerName},</h2>
                        <p>Great news! Your API access request has been approved by our team.</p>
                        
                        <div class="api-key-box">
                            <h3 style="margin-top: 0; color: #EA1B40;">🔑 Your Secure API Key</h3>
                            <p style="margin: 5px 0; font-size: 12px; color: #666;">This is your unique API key. Keep it secure and never share it publicly.</p>
                            <div class="api-key">${apiKey}</div>
                            <p style="margin: 10px 0 0 0; font-size: 11px; color: #999;">
                                ⚠️ This key will only be shown once. Please save it securely now.
                            </p>
                        </div>
                        
                        <div class="warning">
                            <strong>🔒 CRITICAL SECURITY NOTICE:</strong><br>
                            <ul style="margin: 10px 0; padding-left: 20px;">
                                <li><strong>Never share your API key</strong> with anyone</li>
                                <li><strong>Never commit it</strong> to version control (Git, GitHub, etc.)</li>
                                <li><strong>Never expose it</strong> in client-side code or public repositories</li>
                                <li><strong>Use environment variables</strong> to store it securely</li>
                                <li><strong>Rotate keys regularly</strong> for enhanced security</li>
                                <li><strong>Monitor usage</strong> for any unauthorized activity</li>
                            </ul>
                        </div>
                        
                        <h3>✅ Approved API Endpoints:</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>API Name</th>
                                    <th>Method</th>
                                    <th>Endpoint</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${useCasesArray
                                  .map((useCase) => {
                                    const api = API_LIST.find(
                                      (a) => a.name === useCase,
                                    );
                                    if (api) {
                                      return `
                                            <tr>
                                                <td>${api.name}</td>
                                                <td><code>${api.method}</code></td>
                                                <td><code>${api.endpoint}</code></td>
                                            </tr>
                                        `;
                                    }
                                    return "";
                                  })
                                  .join("")}
                            </tbody>
                        </table>
                        
                        <h3>🚀 Getting Started:</h3>
                        <ol class="steps">
                            <li><strong>Save your API key</strong> in a secure location (password manager, encrypted file)</li>
                            <li><strong>Set up authentication</strong> by including the key in your API requests</li>
                            <li><strong>Test your integration</strong> using our sandbox environment</li>
                            <li><strong>Review our documentation</strong> for detailed API specifications</li>
                            <li><strong>Start building!</strong> Integrate our APIs into your application</li>
                        </ol>
                        
                        <h3>📡 API Configuration:</h3>
                        <div class="endpoint">
                            <strong>Base URL:</strong> ${baseUrl}/api
                        </div>
                        
                        <h3>🔧 Authentication Example:</h3>
                        <div class="code-block">
// Using cURL
curl -X GET "${baseUrl}/api/v1/track?awb=123456" \\
  -H "X-API-Key: YOUR_API_KEY"

// Using JavaScript (fetch)
fetch('${baseUrl}/api/v1/track?awb=123456', {
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));

// Using Python (requests)
import requests

headers = {
    'X-API-Key': 'YOUR_API_KEY'
}
response = requests.get(
    '${baseUrl}/api/v1/track?awb=123456',
    headers=headers
)
data = response.json()
                        </div>
                        
                        <div class="security-tips">
                            <strong>💡 Best Practices:</strong>
                            <ul style="margin: 10px 0; padding-left: 20px;">
                                <li>Store the API key in environment variables (<code>.env</code> file)</li>
                                <li>Use HTTPS for all API requests</li>
                                <li>Implement rate limiting on your end</li>
                                <li>Log API usage for monitoring</li>
                                <li>Regenerate your key if you suspect it's been compromised</li>
                            </ul>
                        </div>
                        
                        <h3>📊 Rate Limits:</h3>
                        <ul>
                            <li><strong>Hourly Limit:</strong> 1,000 requests</li>
                            <li><strong>Daily Limit:</strong> 10,000 requests</li>
                        </ul>
                        
                        <h3>🆘 Need Help?</h3>
                        <p>
                            If you have any questions or need assistance with integration, please contact our support team:
                            <br>
                            📧 Email: api-support@logistics.com
                            <br>
                            📚 Documentation: ${baseUrl}/docs
                        </p>
                        
                        <p style="margin-top: 30px;">
                            Best regards,<br>
                            <strong>Logistics API Team</strong>
                        </p>
                    </div>
                    <div class="footer">
                        <p>This is an automated message. Please do not reply to this email.</p>
                        <p>If you didn't request API access, please contact our support team immediately.</p>
                        <p style="margin-top: 10px; font-size: 10px;">
                            © ${new Date().getFullYear()} Logistics Platform. All rights reserved.
                        </p>
                    </div>
                </body>
                </html>
            `,
      text: `
Dear ${customerName},

Great news! Your API access request has been approved by our team.

🔑 YOUR SECURE API KEY
${apiKey}

⚠️ This key will only be shown once. Please save it securely now.

🔒 CRITICAL SECURITY NOTICE:
• Never share your API key with anyone
• Never commit it to version control (Git, GitHub, etc.)
• Never expose it in client-side code or public repositories
• Use environment variables to store it securely
• Rotate keys regularly for enhanced security
• Monitor usage for any unauthorized activity

✅ APPROVED API ENDPOINTS:
${useCasesArray
  .map((useCase) => {
    const api = API_LIST.find((a) => a.name === useCase);
    return api ? `• ${api.name} (${api.method} ${api.endpoint})` : "";
  })
  .join("\n")}

🚀 GETTING STARTED:
1. Save your API key in a secure location
2. Set up authentication by including the key in your API requests
3. Test your integration using our sandbox environment
4. Review our documentation for detailed API specifications
5. Start building! Integrate our APIs into your application

📡 API CONFIGURATION:
Base URL: ${baseUrl}/api

🔧 AUTHENTICATION EXAMPLE:
curl -X GET "${baseUrl}/api/v1/track?awb=123456" \\
  -H "X-API-Key: YOUR_API_KEY"

📊 RATE LIMITS:
• Hourly Limit: 1,000 requests
• Daily Limit: 10,000 requests

🆘 NEED HELP?
Email: api-support@logistics.com
Documentation: ${baseUrl}/docs

Best regards,
Logistics API Team

---
This is an automated message. Please do not reply to this email.
If you didn't request API access, please contact our support team immediately.
            `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Approval email sent to ${to}`);
    return true;
  } catch (error) {
    console.error("Error sending approval email:", error);
    return false;
  }
}

export async function PATCH(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // Find the API request
    const apiRequest = await APIRequest.findById(id);
    if (!apiRequest) {
      return NextResponse.json(
        { error: "API request not found" },
        { status: 404 },
      );
    }

    // Check if already approved
    if (apiRequest.Status === "approved") {
      return NextResponse.json(
        {
          error: "This request has already been approved",
          message: "API key was already generated for this request",
        },
        { status: 400 },
      );
    }

    // Generate secure API key
    const { plainTextKey, hashedKey, keyPrefix, maskedKey } =
      generateApiKeyWithMetadata(apiRequest.customerCode, "production");

    // Map approved use cases to API endpoints
    let useCasesArray = [];
    if (Array.isArray(apiRequest.apiUseCase)) {
      useCasesArray = apiRequest.apiUseCase;
    } else if (typeof apiRequest.apiUseCase === "string") {
      try {
        const parsed = JSON.parse(apiRequest.apiUseCase);
        if (Array.isArray(parsed)) {
          useCasesArray = parsed;
        } else {
          useCasesArray = [apiRequest.apiUseCase];
        }
      } catch (e) {
        if (apiRequest.apiUseCase.includes(",")) {
          useCasesArray = apiRequest.apiUseCase
            .split(",")
            .map((item) => item.trim());
        } else {
          useCasesArray = [apiRequest.apiUseCase];
        }
      }
    }

    // Map use cases to allowed APIs
    const allowedApis = useCasesArray
      .map((useCase) => API_LIST.find((api) => api.name === useCase))
      .filter((api) => api !== undefined);

    // Create ApiKey record with hashed key
    const apiKeyRecord = await ApiKey.create({
      apiRequestId: apiRequest._id,
      customerCode: apiRequest.customerCode,
      customerName: apiRequest.customerName,
      email: apiRequest.email,
      hashedKey: hashedKey,
      keyPrefix: keyPrefix,
      allowedApis: allowedApis,
      status: "active",
      rateLimit: {
        requestsPerHour: 1000,
        requestsPerDay: 10000,
      },
      usage: {
        totalRequests: 0,
        requestsThisHour: 0,
        requestsToday: 0,
        hourlyResetAt: new Date(Date.now() + 60 * 60 * 1000),
        dailyResetAt: (() => {
          const tomorrow = new Date();
          tomorrow.setHours(24, 0, 0, 0);
          return tomorrow;
        })(),
      },
      environment: "production",
      expiresAt: null, // No expiration by default
    });

    // Update API request with masked key for display
    const updatedRequest = await APIRequest.findByIdAndUpdate(
      id,
      {
        Status: "approved",
        apiKey: maskedKey, // Store masked version in APIRequest
        approvedAt: new Date(),
      },
      { new: true },
    );

    // Send approval email with plain text key
    const emailSent = await sendApprovalEmail(
      apiRequest.email,
      apiRequest.customerName,
      plainTextKey, // Send the actual key to customer
      useCasesArray,
    );

    return NextResponse.json(
      {
        message: "API request approved successfully",
        data: {
          ...updatedRequest.toObject(),
          apiKey: plainTextKey, // Return plain key in response (only this once)
        },
        emailSent: emailSent,
        emailSentTo: apiRequest.email,
        apiKeyRecord: {
          id: apiKeyRecord._id,
          keyPrefix: apiKeyRecord.keyPrefix,
          status: apiKeyRecord.status,
          allowedApis: apiKeyRecord.allowedApis,
        },
        security: {
          note: "The API key has been sent to the customer's email. This is the only time the plain text key will be available.",
          maskedKey: maskedKey,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("APPROVE Error:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error.message,
      },
      { status: 500 },
    );
  }
}