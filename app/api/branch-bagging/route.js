import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import BranchBagging from "@/app/model/BranchBagging";
import Shipment from "@/app/model/portal/Shipment";
import ChildShipment from "@/app/model/portal/ChildShipment";

// Helper function to parse date and format consistently as DD/MM/YYYY
function parseAndFormatDate(dateInput) {
  let parsedDate;
  
  if (typeof dateInput === "string") {
    if (dateInput.includes("/")) {
      // Parse DD/MM/YYYY format
      const [day, month, year] = dateInput.split("/");
      parsedDate = new Date(year, parseInt(month) - 1, day);
    } else {
      parsedDate = new Date(dateInput);
    }
  } else {
    parsedDate = new Date(dateInput);
  }

  if (isNaN(parsedDate)) {
    throw new Error("Invalid date format");
  }

  // Format as DD/MM/YYYY
  const day = String(parsedDate.getDate()).padStart(2, '0');
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const year = parsedDate.getFullYear();
  
  return `${day}/${month}/${year}`;
}

// Helper function to check if AWB is a child AWB and get master AWB details
async function getAwbDetails(awbNo) {
  const trimmedAwb = awbNo.toString().trim().toUpperCase();
  
  // First check if it's a child shipment
  const childShipment = await ChildShipment.findOne({ childAwbNo: trimmedAwb });
  if (childShipment) {
    // Get the master shipment details
    const masterShipment = await Shipment.findOne({ awbNo: childShipment.masterAwbNo });
    
    if (!masterShipment) {
      return {
        type: 'child',
        childAwbNo: trimmedAwb,
        masterAwbNo: childShipment.masterAwbNo,
        childShipment,
        error: 'Master AWB not found'
      };
    }
    
    return {
      type: 'child',
      childAwbNo: trimmedAwb,
      masterAwbNo: childShipment.masterAwbNo,
      childShipment,
      masterShipment,
      isHold: masterShipment.isHold === true,
      holdReason: masterShipment.holdReason,
      sector: masterShipment.sector,
      weight: masterShipment.totalActualWt,
      localMF: masterShipment.localMF || "",
      payment: masterShipment.payment || ""
    };
  }
  
  // Check if it's a regular shipment
  const shipment = await Shipment.findOne({ awbNo: trimmedAwb });
  if (shipment) {
    return {
      type: 'master',
      awbNo: trimmedAwb,
      masterAwbNo: trimmedAwb,
      shipment,
      isHold: shipment.isHold === true,
      holdReason: shipment.holdReason,
      sector: shipment.sector,
      weight: shipment.totalActualWt,
      localMF: shipment.localMF || "",
      payment: shipment.payment || ""
    };
  }
  
  return null;
}

// GET - Fetch branch bagging data  
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");
    const awbNo = searchParams.get("awbNo");

    // New endpoint to get AWB details (master or child)
    if (awbNo) {
      const awbDetails = await getAwbDetails(awbNo);
      
      if (!awbDetails) {
        return NextResponse.json(
          { error: "AWB not found" },
          { status: 404 }
        );
      }
      
      return NextResponse.json(awbDetails, { status: 200 });
    }

    if (runNo) {
      const baggingData = await BranchBagging.findOne({ runNo });

      if (!baggingData) {
        return NextResponse.json(
          { error: "Branch bagging data not found for this run number" },
          { status: 404 }
        );
      }

      return NextResponse.json(baggingData, { status: 200 });
    } else {
      const allBaggingData = await BranchBagging.find().sort({ createdAt: -1 });
      return NextResponse.json(allBaggingData, { status: 200 });
    }
  } catch (error) {
    console.error("Error fetching branch bagging data:", error.message);
    return NextResponse.json(
      {
        error: "Failed to fetch branch bagging data",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// POST - Create new branch bagging data
export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();

    const { runNo, rowData } = body;

    console.log("POST request body:", body);

    if (!runNo) {
      return NextResponse.json(
        { error: "Run number is required" },
        { status: 400 }
      );
    }

    // Check if branch bagging data already exists
    const existingBagging = await BranchBagging.findOne({ runNo: runNo.toString() });

    if (existingBagging) {
      console.log("Branch bagging already exists for runNo:", runNo);
      return NextResponse.json(
        {
          error: "Branch bagging data already exists for this run number. Use PUT to manage items.",
        },
        { status: 409 }
      );
    }

    // Process rowData if provided
    let processedRowData = [];
    if (Array.isArray(rowData) && rowData.length > 0) {
      // Check for hold status and payment type on all AWBs first
      for (const item of rowData) {
        const enteredAwb = item.awbNo?.toString().trim().toUpperCase();
        if (!enteredAwb) continue;
        
        const awbDetails = await getAwbDetails(enteredAwb);
        
        if (!awbDetails) {
          return NextResponse.json(
            { error: `AWB ${enteredAwb} not found` },
            { status: 404 }
          );
        }
        
        if (awbDetails.isHold) {
          const awbType = awbDetails.type === 'child' ? 'Child AWB' : 'AWB';
          const masterInfo = awbDetails.type === 'child' 
            ? ` (Master AWB: ${awbDetails.masterAwbNo})` 
            : '';
          return NextResponse.json(
            { 
              error: `${awbType} ${enteredAwb}${masterInfo} is on hold and cannot be used for bagging`,
              holdReason: awbDetails.holdReason
            },
            { status: 400 }
          );
        }

        // Check payment type
        const paymentType = awbDetails.payment?.toUpperCase();
        if (paymentType === 'RTO' || paymentType === 'FOC') {
          const awbType = awbDetails.type === 'child' ? 'Child AWB' : 'AWB';
          const masterInfo = awbDetails.type === 'child' 
            ? ` (Master AWB: ${awbDetails.masterAwbNo})` 
            : '';
          return NextResponse.json(
            { 
              error: `${awbType} ${enteredAwb}${masterInfo} has payment type ${paymentType} and cannot be bagged`
            },
            { status: 400 }
          );
        }
      }

      // Process each row and determine if it's child or master AWB
      for (const item of rowData) {
        const enteredAwb = item.awbNo?.toString().trim().toUpperCase();
        if (!enteredAwb) continue;
        
        const awbDetails = await getAwbDetails(enteredAwb);
        
        if (!awbDetails) {
          return NextResponse.json(
            { error: `AWB ${enteredAwb} not found` },
            { status: 404 }
          );
        }
        
        // Store based on type - only include the relevant field
        const baseItem = {
          bagNo: item.bagNo?.toString() || "",
          bagWeight: item.bagWeight ? parseFloat(item.bagWeight) : 0,
          runNo: item.runNo?.toString() || runNo.toString(),
          forwardingNo: item.forwardingNo?.toString() || "",
          addedAt: new Date().toISOString(),
        };
        
        if (awbDetails.type === 'child') {
          processedRowData.push({
            ...baseItem,
            childShipment: enteredAwb,
          });
        } else {
          processedRowData.push({
            ...baseItem,
            awbNo: enteredAwb,
          });
        }
      }

      // Check for duplicate AWBs
      const uniqueAwbs = new Set();
      for (const row of processedRowData) {
        const identifier = row.childShipment || row.awbNo;
        if (uniqueAwbs.has(identifier)) {
          return NextResponse.json(
            { error: `Duplicate AWB: ${identifier}` },
            { status: 400 }
          );
        }
        uniqueAwbs.add(identifier);
      }
    }

    // Parse and format date as DD/MM/YYYY
    let formattedDate;
    if (body.date) {
      try {
        formattedDate = parseAndFormatDate(body.date);
      } catch (error) {
        return NextResponse.json(
          { error: "Invalid date format", original: body.date },
          { status: 400 }
        );
      }
    }

    // Create new branch bagging record
    const baggingData = new BranchBagging({
      runNo: runNo.toString(),
      ...(formattedDate && { date: formattedDate }),
      transportType: body.transportType || "",
      obc: body.obc || "",
      cdNo: body.cdNo || "",
      origin: body.origin || "",
      mawb: body.mawb || "",
      destination: body.destination || "",
      hub: body.hub || "",
      noOfBags: body.noOfBags !== undefined ? parseInt(body.noOfBags) : 0,
      noOfAwb: body.noOfAwb !== undefined ? parseInt(body.noOfAwb) : 0,
      bagWeight: body.bagWeight !== undefined ? parseFloat(body.bagWeight) : 0,
      runWeight: body.runWeight !== undefined ? parseFloat(body.runWeight) : 0,
      totalClubNo: body.totalClubNo !== undefined ? parseInt(body.totalClubNo) : 0,
      totalAwb: body.totalAwb !== undefined ? parseInt(body.totalAwb) : 0,
      totalWeight: body.totalWeight !== undefined ? parseFloat(body.totalWeight) : 0,
      uniqueId: body.uniqueId || "",
      isFinal: false,
      rowData: processedRowData,
    });

    console.log("Creating branch bagging with data:", baggingData);

    const newBagging = await baggingData.save();
    console.log("Branch bagging saved successfully:", newBagging._id);

    // Update shipments/child shipments asynchronously with localMF field
    if (processedRowData.length > 0) {
      setImmediate(() => {
        const updatePromises = processedRowData.map(async (item) => {
          const enteredAwb = item.childShipment || item.awbNo;
          if (!enteredAwb) return Promise.resolve();

          const awbDetails = await getAwbDetails(enteredAwb);
          
          if (awbDetails && awbDetails.type === 'child') {
            return ChildShipment.updateOne(
              { childAwbNo: awbDetails.childAwbNo },
              {
                $set: {
                  runNo: item.runNo,
                  bagNo: item.bagNo,
                  bagWeight: item.bagWeight,
                  branchBaggingStatus: "bagged",
                  branchBaggedAt: new Date(),
                  localMF: runNo.toString(),
                },
              },
              { upsert: false }
            ).catch((err) => console.log("Child shipment update error:", err.message));
          } else {
            return Shipment.updateOne(
              { awbNo: item.awbNo },
              {
                $set: {
                  runNo: item.runNo,
                  bagNo: item.bagNo,
                  bagWeight: item.bagWeight,
                  branchBaggingStatus: "bagged",
                  branchBaggedAt: new Date(),
                  localMF: runNo.toString(),
                },
              },
              { upsert: false }
            ).catch((err) => console.log("Shipment update error:", err.message));
          }
        });

        Promise.all(updatePromises).then(() => {
          console.log(`Updated ${processedRowData.length} shipments with branch bagging info and localMF: ${runNo}`);
        });
      });
    }

    return NextResponse.json(newBagging, { status: 201 });
  } catch (error) {
    console.error("Error in POST:", error.message);
    console.error("Full error:", error);

    if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
      return NextResponse.json(
        {
          error: "Database timeout",
          details: "Operation took too long. Please try again.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error.message,
      },
      { status: 400 }
    );
  }
}

// PUT - Manage items (add/remove), finalize, and update metadata
export async function PUT(req) {
  try {
    await connectDB();
    const body = await req.json();

    const { runNo, action, item, ...updateData } = body;

    if (!runNo) {
      return NextResponse.json(
        { error: "Run number is required" },
        { status: 400 }
      );
    }

    console.log("PUT request body:", body);

    // Handle FINAL action - Set isFinal to true
    if (action === "final") {
      const baggingData = await BranchBagging.findOne({ runNo: runNo.toString() })
        .maxTimeMS(5000)
        .exec();

      if (!baggingData) {
        return NextResponse.json(
          { error: "Branch bagging data not found for this run number." },
          { status: 404 }
        );
      }

      if (!baggingData.rowData || baggingData.rowData.length === 0) {
        return NextResponse.json(
          { error: "Cannot finalize empty branch bagging. Add AWBs first." },
          { status: 400 }
        );
      }

      if (baggingData.isFinal === true) {
        return NextResponse.json(
          { error: "Branch bagging is already finalized for this run." },
          { status: 409 }
        );
      }

      baggingData.isFinal = true;
      const updatedBagging = await baggingData.save();

      console.log(`Branch bagging finalized for run ${runNo}`);

      return NextResponse.json(
        { 
          message: "Branch bagging finalized successfully",
          data: updatedBagging 
        },
        { status: 200 }
      );
    }

    // Handle item management actions (add/remove)
    if (action && (action === "add" || action === "remove")) {
      const baggingData = await BranchBagging.findOne({ runNo: runNo.toString() })
        .maxTimeMS(5000)
        .exec();

      if (!baggingData) {
        return NextResponse.json(
          { error: "Branch bagging data not found for this run number. Create one first." },
          { status: 404 }
        );
      }

      if (baggingData.isFinal === true) {
        return NextResponse.json(
          { error: "Cannot modify finalized branch bagging. This run has been finalized." },
          { status: 403 }
        );
      }

      // Handle ADD action
      if (action === "add" && item) {
        if (!item.awbNo || !item.bagNo || item.bagWeight === undefined) {
          return NextResponse.json(
            { error: "Item must have awbNo, bagNo, and bagWeight" },
            { status: 400 }
          );
        }

        const enteredAwb = item.awbNo.toString().trim().toUpperCase();

        // Get AWB details (master or child)
        const awbDetails = await getAwbDetails(enteredAwb);
        
        if (!awbDetails) {
          return NextResponse.json(
            { error: `AWB ${enteredAwb} not found` },
            { status: 404 }
          );
        }
        
        // Check if master AWB is on hold
        if (awbDetails.isHold) {
          const awbType = awbDetails.type === 'child' ? 'Child AWB' : 'AWB';
          const masterInfo = awbDetails.type === 'child' 
            ? ` (Master AWB: ${awbDetails.masterAwbNo})` 
            : '';
          return NextResponse.json(
            { 
              error: `${awbType} ${enteredAwb}${masterInfo} is on hold and cannot be used for bagging`,
              holdReason: awbDetails.holdReason
            },
            { status: 400 }
          );
        }

        // Check payment type - RTO or FOC cannot be bagged
        const paymentType = awbDetails.payment?.toUpperCase();
        if (paymentType === 'RTO' || paymentType === 'FOC') {
          const awbType = awbDetails.type === 'child' ? 'Child AWB' : 'AWB';
          const masterInfo = awbDetails.type === 'child' 
            ? ` (Master AWB: ${awbDetails.masterAwbNo})` 
            : '';
          return NextResponse.json(
            { 
              error: `${awbType} ${enteredAwb}${masterInfo} has payment type ${paymentType} and cannot be bagged`
            },
            { status: 400 }
          );
        }

        // Check if AWB already exists (check both fields)
        const itemExists = baggingData.rowData.some(
          (row) => {
            const rowIdentifier = row.childShipment || row.awbNo;
            return rowIdentifier && rowIdentifier.trim().toUpperCase() === enteredAwb;
          }
        );

        if (itemExists) {
          return NextResponse.json(
            { error: `AWB ${enteredAwb} already exists in this run` },
            { status: 409 }
          );
        }

        // Create new item based on type
        const baseItem = {
          bagNo: item.bagNo.toString(),
          bagWeight: parseFloat(item.bagWeight),
          runNo: item.runNo?.toString() || runNo.toString(),
          forwardingNo: item.forwardingNo?.toString() || "",
          addedAt: new Date().toISOString(),
        };

        let newItem;
        if (awbDetails.type === 'child') {
          newItem = {
            ...baseItem,
            childShipment: enteredAwb,
          };
        } else {
          newItem = {
            ...baseItem,
            awbNo: enteredAwb,
          };
        }

        // Add item to rowData array
        baggingData.rowData.push(newItem);
        
        // Recalculate summary
        const numberOfBags = new Set(
          baggingData.rowData.map((row) => row.bagNo)
        ).size;
        
        const totalWeight = baggingData.rowData.reduce(
          (sum, row) => sum + (parseFloat(row.bagWeight) || 0),
          0
        );

        baggingData.noOfBags = numberOfBags;
        baggingData.noOfAwb = baggingData.rowData.length;
        baggingData.runWeight = totalWeight;

        const updatedBagging = await baggingData.save();

        console.log("Successfully added AWB:", enteredAwb);

        // Update shipment/child shipment asynchronously
        setImmediate(async () => {
          if (awbDetails.type === 'child') {
            await ChildShipment.updateOne(
              { childAwbNo: awbDetails.childAwbNo },
              {
                $set: {
                  runNo: newItem.runNo,
                  bagNo: newItem.bagNo,
                  bagWeight: newItem.bagWeight,
                  branchBaggingStatus: "bagged",
                  branchBaggedAt: new Date(),
                  localMF: runNo.toString(),
                },
              },
              { upsert: false }
            ).then(() => {
              console.log(`Updated child shipment ${awbDetails.childAwbNo} with branch bagging info`);
            }).catch((err) => console.log("Child shipment update error:", err.message));

            if (awbDetails.masterShipment) {
              await Shipment.updateOne(
                { awbNo: awbDetails.masterAwbNo },
                {
                  $set: {
                    localMF: runNo.toString(),
                  },
                },
                { upsert: false }
              ).then(() => {
                console.log(`Updated master shipment ${awbDetails.masterAwbNo} with localMF`);
              }).catch((err) => console.log("Master shipment localMF update error:", err.message));
            }
          } else {
            await Shipment.updateOne(
              { awbNo: awbDetails.masterAwbNo },
              {
                $set: {
                  runNo: newItem.runNo,
                  bagNo: newItem.bagNo,
                  bagWeight: newItem.bagWeight,
                  branchBaggingStatus: "bagged",
                  branchBaggedAt: new Date(),
                  localMF: runNo.toString(),
                },
              },
              { upsert: false }
            ).then(() => {
              console.log(`Updated shipment ${awbDetails.masterAwbNo} with branch bagging info`);
            }).catch((err) => console.log("Shipment update error:", err.message));
          }
        });

        return NextResponse.json(updatedBagging, { status: 200 });
      }

      // Handle REMOVE action
      if (action === "remove" && item?.awbNo) {
        const enteredAwb = item.awbNo.toString().trim().toUpperCase();

        console.log("Attempting to remove AWB:", enteredAwb);

        const itemToRemove = baggingData.rowData.find(
          row => {
            const rowIdentifier = row.childShipment || row.awbNo;
            return rowIdentifier && rowIdentifier.trim().toUpperCase() === enteredAwb;
          }
        );

        if (!itemToRemove) {
          return NextResponse.json(
            { error: `AWB ${enteredAwb} not found in this run` },
            { status: 404 }
          );
        }

        const awbDetails = await getAwbDetails(enteredAwb);

        baggingData.rowData = baggingData.rowData.filter(
          row => {
            const rowIdentifier = row.childShipment || row.awbNo;
            return !(rowIdentifier && rowIdentifier.trim().toUpperCase() === enteredAwb);
          }
        );

        const numberOfBags = new Set(
          baggingData.rowData.map((row) => row.bagNo)
        ).size;
        
        const totalWeight = baggingData.rowData.reduce(
          (sum, row) => sum + (parseFloat(row.bagWeight) || 0),
          0
        );

        baggingData.noOfBags = numberOfBags;
        baggingData.noOfAwb = baggingData.rowData.length;
        baggingData.runWeight = totalWeight;

        const updatedBagging = await baggingData.save();

        console.log("Successfully removed AWB:", enteredAwb);

        setImmediate(() => {
          if (awbDetails && awbDetails.type === 'child') {
            ChildShipment.updateOne(
              { childAwbNo: awbDetails.childAwbNo },
              {
                $unset: {
                  runNo: "",
                  bagNo: "",
                  bagWeight: "",
                  branchBaggingStatus: "",
                  branchBaggedAt: "",
                  localMF: "",
                },
              }
            ).then(() => {
              console.log(`Removed branch bagging info from child shipment ${awbDetails.childAwbNo}`);
            }).catch((err) => console.log("Child shipment removal error:", err.message));
          } else {
            Shipment.updateOne(
              { awbNo: enteredAwb },
              {
                $unset: {
                  runNo: "",
                  bagNo: "",
                  bagWeight: "",
                  branchBaggingStatus: "",
                  branchBaggedAt: "",
                  localMF: "",
                },
              }
            ).then(() => {
              console.log(`Removed branch bagging info from shipment ${enteredAwb}`);
            }).catch((err) => console.log("Shipment removal error:", err.message));
          }
        });

        return NextResponse.json(updatedBagging, { status: 200 });
      }
    }

    // Handle metadata update
    if (Object.keys(updateData).length > 0) {
      const existingBagging = await BranchBagging.findOne({ runNo });

      if (!existingBagging) {
        return NextResponse.json(
          { error: "Branch bagging data not found for this run number. Use POST to create new." },
          { status: 404 }
        );
      }

      if (existingBagging.isFinal === true) {
        return NextResponse.json(
          { error: "Cannot modify finalized branch bagging. This run has been finalized." },
          { status: 403 }
        );
      }

      if (updateData.date) {
        try {
          updateData.date = parseAndFormatDate(updateData.date);
        } catch (error) {
          return NextResponse.json(
            { error: "Invalid date format", original: updateData.date },
            { status: 400 }
          );
        }
      }

      const updatedBagging = await BranchBagging.findOneAndUpdate(
        { runNo },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      console.log("Branch bagging metadata updated:", updatedBagging);

      return NextResponse.json(updatedBagging, { status: 200 });
    }

    return NextResponse.json(
      { error: "No valid action or update data provided" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in PUT:", error.message);
    console.error("Full error stack:", error.stack);
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error.message,
      },
      { status: 400 }
    );
  }
}

// DELETE - Delete branch bagging data
export async function DELETE(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return NextResponse.json(
        { error: "Run number is required for deletion" },
        { status: 400 }
      );
    }

    const deletedBagging = await BranchBagging.findOneAndDelete({ runNo });

    if (!deletedBagging) {
      return NextResponse.json(
        { error: "Branch bagging data not found for this run number" },
        { status: 404 }
      );
    }

    if (deletedBagging.isFinal === true) {
      await BranchBagging.create(deletedBagging);
      return NextResponse.json(
        { error: "Cannot delete finalized branch bagging. This run has been finalized." },
        { status: 403 }
      );
    }

    if (deletedBagging.rowData && Array.isArray(deletedBagging.rowData)) {
      setImmediate(async () => {
        const unsetFields = {
          runNo: "",
          bagNo: "",
          bagWeight: "",
          branchBaggingStatus: "",
          branchBaggedAt: "",
          localMF: "",
        };

        const updatePromises = deletedBagging.rowData.map(async (row) => {
          const enteredAwb = row.childShipment || row.awbNo;
          if (!enteredAwb) return Promise.resolve();
          
          const awbDetails = await getAwbDetails(enteredAwb);
          
          if (awbDetails && awbDetails.type === 'child') {
            return ChildShipment.updateOne(
              { childAwbNo: awbDetails.childAwbNo },
              { $unset: unsetFields }
            );
          } else {
            return Shipment.updateOne(
              { awbNo: row.awbNo },
              { $unset: unsetFields }
            );
          }
        });

        Promise.all(updatePromises).then(() => {
          console.log(`Removed branch bagging info from ${deletedBagging.rowData.length} shipments`);
        }).catch((err) => {
          console.log("Error removing shipment info:", err.message);
        });
      });
    }

    return NextResponse.json(
      { message: "Branch bagging data deleted successfully", deletedBagging },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting branch bagging data:", error.message);
    return NextResponse.json(
      {
        error: "Failed to delete branch bagging data",
        details: error.message,
      },
      { status: 500 }
    );
  }
}