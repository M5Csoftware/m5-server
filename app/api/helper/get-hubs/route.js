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
    console.log('Raw API Response for Hubs:', JSON.stringify(data, null, 2));
    console.log('Data type:', typeof data);
    console.log('Is array:', Array.isArray(data));
    console.log('Fetching hubs from API...');
    
    // Extract hubs and their billingEmailId from the data
    const hubsMap = new Map();
    let objectsProcessed = 0;
    let hubsFound = 0;
    
    // Function to recursively extract all hub values and their emails from any object/array structure
    function extractHubs(obj, path = 'root') {
      if (obj === null || obj === undefined) return;
      
      objectsProcessed++;
      
      if (Array.isArray(obj)) {
        console.log(`Processing array at ${path} with ${obj.length} items`);
        obj.forEach((item, index) => extractHubs(item, `${path}[${index}]`));
      } else if (typeof obj === 'object') {
        // Log all keys in this object
        const keys = Object.keys(obj);
        console.log(`Processing object at ${path} with keys:`, keys);
        
        // Check if this object has a 'hub' property
        if (obj.hasOwnProperty('hub') && obj.hub && typeof obj.hub === 'string') {
          const hubName = obj.hub.trim();
          hubsFound++;
          
          // Try multiple possible email field names
          const billingEmailId = obj.billingEmailId || 
                                obj.billingEmail || 
                                obj.email || 
                                obj.emailAddress || 
                                obj.contactEmail ||
                                obj.billing?.email ||
                                obj.contact?.email ||
                                null;
          
          console.log(`🎯 Found hub: "${hubName}" at ${path}`);
          console.log(`   Available fields:`, Object.keys(obj));
          console.log(`   Email found: ${billingEmailId || 'No email found'}`);
          
          // Store hub with its billingEmailId, avoiding duplicates
          if (!hubsMap.has(hubName)) {
            hubsMap.set(hubName, billingEmailId);
          }
        }
        
        // Recursively check nested objects/arrays
        Object.keys(obj).forEach(key => {
          extractHubs(obj[key], `${path}.${key}`);
        });
      }
    }
    
    // Extract all unique hubs with their emails
    extractHubs(data);
    
    console.log(`\n📊 Processing Summary:`);
    console.log(`Total objects processed: ${objectsProcessed}`);
    console.log(`Hubs found: ${hubsFound}`);
    console.log(`Unique hubs: ${hubsMap.size}`);
    
    // Convert to arrays
    const hubsWithEmails = Array.from(hubsMap.entries()).map(([hub, billingEmailId]) => ({
      hub,
      billingEmailId
    })).sort((a, b) => a.hub.localeCompare(b.hub));
    
    // Extract just the hub names for backward compatibility
    const hubs = hubsWithEmails.map(item => item.hub);
    
    console.log(`\n📋 Final Results:`);
    console.log('Extracted Hubs:', hubs);
    console.log('Hubs with emails:', JSON.stringify(hubsWithEmails, null, 2));

    return NextResponse.json({
      success: true,
      hubs: hubs, // Array of hub names for React compatibility
      hubsWithEmails: hubsWithEmails, // Array of objects with hub and billingEmailId
      count: hubs.length,
      debug: {
        objectsProcessed,
        hubsFound,
        uniqueHubs: hubsMap.size,
        dataStructure: {
          type: typeof data,
          isArray: Array.isArray(data),
          keys: data && typeof data === 'object' ? Object.keys(data) : null,
          length: Array.isArray(data) ? data.length : 'N/A'
        }
      }
    });

  } catch (error) {
    console.error('Error fetching hubs:', error.message);
    console.error('Full error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch hubs',
        message: error.message 
      },
      { status: 500 }
    );
  }
}