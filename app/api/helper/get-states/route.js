import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  try {
    const response = await axios.get('https://m5c-server.vercel.app/api/customer-account', {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = response.data;
    console.log('Fetching states from API...');
    
    // Extract states and their billingEmailId from the data
    const statesMap = new Map();
    
    // Function to recursively find all 'state' values with their corresponding billingEmailId
    function findStates(obj) {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        obj.forEach(item => findStates(item));
      } else {
        // Check if this object has a 'state' property
        if (obj.hasOwnProperty('state') && obj.state && typeof obj.state === 'string') {
          const stateName = obj.state.trim();
          const billingEmailId = obj.billingEmailId || null;
          
          // Store state with its billingEmailId, avoiding duplicates
          if (!statesMap.has(stateName)) {
            statesMap.set(stateName, billingEmailId);
          }
        }
        
        // Recursively check all nested objects
        Object.values(obj).forEach(value => findStates(value));
      }
    }
    
    // Start the recursive search
    findStates(data);
    
    // Convert Map to Array of objects and sort by state name
    const statesWithEmails = Array.from(statesMap.entries()).map(([state, billingEmailId]) => ({
      state,
      billingEmailId
    })).sort((a, b) => a.state.localeCompare(b.state));
    
    // Extract just the state names for backward compatibility
    const statesArray = statesWithEmails.map(item => item.state);
    
    console.log(`Found ${statesArray.length} unique states:`, statesArray);
    console.log('States with emails:', statesWithEmails);

    return NextResponse.json({
      success: true,
      states: statesArray, // Array of state names for React compatibility
      statesWithEmails: statesWithEmails, // Array of objects with state and billingEmailId
      count: statesArray.length
    });

  } catch (error) {
    console.error('Error fetching states:', error.message);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch states',
        message: error.message 
      },
      { status: 500 }
    );
  }
}