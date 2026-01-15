// server/portal/auth/assign-code/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/db';
import CustomerAccount from '@/app/model/CustomerAccount';

// State abbreviation mapping
const STATE_ABBREVIATIONS = {
  'andhra pradesh': 'AP',
  'arunachal pradesh': 'AR',
  'assam': 'AS',
  'bihar': 'BR',
  'chhattisgarh': 'CG',
  'goa': 'GA',
  'gujarat': 'GJ',
  'haryana': 'HR',
  'himachal pradesh': 'HP',
  'jharkhand': 'JH',
  'karnataka': 'KA',
  'kerala': 'KL',
  'madhya pradesh': 'MP',
  'maharashtra': 'MH',
  'manipur': 'MN',
  'meghalaya': 'ML',
  'mizoram': 'MZ',
  'nagaland': 'NL',
  'odisha': 'OD',
  'punjab': 'PB',
  'rajasthan': 'RJ',
  'sikkim': 'SK',
  'tamil nadu': 'TN',
  'telangana': 'TS',
  'tripura': 'TR',
  'uttar pradesh': 'UP',
  'uttarakhand': 'UK',
  'west bengal': 'WB',
  'andaman and nicobar islands': 'AN',
  'chandigarh': 'CH',
  'dadra and nagar haveli and daman and diu': 'DN',
  'delhi': 'DL',
  'jammu and kashmir': 'JK',
  'ladakh': 'LA',
  'lakshadweep': 'LD',
  'puducherry': 'PY'
};

export async function POST(request) {
  try {
    await connectDB();

    const { state } = await request.json();

    if (!state) {
      return NextResponse.json(
        { success: false, message: 'State is required' },
        { status: 400 }
      );
    }

    // Normalize state name
    const normalizedState = state.trim().toLowerCase();

    // Get state abbreviation
    const stateAbbr = STATE_ABBREVIATIONS[normalizedState];

    if (!stateAbbr) {
      return NextResponse.json(
        { 
          success: false, 
          message: `Invalid state: ${state}. Please provide a valid Indian state or union territory.` 
        },
        { status: 400 }
      );
    }

    console.log('=== Generating Account Code ===');
    console.log('State:', state);
    console.log('State Abbreviation:', stateAbbr);

    // Find all accounts with this state abbreviation prefix
    const stateAccounts = await CustomerAccount.find({
      accountCode: { $regex: `^${stateAbbr}\\d+$` }
    }).sort({ accountCode: 1 });

    console.log('Existing accounts for state:', stateAccounts.length);

    let nextNumber = 1;

    if (stateAccounts.length > 0) {
      // Extract all numbers from account codes
      const accountNumbers = stateAccounts
        .map(account => {
          const match = account.accountCode.match(/^[A-Z]{2}(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => num > 0);

      console.log('Extracted numbers:', accountNumbers);

      if (accountNumbers.length > 0) {
        const maxNumber = Math.max(...accountNumbers);
        nextNumber = maxNumber + 1;
        console.log('Max number:', maxNumber, 'Next number:', nextNumber);
      }
    }

    // Generate new account code with 3-digit padding
    const newAccountCode = `${stateAbbr}${String(nextNumber).padStart(3, '0')}`;

    console.log('Generated account code:', newAccountCode);
    console.log('=== End Generation ===');

    return NextResponse.json({
      success: true,
      accountCode: newAccountCode,
      stateAbbreviation: stateAbbr
    });

  } catch (error) {
    console.error('Error generating account code:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to generate account code',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'Use POST method to generate account codes' },
    { status: 405 }
  );
}