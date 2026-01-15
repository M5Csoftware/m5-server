import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import Shipment from "@/app/model/portal/Shipment";
import ChildShipment from "@/app/model/portal/ChildShipment";

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
      weight: masterShipment.totalActualWt
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
      weight: shipment.totalActualWt
    };
  }
  
  return null;
}

// Helper to get full shipment details for columnsData
async function getFullShipmentDetails(awbNo) {
  const trimmedAwb = awbNo.toString().trim().toUpperCase();
  
  // Check if it's a child shipment first
  const childShipment = await ChildShipment.findOne({ childAwbNo: trimmedAwb });
  if (childShipment) {
    const masterShipment = await Shipment.findOne({ awbNo: childShipment.masterAwbNo });
    if (masterShipment) {
      return {
        mawbNo: masterShipment.awbNo,
        totalActualWeight: masterShipment.totalActualWt,
        date: masterShipment.date,
        service: masterShipment.service,
        sector: masterShipment.sector,
        destination: masterShipment.destination,
        name: masterShipment.customer,
        shippeFullName: masterShipment.shipperFullName,
        recieverFullName: masterShipment.receiverFullName,
        recieverAddress: masterShipment.receiverAddressLine1,
        recieverCity: masterShipment.receiverCity,
        recieverPincode: masterShipment.receiverPincode,
        origin: masterShipment.origin,
        content: masterShipment.content,
        operationRemarks: masterShipment.operationRemark,
        isHold: masterShipment.isHold,
        holdReason: masterShipment.holdReason,
        paymentType: masterShipment.payment,
        billNo: masterShipment.billNo,
        awbStatus: masterShipment.awbStatus,
        shipmentForwardingNo: masterShipment.forwardingNo,
        type: 'child',
        childAwbNo: trimmedAwb
      };
    }
  }
  
  // Check regular shipment
  const shipment = await Shipment.findOne({ awbNo: trimmedAwb });
  if (shipment) {
    return {
      mawbNo: shipment.awbNo,
      totalActualWeight: shipment.totalActualWt,
      date: shipment.date,
      service: shipment.service,
      sector: shipment.sector,
      destination: shipment.destination,
      name: shipment.customer,
      shippeFullName: shipment.shipperFullName,
      recieverFullName: shipment.receiverFullName,
      recieverAddress: shipment.receiverAddressLine1,
      recieverCity: shipment.receiverCity,
      recieverPincode: shipment.receiverPincode,
      origin: shipment.origin,
      content: shipment.content,
      operationRemarks: shipment.operationRemark,
      isHold: shipment.isHold,
      holdReason: shipment.holdReason,
      paymentType: shipment.payment,
      billNo: shipment.billNo,
      awbStatus: shipment.awbStatus,
      shipmentForwardingNo: shipment.forwardingNo,
      type: 'master'
    };
  }
  
  return null;
}

// GET - Fetch bagging data or AWB details
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");
    const awbNo = searchParams.get("awbNo");
    const fullDetails = searchParams.get("fullDetails");

    // Get full shipment details for columnsData
    if (awbNo && fullDetails === "true") {
      const shipmentDetails = await getFullShipmentDetails(awbNo);
      
      if (!shipmentDetails) {
        return NextResponse.json(
          { error: "Shipment details not found" },
          { status: 404 }
        );
      }
      
      return NextResponse.json(shipmentDetails, { status: 200 });
    }

    // Get AWB details (master or child)
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
      const baggingData = await Bagging.findOne({ runNo });

      if (!baggingData) {
        return NextResponse.json(
          { error: "Bagging data not found for this run number" },
          { status: 404 }
        );
      }

      return NextResponse.json(baggingData, { status: 200 });
    } else {
      const allBaggingData = await Bagging.find().sort({ createdAt: -1 });
      return NextResponse.json(allBaggingData, { status: 200 });
    }
  } catch (error) {
    console.error("Error fetching bagging data:", error.message);
    return NextResponse.json(
      {
        error: "Failed to fetch bagging data",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// POST - Create new bagging data
export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();

    const { runNo, rowData } = body;

    if (!runNo) {
      return NextResponse.json(
        { error: "Run number is required" },
        { status: 400 }
      );
    }

    const existingBagging = await Bagging.findOne({ runNo: runNo.toString() });

    if (existingBagging) {
      return NextResponse.json(
        {
          error: "Bagging data already exists for this run number. Use PUT to manage items.",
        },
        { status: 409 }
      );
    }

    let processedRowData = [];
    if (Array.isArray(rowData) && rowData.length > 0) {
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
      }

      for (const item of rowData) {
        const enteredAwb = item.awbNo?.toString().trim().toUpperCase();
        if (!enteredAwb) continue;
        
        const awbDetails = await getAwbDetails(enteredAwb);
        
        const baseItem = {
          bagNo: item.bagNo?.toString() || "",
          bagWeight: item.bagWeight ? parseFloat(item.bagWeight) : 0,
          runNo: item.runNo?.toString() || runNo.toString(),
          forwardingNo: item.forwardingNo?.toString() || "",
          remarks: item.remarks?.toString() || "",
          barcodeNo: item.barcodeNo?.toString() || "",
          addedAt: item.addedAt || new Date().toISOString(),
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

    let parsedDate;
    if (body.date) {
      if (typeof body.date === "string" && body.date.includes("/")) {
        const [day, month, year] = body.date.split("/");
        parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      } else {
        parsedDate = new Date(body.date);
      }

      if (isNaN(parsedDate)) {
        return NextResponse.json(
          { error: "Invalid date format" },
          { status: 400 }
        );
      }
    }

    const baggingData = new Bagging({
      runNo: runNo.toString(),
      ...(parsedDate && { date: parsedDate }),
      sector: body.sector || "",
      flight: body.flight || "",
      alMawb: body.alMawb || "",
      counterPart: body.counterPart || "",
      obc: body.obc || "",
      Mawb: body.Mawb || "",
      mhbsNo: body.mhbsNo || "",
      noOfBags: body.noOfBags !== undefined ? parseInt(body.noOfBags) : 0,
      noOfAwb: body.noOfAwb !== undefined ? parseInt(body.noOfAwb) : 0,
      runWeight: body.runWeight !== undefined ? parseFloat(body.runWeight) : 0,
      totalClubNo: body.totalClubNo !== undefined ? parseInt(body.totalClubNo) : 0,
      totalAwb: body.totalAwb !== undefined ? parseInt(body.totalAwb) : 0,
      totalWeight: body.totalWeight !== undefined ? parseFloat(body.totalWeight) : 0,
      uniqueId: body.uniqueId || "",
      remarks: body.remarks || "",
      rowData: processedRowData,
    });

    const newBagging = await baggingData.save();

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
                  bag: item.bagNo,
                  bagWeight: item.bagWeight,
                  baggingStatus: "bagged",
                  baggedAt: new Date(),
                  runDate: parsedDate || new Date(),
                  alMawb: body.alMawb || "",
                  flight: body.flight || "",
                  obc: body.obc || "",
                  barcodeNo: item.barcodeNo || "",
                },
              }
            ).catch((err) => console.log("Child shipment update error:", err.message));
          } else {
            return Shipment.updateOne(
              { awbNo: item.awbNo },
              {
                $set: {
                  runNo: item.runNo,
                  bag: item.bagNo,
                  bagWeight: item.bagWeight,
                  baggingStatus: "bagged",
                  baggedAt: new Date(),
                  runDate: parsedDate || new Date(),
                  alMawb: body.alMawb || "",
                  flight: body.flight || "",
                  obc: body.obc || "",
                  barcodeNo: item.barcodeNo || "",
                },
              }
            ).catch((err) => console.log("Shipment update error:", err.message));
          }
        });

        Promise.all(updatePromises);
      });
    }

    return NextResponse.json(newBagging, { status: 201 });
  } catch (error) {
    console.error("Error in POST:", error.message);
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error.message,
      },
      { status: 400 }
    );
  }
}

// PUT - Manage items (add/remove) and update metadata
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

    if (action && (action === "add" || action === "remove")) {
      const baggingData = await Bagging.findOne({ runNo: runNo.toString() })
        .maxTimeMS(5000)
        .exec();

      if (!baggingData) {
        return NextResponse.json(
          { error: "Bagging data not found" },
          { status: 404 }
        );
      }

      if (action === "add" && item) {
        if (!item.awbNo || !item.bagNo || item.bagWeight === undefined) {
          return NextResponse.json(
            { error: "Item must have awbNo, bagNo, and bagWeight" },
            { status: 400 }
          );
        }

        const enteredAwb = item.awbNo.toString().trim().toUpperCase();
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
              error: `${awbType} ${enteredAwb}${masterInfo} is on hold`,
              holdReason: awbDetails.holdReason
            },
            { status: 400 }
          );
        }

        const itemExists = baggingData.rowData.some(
          (row) => {
            const rowIdentifier = row.childShipment || row.awbNo;
            return rowIdentifier && rowIdentifier.trim().toUpperCase() === enteredAwb;
          }
        );

        if (itemExists) {
          return NextResponse.json(
            { error: `AWB ${enteredAwb} already exists` },
            { status: 409 }
          );
        }

        const baseItem = {
          bagNo: item.bagNo.toString(),
          bagWeight: parseFloat(item.bagWeight),
          runNo: item.runNo?.toString() || runNo.toString(),
          forwardingNo: item.forwardingNo?.toString() || "",
          remarks: item.remarks?.toString() || "",
          barcodeNo: item.barcodeNo?.toString() || "",
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

        baggingData.rowData.push(newItem);
        
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

        setImmediate(async () => {
          if (awbDetails.type === 'child') {
            ChildShipment.updateOne(
              { childAwbNo: awbDetails.childAwbNo },
              {
                $set: {
                  runNo: newItem.runNo,
                  bag: newItem.bagNo,
                  bagWeight: newItem.bagWeight,
                  baggingStatus: "bagged",
                  baggedAt: new Date(),
                  barcodeNo: newItem.barcodeNo || "",
                },
              }
            ).catch((err) => console.log("Error:", err.message));
          } else {
            Shipment.updateOne(
              { awbNo: awbDetails.masterAwbNo },
              {
                $set: {
                  runNo: newItem.runNo,
                  bag: newItem.bagNo,
                  bagWeight: newItem.bagWeight,
                  baggingStatus: "bagged",
                  baggedAt: new Date(),
                  barcodeNo: newItem.barcodeNo || "",
                },
              }
            ).catch((err) => console.log("Error:", err.message));
          }
        });

        return NextResponse.json(updatedBagging, { status: 200 });
      }

      if (action === "remove" && item?.awbNo) {
        const enteredAwb = item.awbNo.toString().trim().toUpperCase();

        const itemToRemove = baggingData.rowData.find(
          row => {
            const rowIdentifier = row.childShipment || row.awbNo;
            return rowIdentifier && rowIdentifier.trim().toUpperCase() === enteredAwb;
          }
        );

        if (!itemToRemove) {
          return NextResponse.json(
            { error: `AWB ${enteredAwb} not found` },
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

        setImmediate(() => {
          if (awbDetails && awbDetails.type === 'child') {
            ChildShipment.updateOne(
              { childAwbNo: awbDetails.childAwbNo },
              {
                $unset: {
                  runNo: "",
                  bag: "",
                  bagWeight: "",
                  baggingStatus: "",
                  baggedAt: "",
                  barcodeNo: "",
                },
              }
            ).catch((err) => console.log("Error:", err.message));
          } else {
            Shipment.updateOne(
              { awbNo: enteredAwb },
              {
                $unset: {
                  runNo: "",
                  bag: "",
                  bagWeight: "",
                  baggingStatus: "",
                  baggedAt: "",
                  barcodeNo: "",
                },
              }
            ).catch((err) => console.log("Error:", err.message));
          }
        });

        return NextResponse.json(updatedBagging, { status: 200 });
      }
    }

    if (Object.keys(updateData).length > 0) {
      const existingBagging = await Bagging.findOne({ runNo });

      if (!existingBagging) {
        return NextResponse.json(
          { error: "Bagging data not found" },
          { status: 404 }
        );
      }

      if (updateData.date) {
        let parsedDate;
        if (typeof updateData.date === "string" && updateData.date.includes("/")) {
          const [day, month, year] = updateData.date.split("/");
          parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        } else {
          parsedDate = new Date(updateData.date);
        }

        if (isNaN(parsedDate)) {
          return NextResponse.json(
            { error: "Invalid date format" },
            { status: 400 }
          );
        }
        updateData.date = parsedDate;
      }

      const updatedBagging = await Bagging.findOneAndUpdate(
        { runNo },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      return NextResponse.json(updatedBagging, { status: 200 });
    }

    return NextResponse.json(
      { error: "No valid action or update data provided" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in PUT:", error.message);
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error.message,
      },
      { status: 400 }
    );
  }
}

// DELETE - Delete bagging data
export async function DELETE(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return NextResponse.json(
        { error: "Run number is required" },
        { status: 400 }
      );
    }

    const deletedBagging = await Bagging.findOneAndDelete({ runNo });

    if (!deletedBagging) {
      return NextResponse.json(
        { error: "Bagging data not found" },
        { status: 404 }
      );
    }

    if (deletedBagging.rowData && Array.isArray(deletedBagging.rowData)) {
      setImmediate(async () => {
        const unsetFields = {
          runNo: "",
          bag: "",
          bagWeight: "",
          baggingStatus: "",
          baggedAt: "",
          barcodeNo: "",
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

        Promise.all(updatePromises);
      });
    }

    return NextResponse.json(
      { message: "Bagging data deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting:", error.message);
    return NextResponse.json(
      {
        error: "Failed to delete",
        details: error.message,
      },
      { status: 500 }
    );
  }
}