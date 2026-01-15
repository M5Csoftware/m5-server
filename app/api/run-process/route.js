import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import RunProcess from "@/app/model/RunProcess";
import RunEntry from "@/app/model/RunEntry";
import Bagging from "@/app/model/bagging";
import EventActivity from "@/app/model/EventActivity";
import Employee from "@/app/model/Employee";

// Helper function to determine step number - FIXED ORDER
const getStepNumber = (status) => {
  const stepMap = {
    "Run Created": 0,
    "Advanced Bagging": 1,
    "Bagging and Clubbing": 2,
    "Handover": 3,
    "Offloaded": 4,
    "Departed": 5,
    "Pre-Alert": 6,
    "Arrived at Destination": 7,
    "Custom Clearance": 8,
    "CP": 9,
  };
  return stepMap[status] !== undefined ? stepMap[status] : 0;
};

// Helper function to get employee details from EventActivity for specific statuses
const getEmployeeFromEventActivity = async (awbNumbers, statusPattern, defaultEmployee) => {
  try {
    const event = await EventActivity.findOne({
      awbNo: { $in: awbNumbers },
      status: { $elemMatch: { $regex: statusPattern } }
    }).sort({ date: -1 });

    if (event && event.employeeID) {
      const employee = await Employee.findOne({ userId: event.employeeID });
      if (employee) {
        return {
          employeeID: employee.userId,
          department: employee.department || "N/A"
        };
      }
    }
    return defaultEmployee;
  } catch (error) {
    console.error("Error getting employee from EventActivity:", error);
    return defaultEmployee;
  }
};

// Helper function to check if status can progress
const canProgressToStatus = async (runNo, targetStatus) => {
  try {
    const runEntry = await RunEntry.findOne({ runNo });
    if (!runEntry) {
      return { allowed: false, message: "Run number not found in Run Entry" };
    }

    // Run Created - always allow if run exists
    if (targetStatus === "Run Created") {
      return { allowed: true, message: "Run Created status updated" };
    }

    // Advanced Bagging check
    if (targetStatus === "Advanced Bagging") {
      const bagging = await Bagging.findOne({ runNo, isFinal: true });
      if (!bagging) {
        return { allowed: false, message: "Bagging not finalized for this run" };
      }
      return { allowed: true, message: "Advanced Bagging status updated" };
    }

    // Bagging and Clubbing check
    if (targetStatus === "Bagging and Clubbing") {
      const bagging = await Bagging.findOne({ runNo, isFinal: true });
      if (!bagging) {
        return { allowed: false, message: "Bagging not finalized for this run" };
      }
      return { allowed: true, message: "Bagging and Clubbing completed" };
    }

    // Handover is manual - always allow
    if (targetStatus === "Handover") {
      return { allowed: true, message: "Handover status updated" };
    }

    // Offloaded check
    if (targetStatus === "Offloaded") {
      const bagging = await Bagging.findOne({ runNo });
      
      if (!bagging || !bagging.rowData || bagging.rowData.length === 0) {
        return { allowed: true, message: "Offloaded status updated manually" };
      }

      const awbNumbers = [
        ...new Set(
          bagging.rowData
            .map(item => item.awbNo || item.childShipment)
            .filter(Boolean)
        )
      ];

      const offloadedEvent = await EventActivity.findOne({
        awbNo: { $in: awbNumbers },
        status: { $elemMatch: { $regex: /offload/i } }
      });
      
      if (offloadedEvent) {
        return { allowed: true, message: "Offloaded confirmed from Event Activity" };
      }
      
      return { allowed: true, message: "Offloaded status updated manually" };
    }

    // Departed is manual - always allow
    if (targetStatus === "Departed") {
      return { allowed: true, message: "Departed status updated" };
    }

    // Pre-Alert is manual - always allow
    if (targetStatus === "Pre-Alert") {
      return { allowed: true, message: "Pre-Alert status updated" };
    }

    // Arrived at Destination check
    if (targetStatus === "Arrived at Destination") {
      const bagging = await Bagging.findOne({ runNo });
      if (!bagging || !bagging.rowData || bagging.rowData.length === 0) {
        return { allowed: false, message: "No AWBs found for this run" };
      }

      const awbNumbers = [
        ...new Set(
          bagging.rowData
            .map(item => item.awbNo || item.childShipment)
            .filter(Boolean)
        )
      ];

      const arrivedEvent = await EventActivity.findOne({
        awbNo: { $in: awbNumbers },
        status: { $elemMatch: { $regex: /arrived.*destination/i } }
      });
      
      if (arrivedEvent) {
        return { allowed: true, message: "Arrived at Destination confirmed" };
      }
      
      return { allowed: true, message: "Arrived at Destination status updated manually" };
    }

    // Custom Clearance check
    if (targetStatus === "Custom Clearance") {
      const bagging = await Bagging.findOne({ runNo });
      if (!bagging || !bagging.rowData || bagging.rowData.length === 0) {
        return { allowed: false, message: "No AWBs found for this run" };
      }

      const awbNumbers = [
        ...new Set(
          bagging.rowData
            .map(item => item.awbNo || item.childShipment)
            .filter(Boolean)
        )
      ];

      const clearanceEvent = await EventActivity.findOne({
        awbNo: { $in: awbNumbers },
        status: { $elemMatch: { $regex: /custom.*clearance/i } }
      });
      
      if (clearanceEvent) {
        return { allowed: true, message: "Custom Clearance confirmed" };
      }
      
      return { allowed: true, message: "Custom Clearance status updated manually" };
    }

    // CP is manual
    if (targetStatus === "CP") {
      return { allowed: true, message: "CP status updated" };
    }

    return { allowed: true, message: "Status updated" };
  } catch (error) {
    console.error("Error checking status progression:", error);
    return { allowed: false, message: "Error validating status: " + error.message };
  }
};

// GET - Fetch run process history
export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const runNo = searchParams.get("runNo");
    const checkAutoStatuses = searchParams.get("check-auto-statuses");
    const userId = searchParams.get("userId");

    if (checkAutoStatuses === "true" && runNo) {
      return await handleAutoStatusCheck(runNo, userId);
    }

    if (runNo) {
      const runEntry = await RunEntry.findOne({ runNo });
      if (!runEntry) {
        return NextResponse.json({
          success: false,
          message: "Run number not found in Run Entry",
          data: [],
          currentStep: 0,
        });
      }

      // Find the run process document for this runNo
      const runProcess = await RunProcess.findOne({ runNo });
      
      if (!runProcess) {
        return NextResponse.json({
          success: true,
          data: [],
          currentStep: 0,
        });
      }

      // Format the status history for display in table
      const enrichedHistory = await Promise.all(
        runProcess.statusHistory.map(async (item) => {
          const employee = await Employee.findOne({ userId: item.employeeID });
          return {
            _id: item._id,
            runNo: runProcess.runNo,
            date: new Date(item.date).toLocaleDateString() + ' ' + new Date(item.date).toLocaleTimeString(),
            status: item.status,
            employeeID: item.employeeID,
            employeeName: employee ? employee.userName : item.employeeID,
            department: item.department,
            stepNumber: item.stepNumber,
          };
        })
      );

      // Sort by date descending (most recent first)
      enrichedHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      const currentStep = runProcess.currentStepNumber || 0;
      
      console.log(`=== RUN PROCESS DEBUG ===`);
      console.log(`RunNo: ${runNo}`);
      console.log(`Status History count: ${runProcess.statusHistory.length}`);
      console.log(`Current Status: "${runProcess.currentStatus}"`);
      console.log(`Current Step: ${currentStep}`);
      console.log(`========================`);
      
      return NextResponse.json({
        success: true,
        data: enrichedHistory,
        currentStep: currentStep,
        currentStatus: runProcess.currentStatus,
      });
    }

    // Get all run processes
    const allProcesses = await RunProcess.find();
    
    const enrichedProcesses = [];
    for (const process of allProcesses) {
      for (const historyItem of process.statusHistory) {
        const employee = await Employee.findOne({ userId: historyItem.employeeID });
        
        // Format date properly
        let formattedDate = 'N/A';
        if (historyItem.date) {
          try {
            const dateObj = new Date(historyItem.date);
            if (!isNaN(dateObj.getTime())) {
              formattedDate = dateObj.toLocaleDateString('en-IN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              }) + ' ' + dateObj.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
              });
            }
          } catch (error) {
            console.error('Error formatting date:', error);
          }
        }
        
        enrichedProcesses.push({
          _id: historyItem._id,
          runNo: process.runNo,
          date: formattedDate,
          status: historyItem.status,
          employeeID: historyItem.employeeID,
          employeeName: employee ? employee.userName : historyItem.employeeID,
          department: historyItem.department,
          stepNumber: historyItem.stepNumber,
        });
      }
    }
    
    // Sort by date descending
    enrichedProcesses.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return NextResponse.json({
      success: true,
      data: enrichedProcesses,
    });
  } catch (error) {
    console.error("Error fetching run process:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch run process data: " + error.message },
      { status: 500 }
    );
  }
}

// Helper function to check and auto-update statuses
async function handleAutoStatusCheck(runNo, userId) {
  try {
    let autoUpdated = false;
    let messages = [];

    const runEntry = await RunEntry.findOne({ runNo });
    if (!runEntry) {
      return NextResponse.json({
        success: false,
        message: "Run number not found in Run Entry",
        autoUpdated: false,
      });
    }

    let defaultEmployeeID = userId;
    let defaultDepartment = "N/A";

    if (userId) {
      const employee = await Employee.findOne({ userId: userId });
      if (employee) {
        defaultEmployeeID = employee.userId;
        defaultDepartment = employee.department || "N/A";
      }
    }

    const defaultEmployee = {
      employeeID: defaultEmployeeID,
      department: defaultDepartment
    };

    // Get existing run process document
    let runProcess = await RunProcess.findOne({ runNo });
    const existingStatuses = runProcess ? runProcess.statusHistory.map(s => s.status) : [];

    const bagging = await Bagging.findOne({ runNo });
    let awbNumbers = [];
    
    if (bagging && bagging.rowData && bagging.rowData.length > 0) {
      awbNumbers = [
        ...new Set(
          bagging.rowData
            .map(item => item.awbNo || item.childShipment)
            .filter(Boolean)
        )
      ];
    }

    // Check for Advanced Bagging auto-completion
    if (!existingStatuses.includes("Advanced Bagging")) {
      const advancedBagging = await Bagging.findOne({ runNo, isFinal: true });
      
      if (advancedBagging) {
        let employeeID = defaultEmployeeID;
        let department = defaultDepartment;

        if (advancedBagging.finalizedBy) {
          const baggingEmployee = await Employee.findOne({ userId: advancedBagging.finalizedBy });
          if (baggingEmployee) {
            employeeID = baggingEmployee.userId;
            department = baggingEmployee.department || "N/A";
          }
        }

        const newStatusEntry = {
          status: "Advanced Bagging",
          stepNumber: 1,
          date: new Date(),
          employeeID: employeeID,
          department: department,
        };

        if (runProcess) {
          runProcess.statusHistory.push(newStatusEntry);
          runProcess.currentStatus = "Advanced Bagging";
          runProcess.currentStepNumber = 1;
          await runProcess.save();
        } else {
          await RunProcess.create({
            runNo,
            currentStatus: "Advanced Bagging",
            currentStepNumber: 1,
            statusHistory: [newStatusEntry]
          });
        }

        autoUpdated = true;
        messages.push("Advanced Bagging completed automatically");
      }
    }

    // Check for Bagging and Clubbing auto-completion
    if (!existingStatuses.includes("Bagging and Clubbing")) {
      const baggingFinal = await Bagging.findOne({ runNo, isFinal: true });
      
      if (baggingFinal) {
        let employeeID = defaultEmployeeID;
        let department = defaultDepartment;

        if (baggingFinal.finalizedBy) {
          const baggingEmployee = await Employee.findOne({ userId: baggingFinal.finalizedBy });
          if (baggingEmployee) {
            employeeID = baggingEmployee.userId;
            department = baggingEmployee.department || "N/A";
          }
        }

        const newStatusEntry = {
          status: "Bagging and Clubbing",
          stepNumber: 2,
          date: new Date(),
          employeeID: employeeID,
          department: department,
        };

        runProcess = await RunProcess.findOne({ runNo });
        if (runProcess) {
          runProcess.statusHistory.push(newStatusEntry);
          runProcess.currentStatus = "Bagging and Clubbing";
          runProcess.currentStepNumber = 2;
          await runProcess.save();
        } else {
          await RunProcess.create({
            runNo,
            currentStatus: "Bagging and Clubbing",
            currentStepNumber: 2,
            statusHistory: [newStatusEntry]
          });
        }

        autoUpdated = true;
        messages.push("Bagging and Clubbing completed automatically");
      }
    }

    // Check for Offloaded
    if (!existingStatuses.includes("Offloaded") && awbNumbers.length > 0) {
      const offloadedEvent = await EventActivity.findOne({
        awbNo: { $in: awbNumbers },
        status: { $elemMatch: { $regex: /offload/i } }
      });

      if (offloadedEvent) {
        const employeeDetails = await getEmployeeFromEventActivity(
          awbNumbers, 
          /offload/i, 
          defaultEmployee
        );

        const newStatusEntry = {
          status: "Offloaded",
          stepNumber: 4,
          date: new Date(),
          employeeID: employeeDetails.employeeID,
          department: employeeDetails.department,
        };

        runProcess = await RunProcess.findOne({ runNo });
        if (runProcess) {
          runProcess.statusHistory.push(newStatusEntry);
          runProcess.currentStatus = "Offloaded";
          runProcess.currentStepNumber = 4;
          await runProcess.save();
        } else {
          await RunProcess.create({
            runNo,
            currentStatus: "Offloaded",
            currentStepNumber: 4,
            statusHistory: [newStatusEntry]
          });
        }

        autoUpdated = true;
        messages.push("Offloaded detected from Event Activity");
      }
    }

    // Check for Arrived at Destination
    if (!existingStatuses.includes("Arrived at Destination") && awbNumbers.length > 0) {
      const arrivedEvent = await EventActivity.findOne({
        awbNo: { $in: awbNumbers },
        status: { $elemMatch: { $regex: /arrived.*destination/i } }
      });

      if (arrivedEvent) {
        const employeeDetails = await getEmployeeFromEventActivity(
          awbNumbers, 
          /arrived.*destination/i, 
          defaultEmployee
        );

        const newStatusEntry = {
          status: "Arrived at Destination",
          stepNumber: 7,
          date: new Date(),
          employeeID: employeeDetails.employeeID,
          department: employeeDetails.department,
        };

        runProcess = await RunProcess.findOne({ runNo });
        if (runProcess) {
          runProcess.statusHistory.push(newStatusEntry);
          runProcess.currentStatus = "Arrived at Destination";
          runProcess.currentStepNumber = 7;
          await runProcess.save();
        } else {
          await RunProcess.create({
            runNo,
            currentStatus: "Arrived at Destination",
            currentStepNumber: 7,
            statusHistory: [newStatusEntry]
          });
        }

        autoUpdated = true;
        messages.push("Arrived at Destination detected from Event Activity");
      }
    }

    // Check for Custom Clearance
    if (!existingStatuses.includes("Custom Clearance") && awbNumbers.length > 0) {
      const clearanceEvent = await EventActivity.findOne({
        awbNo: { $in: awbNumbers },
        status: { $elemMatch: { $regex: /custom.*clearance/i } }
      });

      if (clearanceEvent) {
        const employeeDetails = await getEmployeeFromEventActivity(
          awbNumbers, 
          /custom.*clearance/i, 
          defaultEmployee
        );

        const newStatusEntry = {
          status: "Custom Clearance",
          stepNumber: 8,
          date: new Date(),
          employeeID: employeeDetails.employeeID,
          department: employeeDetails.department,
        };

        runProcess = await RunProcess.findOne({ runNo });
        if (runProcess) {
          runProcess.statusHistory.push(newStatusEntry);
          runProcess.currentStatus = "Custom Clearance";
          runProcess.currentStepNumber = 8;
          await runProcess.save();
        } else {
          await RunProcess.create({
            runNo,
            currentStatus: "Custom Clearance",
            currentStepNumber: 8,
            statusHistory: [newStatusEntry]
          });
        }

        autoUpdated = true;
        messages.push("Custom Clearance detected from Event Activity");
      }
    }

    return NextResponse.json({
      success: true,
      autoUpdated,
      message: messages.join(", ") || "No automatic updates needed",
    });
  } catch (error) {
    console.error("Error in auto status check:", error);
    return NextResponse.json({
      success: false,
      autoUpdated: false,
      message: "Error checking auto statuses: " + error.message,
    });
  }
}

// POST - Create/Update run process status
export async function POST(request) {
  try {
    await connectDB();
    
    const body = await request.json();
    const { runNo, status, employeeID } = body;

    if (!runNo || !status || !employeeID) {
      return NextResponse.json(
        { success: false, message: "Run number, status, and employee ID are required" },
        { status: 400 }
      );
    }

    const employee = await Employee.findOne({ userId: employeeID });
    if (!employee) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 }
      );
    }

    const progressCheck = await canProgressToStatus(runNo, status);
    
    if (!progressCheck.allowed) {
      return NextResponse.json(
        { success: false, message: progressCheck.message },
        { status: 400 }
      );
    }

    const newStepNumber = getStepNumber(status);
    
    console.log("=== CREATING/UPDATING RUN PROCESS ===");
    console.log(`Status: ${status}`);
    console.log(`Calculated stepNumber: ${newStepNumber}`);

    const newStatusEntry = {
      status,
      stepNumber: newStepNumber,
      date: new Date(),
      employeeID: employee.userId,
      department: employee.department || "N/A",
    };

    // Find existing run process or create new one
    let runProcess = await RunProcess.findOne({ runNo });

    if (runProcess) {
      // Check if this status already exists
      const statusExists = runProcess.statusHistory.some(s => s.status === status);
      if (statusExists) {
        return NextResponse.json({
          success: false,
          message: "This status has already been recorded for this run",
        }, { status: 400 });
      }

      // Add new status to history
      runProcess.statusHistory.push(newStatusEntry);
      runProcess.currentStatus = status;
      runProcess.currentStepNumber = newStepNumber;
      await runProcess.save();
    } else {
      // Create new run process document
      runProcess = await RunProcess.create({
        runNo,
        currentStatus: status,
        currentStepNumber: newStepNumber,
        statusHistory: [newStatusEntry]
      });
    }

    return NextResponse.json({
      success: true,
      message: progressCheck.message,
      data: runProcess,
      currentStep: newStepNumber,
    });
  } catch (error) {
    console.error("Error creating run process:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create run process entry: " + error.message },
      { status: 500 }
    );
  }
}

// PUT - Update run process entry (update a specific status in history)
export async function PUT(request) {
  try {
    await connectDB();
    
    const body = await request.json();
    const { id, status, employeeID, runNo } = body;

    if (!id || !runNo) {
      return NextResponse.json(
        { success: false, message: "Process ID and Run Number are required" },
        { status: 400 }
      );
    }

    const runProcess = await RunProcess.findOne({ runNo });
    if (!runProcess) {
      return NextResponse.json(
        { success: false, message: "Run process not found" },
        { status: 404 }
      );
    }

    // Find the status entry in history
    const statusEntry = runProcess.statusHistory.id(id);
    if (!statusEntry) {
      return NextResponse.json(
        { success: false, message: "Status entry not found in history" },
        { status: 404 }
      );
    }

    // Update the status entry
    if (status) {
      statusEntry.status = status;
      statusEntry.stepNumber = getStepNumber(status);
    }
    
    if (employeeID) {
      const employee = await Employee.findOne({ userId: employeeID });
      if (employee) {
        statusEntry.employeeID = employee.userId;
        statusEntry.department = employee.department || "N/A";
      }
    }

    // Update current status if this is the most recent entry
    const latestEntry = runProcess.statusHistory[runProcess.statusHistory.length - 1];
    if (latestEntry._id.toString() === id) {
      runProcess.currentStatus = statusEntry.status;
      runProcess.currentStepNumber = statusEntry.stepNumber;
    }

    await runProcess.save();

    return NextResponse.json({
      success: true,
      message: "Run process updated successfully",
      data: runProcess,
    });
  } catch (error) {
    console.error("Error updating run process:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update run process entry: " + error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete run process entry (remove a specific status from history)
export async function DELETE(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const runNo = searchParams.get("runNo");

    if (!id || !runNo) {
      return NextResponse.json(
        { success: false, message: "Process ID and Run Number are required" },
        { status: 400 }
      );
    }

    const runProcess = await RunProcess.findOne({ runNo });
    if (!runProcess) {
      return NextResponse.json(
        { success: false, message: "Run process not found" },
        { status: 404 }
      );
    }

    // Find the index of the status entry to remove
    const statusIndex = runProcess.statusHistory.findIndex(
      item => item._id.toString() === id
    );
    
    if (statusIndex === -1) {
      return NextResponse.json(
        { success: false, message: "Status entry not found in history" },
        { status: 404 }
      );
    }

    // Remove the status entry from array
    runProcess.statusHistory.splice(statusIndex, 1);

    // Update current status to the most recent entry
    if (runProcess.statusHistory.length > 0) {
      const latestEntry = runProcess.statusHistory[runProcess.statusHistory.length - 1];
      runProcess.currentStatus = latestEntry.status;
      runProcess.currentStepNumber = latestEntry.stepNumber;
      await runProcess.save();
    } else {
      // If no history left, delete the entire document
      await RunProcess.deleteOne({ runNo });
      return NextResponse.json({
        success: true,
        message: "Run process entry deleted successfully (no history remaining)",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Run process entry deleted successfully",
      data: runProcess,
    });
  } catch (error) {
    console.error("Error deleting run process:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete run process entry: " + error.message },
      { status: 500 }
    );
  }
}