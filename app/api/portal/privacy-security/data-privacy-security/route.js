import User from "@/app/model/portal/User";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import axios from "axios";

// Helper function to get device info from headers
async function getDeviceInfo(request, customDeviceName = null) {
  const userAgent = request.headers.get("user-agent") || "";
  const ip = request.headers.get("x-forwarded-for")?.split(',')[0].trim() || 
             request.headers.get("x-real-ip") || 
             "Unknown";
  
  // Extract more detailed device name from User Agent
  let deviceName = "Unknown Device";
  let browser = "Unknown Browser";
  let os = "Unknown OS";
  
  // Detect OS
  if (userAgent.includes("Windows NT 10.0")) os = "Windows 10/11";
  else if (userAgent.includes("Windows NT 6.3")) os = "Windows 8.1";
  else if (userAgent.includes("Windows NT 6.2")) os = "Windows 8";
  else if (userAgent.includes("Windows NT 6.1")) os = "Windows 7";
  else if (userAgent.includes("Mac OS X")) {
    const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
    os = match ? `macOS ${match[1].replace(/_/g, '.')}` : "macOS";
  }
  else if (userAgent.includes("Linux")) os = "Linux";
  else if (userAgent.includes("Android")) {
    const match = userAgent.match(/Android (\d+)/);
    os = match ? `Android ${match[1]}` : "Android";
  }
  else if (userAgent.includes("iPhone")) os = "iOS (iPhone)";
  else if (userAgent.includes("iPad")) os = "iOS (iPad)";
  
  // Detect Browser
  if (userAgent.includes("Edg/")) browser = "Edge";
  else if (userAgent.includes("Chrome/") && !userAgent.includes("Edg")) browser = "Chrome";
  else if (userAgent.includes("Firefox/")) browser = "Firefox";
  else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome")) browser = "Safari";
  else if (userAgent.includes("Opera/") || userAgent.includes("OPR/")) browser = "Opera";
  
  // Build device name with custom name if available
  if (customDeviceName && customDeviceName !== "Unknown PC" && customDeviceName !== "My Device") {
    deviceName = customDeviceName;
  } else {
    deviceName = `${browser} on ${os}`;
  }
  
  // Get location from IP
  let location = "Unknown";
  try {
    if (ip !== "Unknown" && ip !== "127.0.0.1" && !ip.startsWith("192.168") && !ip.startsWith("::1")) {
      // Using ipapi.co for geolocation (free, no API key needed)
      const geoResponse = await axios.get(`https://ipapi.co/${ip}/json/`, {
        timeout: 3000
      });
      
      if (geoResponse.data && geoResponse.data.city && geoResponse.data.country_name) {
        const city = geoResponse.data.city;
        const region = geoResponse.data.region;
        const country = geoResponse.data.country_name;
        const postal = geoResponse.data.postal || "";
        
        location = postal ? `${postal} - ${city} - ${country}` : `${city}, ${region} - ${country}`;
      }
    } else {
      location = "Local Network";
    }
  } catch (error) {
    console.log("Error fetching location:", error.message);
    location = "Location unavailable";
  }
  
  return { deviceName, ip, userAgent, location, browser, os };
}

// GET - Fetch device history
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get("accountCode");
    const customDeviceName = searchParams.get("deviceName");

    console.log("=== GET Device History ===");
    console.log("Account Code:", accountCode);
    console.log("Custom Device Name:", customDeviceName);

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    const user = await User.findOne({ accountCode }).select("deviceHistory");

    if (!user) {
      console.log("User not found for accountCode:", accountCode);
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    console.log("User found:", user.emailId || user.fullName);
    console.log("Existing device history count:", user.deviceHistory?.length || 0);

    // Get current device info
    const currentDevice = await getDeviceInfo(request, customDeviceName);
    console.log("Current Device Info:", currentDevice);
    
    let deviceHistory = user.deviceHistory || [];
    console.log("Device History Before Update:", deviceHistory);

    // Check if current device exists in history
    const currentDeviceExists = deviceHistory.some(
      (device) => device.userAgent === currentDevice.userAgent && device.ip === currentDevice.ip
    );

    console.log("Current device exists in history:", currentDeviceExists);

    // If current device doesn't exist, add it
    if (!currentDeviceExists) {
      const newDevice = {
        deviceName: currentDevice.deviceName,
        ip: currentDevice.ip,
        userAgent: currentDevice.userAgent,
        location: currentDevice.location,
        browser: currentDevice.browser,
        os: currentDevice.os,
        lastSeen: new Date(),
        sessionId: Date.now().toString(),
      };
      
      console.log("Adding new device:", newDevice);
      
      if (!user.deviceHistory) {
        user.deviceHistory = [];
      }
      
      user.deviceHistory.push(newDevice);
      user.markModified('deviceHistory');
      await user.save();
      console.log("Device saved successfully");
    } else {
      // Update last seen for current device
      const deviceIndex = deviceHistory.findIndex(
        (device) => device.userAgent === currentDevice.userAgent && device.ip === currentDevice.ip
      );
      
      if (deviceIndex !== -1) {
        console.log("Updating last seen for device at index:", deviceIndex);
        user.deviceHistory[deviceIndex].lastSeen = new Date();
        user.markModified('deviceHistory');
        await user.save();
        console.log("Last seen updated successfully");
      }
    }

    // Fetch updated device history
    const updatedUser = await User.findOne({ accountCode }).select("deviceHistory");
    console.log("Final device history count:", updatedUser.deviceHistory?.length || 0);
    console.log("Final device history:", updatedUser.deviceHistory);

    return NextResponse.json({
      success: true,
      data: {
        deviceHistory: updatedUser.deviceHistory || [],
        currentDevice
      },
    });

  } catch (error) {
    console.error("Error fetching device history:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Update password or track device login
export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { accountCode, currentPassword, newPassword, action } = body;

    console.log("=== POST Request ===");
    console.log("Action:", action);
    console.log("Account Code:", accountCode);

    if (!accountCode) {
      return NextResponse.json(
        { success: false, message: "Account code is required" },
        { status: 400 }
      );
    }

    const user = await User.findOne({ accountCode });

    if (!user) {
      console.log("User not found for accountCode:", accountCode);
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    console.log("User found:", user.emailId || user.fullName);

    // Handle password update
    if (action === "updatePassword") {
      console.log("Processing password update...");
      
      if (!currentPassword || !newPassword) {
        return NextResponse.json(
          { success: false, message: "Current password and new password are required" },
          { status: 400 }
        );
      }

      console.log("Current password from DB:", user.password);
      console.log("Current password from request:", currentPassword);

      // Verify current password (plain text comparison)
      if (user.password !== currentPassword) {
        console.log("Password mismatch!");
        return NextResponse.json(
          { success: false, message: "Current password is incorrect" },
          { status: 400 }
        );
      }

      // Update password (store as plain text)
      user.password = newPassword;
      await user.save();
      console.log("Password updated successfully");

      return NextResponse.json({
        success: true,
        message: "Password updated successfully",
      });
    }

    // Handle device login tracking
    if (action === "trackLogin") {
      console.log("Processing device login tracking...");
      
      const { deviceName: customDeviceName } = body;
      const deviceInfo = await getDeviceInfo(request, customDeviceName);
      console.log("Device Info:", deviceInfo);
      
      if (!user.deviceHistory) {
        user.deviceHistory = [];
      }

      // Check if device already exists
      const existingDeviceIndex = user.deviceHistory.findIndex(
        (device) => device.userAgent === deviceInfo.userAgent && device.ip === deviceInfo.ip
      );

      console.log("Existing device index:", existingDeviceIndex);

      if (existingDeviceIndex !== -1) {
        // Update last seen
        console.log("Updating last seen for existing device");
        user.deviceHistory[existingDeviceIndex].lastSeen = new Date();
      } else {
        // Add new device
        console.log("Adding new device to history");
        user.deviceHistory.push({
          deviceName: deviceInfo.deviceName,
          ip: deviceInfo.ip,
          userAgent: deviceInfo.userAgent,
          location: deviceInfo.location,
          browser: deviceInfo.browser,
          os: deviceInfo.os,
          lastSeen: new Date(),
          sessionId: Date.now().toString(),
        });
      }

      await user.save();
      console.log("Device history updated. Total devices:", user.deviceHistory.length);

      return NextResponse.json({
        success: true,
        message: "Device login tracked",
      });
    }

    return NextResponse.json(
      { success: false, message: "Invalid action" },
      { status: 400 }
    );

  } catch (error) {
    console.error("Error in POST request:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Logout from specific device
export async function DELETE(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get("accountCode");
    const sessionId = searchParams.get("sessionId");

    console.log("=== DELETE Device ===");
    console.log("Account Code:", accountCode);
    console.log("Session ID to delete:", sessionId);

    if (!accountCode || !sessionId) {
      return NextResponse.json(
        { success: false, message: "Account code and session ID are required" },
        { status: 400 }
      );
    }

    const user = await User.findOne({ accountCode });

    if (!user) {
      console.log("User not found for accountCode:", accountCode);
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    console.log("User found:", user.emailId || user.fullName);
    console.log("Device history before deletion:", user.deviceHistory?.length || 0);

    // Remove device from history
    const beforeCount = user.deviceHistory?.length || 0;
    user.deviceHistory = user.deviceHistory.filter(
      (device) => device.sessionId !== sessionId
    );
    const afterCount = user.deviceHistory?.length || 0;

    console.log("Devices removed:", beforeCount - afterCount);
    console.log("Device history after deletion:", afterCount);

    await user.save();
    console.log("Device logout successful");

    return NextResponse.json({
      success: true,
      message: "Device logged out successfully",
    });

  } catch (error) {
    console.error("Error logging out device:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}