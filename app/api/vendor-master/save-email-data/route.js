import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/db';
import Vendor from '@/app/model/Vendor';

export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { 
      code,
      ssl, 
      smtp, 
      portNo, 
      from, 
      email, 
      password, 
      cc, 
      bcc 
    } = body;

    // Validate vendor code
    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Vendor code is required' },
        { status: 400 }
      );
    }

    // Find vendor by code
    const vendor = await Vendor.findOne({ code });

    if (!vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found. Please save vendor details first.' },
        { status: 404 }
      );
    }

    // Update email settings
    vendor.ssl = ssl === 'true' || ssl === true || false;
    vendor.smtp = smtp || vendor.smtp;
    vendor.portNo = portNo ? parseInt(portNo) : vendor.portNo;
    vendor.from = from || vendor.from;
    vendor.email = email || vendor.email;
    vendor.password = password || vendor.password;
    vendor.cc = cc || vendor.cc;
    vendor.bcc = bcc || vendor.bcc;

    // Save updated vendor
    await vendor.save();

    return NextResponse.json({
      success: true,
      message: 'Email settings saved successfully',
      data: {
        code: vendor.code,
        emailSettings: {
          ssl: vendor.ssl,
          smtp: vendor.smtp,
          portNo: vendor.portNo,
          from: vendor.from,
          email: vendor.email,
          cc: vendor.cc,
          bcc: vendor.bcc,
        }
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Email settings save error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to save email settings',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch email settings for a vendor
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Vendor code is required' },
        { status: 400 }
      );
    }

    const vendor = await Vendor.findOne({ code });

    if (!vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ssl: vendor.ssl,
        smtp: vendor.smtp,
        portNo: vendor.portNo,
        from: vendor.from,
        email: vendor.email,
        cc: vendor.cc,
        bcc: vendor.bcc,
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Fetch email settings error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch email settings',
        details: error.message 
      },
      { status: 500 }
    );
  }
}