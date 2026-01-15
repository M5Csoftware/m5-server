import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import RunEntry from "@/app/model/RunEntry";
import Bagging from "@/app/model/bagging";
import RunProcess from "@/app/model/RunProcess";

export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const hub = searchParams.get("hub");
    
    // Parse date (format: YYYY-MM-DD)
    const selectedDate = new Date(date);
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Build filter for RunEntry
    const runEntryFilter = {
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    };

    // Add hub filter if provided
    if (hub && hub !== "All") {
      runEntryFilter.hub = hub;
    }

    // Get run entries for the selected date
    const runEntries = await RunEntry.find(runEntryFilter);

    // Get run numbers from entries
    const runNumbers = runEntries.map(entry => entry.runNo);

    // Get bagging data for these run numbers
    const baggingData = await Bagging.find({ 
      runNo: { $in: runNumbers },
      isFinal: true 
    });

    // Get run process data to check pre-alert status
    const runProcessData = await RunProcess.find({ 
      runNo: { $in: runNumbers } 
    });

    // Create a map for quick lookup
    const runProcessMap = {};
    runProcessData.forEach(process => {
      runProcessMap[process.runNo] = process;
    });

    // Combine data
    const result = runEntries.map(entry => {
      const bagging = baggingData.find(b => b.runNo === entry.runNo);
      const runProcess = runProcessMap[entry.runNo];
      
      // Check if pre-alert is sent (if run process has any status beyond "Run Created")
      const hasPreAlert = runProcess && 
        runProcess.statusHistory && 
        runProcess.statusHistory.some(history => 
          history.status !== "Run Created"
        );

      return {
        flightDate: entry.date ? new Date(entry.date).toLocaleDateString() : "N/A",
        runNumber: entry.runNo || "N/A",
        sector: entry.sector || "N/A",
        bag: bagging ? bagging.noOfBags || 0 : 0,
        weight: bagging ? bagging.runWeight || 0 : 0,
        preAlert: hasPreAlert ? "Sent" : "Pending"
      };
    });

    return NextResponse.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("Error fetching run handover data:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch run handover data: " + error.message },
      { status: 500 }
    );
  }
}