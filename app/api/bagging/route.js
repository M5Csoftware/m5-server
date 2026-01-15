import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import Shipment from "@/app/model/portal/Shipment";
import ChildShipment from "@/app/model/portal/ChildShipment";
import EventActivity from "@/app/model/EventActivity";

// Helper function to check if AWB is a child AWB and get master AWB details
async function getAwbDetails(awbNo) {
  const trimmedAwb = awbNo.toString().trim().toUpperCase();

  // First check if it's a child shipment
  const childShipment = await ChildShipment.findOne({ childAwbNo: trimmedAwb });
  if (childShipment) {
    // Get the master shipment details
    const masterShipment = await Shipment.findOne({
      awbNo: childShipment.masterAwbNo,
    });

    if (!masterShipment) {
      return {
        type: "child",
        childAwbNo: trimmedAwb,
        masterAwbNo: childShipment.masterAwbNo,
        childShipment,
        error: "Master AWB not found",
      };
    }

    // ✅ NEW: Check if master shipment payment is RTO
    const isRTO = masterShipment.payment?.toUpperCase() === "RTO";

    return {
      type: "child",
      childAwbNo: trimmedAwb,
      masterAwbNo: childShipment.masterAwbNo,
      childShipment,
      masterShipment,
      isHold: masterShipment.isHold === true,
      holdReason: masterShipment.holdReason,
      isRTO: isRTO, // ✅ NEW: Add RTO flag
      payment: masterShipment.payment, // ✅ NEW: Add payment type
      sector: masterShipment.sector,
      weight: masterShipment.totalActualWt,
      forwardingNo: childShipment.forwardingNo || "",
    };
  }

  // Check if it's a regular shipment
  const shipment = await Shipment.findOne({ awbNo: trimmedAwb });
  if (shipment) {
    // ✅ NEW: Check if shipment payment is RTO
    const isRTO = shipment.payment?.toUpperCase() === "RTO";

    return {
      type: "master",
      awbNo: trimmedAwb,
      masterAwbNo: trimmedAwb,
      shipment,
      isHold: shipment.isHold === true,
      holdReason: shipment.holdReason,
      isRTO: isRTO, // ✅ NEW: Add RTO flag
      payment: shipment.payment, // ✅ NEW: Add payment type
      sector: shipment.sector,
      weight: shipment.totalActualWt,
      forwardingNo: shipment.forwardingNo || "",
    };
  }

  return null;
}

// Helper function to update EventActivity and Shipment status
async function updateEventActivityAndShipment(
  awbDetails,
  runNo,
  bagNo,
  bagWeight
) {
  try {
    const currentDate = new Date().toISOString().split("T")[0];
    const currentTime = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const currentDateTime = new Date();

    // Determine the actual AWB number to use (master AWB for both cases)
    const actualAwbNo =
      awbDetails.type === "child" ? awbDetails.masterAwbNo : awbDetails.awbNo;

    const eventData = {
      eventCode: "SLH",
      eventDate: currentDate,
      eventTime: currentTime,
      status: "Shipment Left from Hub",
      eventUser: "System",
      eventLocation: "Hub",
      eventLogTime: currentDateTime,
      remark: `Bagged in Run ${runNo}, Bag ${bagNo}, Weight: ${bagWeight}kg`,
    };

    // Update EventActivity
    let eventActivity = await EventActivity.findOne({ awbNo: actualAwbNo });

    if (eventActivity) {
      // Update existing EventActivity
      eventActivity.eventCode.push(eventData.eventCode);
      eventActivity.eventDate.push(eventData.eventDate);
      eventActivity.eventTime.push(eventData.eventTime);
      eventActivity.status.push(eventData.status);
      eventActivity.eventUser.push(eventData.eventUser);
      eventActivity.eventLocation.push(eventData.eventLocation);
      eventActivity.eventLogTime.push(eventData.eventLogTime);

      if (eventData.remark) {
        eventActivity.remark = eventData.remark;
      }
    } else {
      // Create new EventActivity
      eventActivity = new EventActivity({
        awbNo: actualAwbNo,
        eventCode: [eventData.eventCode],
        eventDate: [eventData.eventDate],
        eventTime: [eventData.eventTime],
        status: [eventData.status],
        eventUser: [eventData.eventUser],
        eventLocation: [eventData.eventLocation],
        eventLogTime: [eventData.eventLogTime],
        remark: eventData.remark,
      });
    }

    await eventActivity.save();
    console.log(
      `✅ EventActivity updated for AWB: ${actualAwbNo} with status "Shipment Left from Hub"`
    );

    // Update Shipment status (for master AWB)
    let shipment = await Shipment.findOne({ awbNo: actualAwbNo });

    if (shipment) {
      // Update existing shipment status only
      shipment.status = "Shipment Left from Hub";
      shipment.updatedAt = new Date();

      await shipment.save();
      console.log(
        `✅ Shipment status updated for AWB: ${actualAwbNo} to "Shipment Left from Hub"`
      );
    } else {
      console.log(`⚠️ Shipment not found for AWB: ${actualAwbNo}`);
    }

    return true;
  } catch (error) {
    console.error(`❌ Error updating EventActivity/Shipment for AWB:`, error);
    return false;
  }
}

// Helper function to remove "Shipment Left from Hub" event from EventActivity
async function removeShipmentLeftEvent(awbDetails) {
  try {
    const actualAwbNo =
      awbDetails.type === "child" ? awbDetails.masterAwbNo : awbDetails.awbNo;

    const eventActivity = await EventActivity.findOne({ awbNo: actualAwbNo });

    if (!eventActivity) {
      console.log(`⚠️ No EventActivity found for AWB: ${actualAwbNo}`);
      return false;
    }

    // Find all indices where status is "Shipment Left from Hub"
    const indicesToRemove = [];
    eventActivity.status.forEach((status, index) => {
      if (status === "Shipment Left from Hub") {
        indicesToRemove.push(index);
      }
    });

    if (indicesToRemove.length === 0) {
      console.log(
        `⚠️ No "Shipment Left from Hub" events found for AWB: ${actualAwbNo}`
      );
      return false;
    }

    // Remove all matching events (in reverse order to avoid index issues)
    indicesToRemove.reverse().forEach((index) => {
      eventActivity.eventCode.splice(index, 1);
      eventActivity.eventDate.splice(index, 1);
      eventActivity.eventTime.splice(index, 1);
      eventActivity.status.splice(index, 1);
      eventActivity.eventUser.splice(index, 1);
      eventActivity.eventLocation.splice(index, 1);
      eventActivity.eventLogTime.splice(index, 1);
    });

    // Update remark to remove bagging info
    if (
      eventActivity.remark &&
      eventActivity.remark.includes("Bagged in Run")
    ) {
      eventActivity.remark = "";
    }

    await eventActivity.save();
    console.log(
      `✅ Removed "Shipment Left from Hub" event(s) from EventActivity for AWB: ${actualAwbNo}`
    );

    // Update Shipment status to previous status or default
    const shipment = await Shipment.findOne({ awbNo: actualAwbNo });

    if (shipment) {
      // Get the last remaining status from EventActivity, or set to a default
      const lastStatus =
        eventActivity.status.length > 0
          ? eventActivity.status[eventActivity.status.length - 1]
          : "Pending";

      shipment.status = lastStatus;
      shipment.updatedAt = new Date();

      await shipment.save();
      console.log(
        `✅ Shipment status reverted for AWB: ${actualAwbNo} to "${lastStatus}"`
      );
    }

    return true;
  } catch (error) {
    console.error(`❌ Error removing EventActivity for AWB:`, error);
    return false;
  }
}

// GET - Fetch bagging data
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
        return NextResponse.json({ error: "AWB not found" }, { status: 404 });
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

    console.log("POST request body:", body);

    if (!runNo) {
      return NextResponse.json(
        { error: "Run number is required" },
        { status: 400 }
      );
    }

    // Check if bagging data already exists
    const existingBagging = await Bagging.findOne({ runNo: runNo.toString() });

    if (existingBagging) {
      console.log("Bagging already exists for runNo:", runNo);
      return NextResponse.json(
        {
          error:
            "Bagging data already exists for this run number. Use PUT to manage items.",
        },
        { status: 409 }
      );
    }

    // Process rowData if provided
    let processedRowData = [];
    if (Array.isArray(rowData) && rowData.length > 0) {
      // Check for hold status on all AWBs first
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
          const awbType = awbDetails.type === "child" ? "Child AWB" : "AWB";
          const masterInfo =
            awbDetails.type === "child"
              ? ` (Master AWB: ${awbDetails.masterAwbNo})`
              : "";
          return NextResponse.json(
            {
              error: `${awbType} ${enteredAwb}${masterInfo} is on hold and cannot be used for bagging`,
              holdReason: awbDetails.holdReason,
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
          forwardingNo: awbDetails.forwardingNo, // Fetch from awbDetails
          remarks: item.remarks?.toString() || "",
          addedAt: item.addedAt || new Date().toISOString(),
        };

        if (awbDetails.type === "child") {
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

    // Parse date
    let parsedDate;
    if (body.date) {
      if (typeof body.date === "string" && body.date.includes("/")) {
        const [day, month, year] = body.date.split("/");
        const paddedMonth = month.padStart(2, "0");
        const paddedDay = day.padStart(2, "0");
        parsedDate = new Date(year + "-" + paddedMonth + "-" + paddedDay);
      } else {
        parsedDate = new Date(body.date);
      }

      if (isNaN(parsedDate)) {
        return NextResponse.json(
          { error: "Invalid date format", original: body.date },
          { status: 400 }
        );
      }
    }

    // Create new bagging record
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
      totalClubNo:
        body.totalClubNo !== undefined ? parseInt(body.totalClubNo) : 0,
      totalAwb: body.totalAwb !== undefined ? parseInt(body.totalAwb) : 0,
      totalWeight:
        body.totalWeight !== undefined ? parseFloat(body.totalWeight) : 0,
      uniqueId: body.uniqueId || "",
      remarks: body.remarks || "",
      rowData: processedRowData,
      isFinal: false,
    });

    console.log("Creating bagging with data:", baggingData);

    const newBagging = await baggingData.save();
    console.log("Bagging saved successfully:", newBagging._id);

    // Update EventActivity/Shipment status AND shipment details
    if (processedRowData.length > 0) {
      setImmediate(() => {
        const updatePromises = processedRowData.map(async (item) => {
          const enteredAwb = item.childShipment || item.awbNo;
          if (!enteredAwb) return Promise.resolve();

          const awbDetails = await getAwbDetails(enteredAwb);

          // Update EventActivity and Shipment status
          await updateEventActivityAndShipment(
            awbDetails,
            item.runNo,
            item.bagNo,
            item.bagWeight
          );

          // Always update the master Shipment (not ChildShipment)
          const masterAwbNo =
            awbDetails.type === "child" ? awbDetails.masterAwbNo : item.awbNo;

          return Shipment.updateOne(
            { awbNo: masterAwbNo },
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
              },
            },
            { upsert: false }
          ).catch((err) => console.log("Shipment update error:", err.message));
        });

        Promise.all(updatePromises).then(() => {
          console.log(
            `Updated ${processedRowData.length} shipments with bagging info and EventActivity/Shipment status`
          );
        });
      });
    }

    return NextResponse.json(newBagging, { status: 201 });
  } catch (error) {
    console.error("Error in POST:", error.message);
    console.error("Full error:", error);

    if (
      error.name === "MongooseError" &&
      error.message.includes("buffering timed out")
    ) {
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

// PUT - Manage items (add/remove) and update metadata
export async function PUT(req) {
  try {
    await connectDB();
    const body = await req.json();

    const { runNo, action, item, finalize, ...updateData } = body;

    if (!runNo) {
      return NextResponse.json(
        { error: "Run number is required" },
        { status: 400 }
      );
    }

    console.log("PUT request body:", body);

    // Handle finalization
    if (finalize === true) {
      const baggingData = await Bagging.findOne({ runNo: runNo.toString() });

      if (!baggingData) {
        return NextResponse.json(
          { error: "Bagging data not found for this run number" },
          { status: 404 }
        );
      }

      // Check if already finalized
      if (baggingData.isFinal) {
        return NextResponse.json(
          { error: "Bagging data is already finalized" },
          { status: 400 }
        );
      }

      // Check if there's data to finalize
      if (!baggingData.rowData || baggingData.rowData.length === 0) {
        return NextResponse.json(
          { error: "Cannot finalize bagging with no items" },
          { status: 400 }
        );
      }

      // Update to final status
      baggingData.isFinal = true;
      baggingData.finalizedAt = new Date();

      const finalizedBagging = await baggingData.save();

      console.log("Bagging finalized successfully:", finalizedBagging._id);

      return NextResponse.json(
        {
          message: "Bagging finalized successfully",
          data: finalizedBagging,
        },
        { status: 200 }
      );
    }

    // Check if bagging is finalized before allowing modifications
    const existingBagging = await Bagging.findOne({ runNo: runNo.toString() });

    if (existingBagging?.isFinal && (action === "add" || action === "remove")) {
      return NextResponse.json(
        { error: "Cannot modify finalized bagging data" },
        { status: 403 }
      );
    }

    // Handle item management actions (add/remove)
    if (action && (action === "add" || action === "remove")) {
      const baggingData = await Bagging.findOne({ runNo: runNo.toString() })
        .maxTimeMS(5000)
        .exec();

      if (!baggingData) {
        return NextResponse.json(
          {
            error:
              "Bagging data not found for this run number. Create one first.",
          },
          { status: 404 }
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
          const awbType = awbDetails.type === "child" ? "Child AWB" : "AWB";
          const masterInfo =
            awbDetails.type === "child"
              ? ` (Master AWB: ${awbDetails.masterAwbNo})`
              : "";
          return NextResponse.json(
            {
              error: `${awbType} ${enteredAwb}${masterInfo} is on hold and cannot be used for bagging`,
              holdReason: awbDetails.holdReason,
            },
            { status: 400 }
          );
        }

        // Check if AWB already exists (check both fields)
        const itemExists = baggingData.rowData.some((row) => {
          const rowIdentifier = row.childShipment || row.awbNo;
          return (
            rowIdentifier && rowIdentifier.trim().toUpperCase() === enteredAwb
          );
        });

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
          forwardingNo: awbDetails.forwardingNo, // Fetch from awbDetails
          remarks: item.remarks?.toString() || "",
          addedAt: new Date().toISOString(),
        };

        let newItem;
        if (awbDetails.type === "child") {
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

        // Update EventActivity and Shipment status BEFORE adding to bag
        const eventUpdateSuccess = await updateEventActivityAndShipment(
          awbDetails,
          newItem.runNo,
          newItem.bagNo,
          newItem.bagWeight
        );

        if (!eventUpdateSuccess) {
          console.warn(
            `EventActivity/Shipment update failed for AWB: ${enteredAwb}, but continuing with bagging`
          );
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

        // Update with new data
        baggingData.noOfBags = numberOfBags;
        baggingData.noOfAwb = baggingData.rowData.length;
        baggingData.runWeight = totalWeight;

        // Save the updated document
        const updatedBagging = await baggingData.save();

        console.log("Successfully added AWB:", enteredAwb);

        // Update master shipment with bagging info (for both master and child AWBs)
        setImmediate(async () => {
          const masterAwbNo =
            awbDetails.type === "child"
              ? awbDetails.masterAwbNo
              : awbDetails.masterAwbNo || enteredAwb;

          Shipment.updateOne(
            { awbNo: masterAwbNo },
            {
              $set: {
                runNo: newItem.runNo,
                bag: newItem.bagNo,
                bagWeight: newItem.bagWeight,
                baggingStatus: "bagged",
                baggedAt: new Date(),
                runDate: baggingData.date || new Date(),
                alMawb: baggingData.alMawb || "",
                flight: baggingData.flight || "",
                obc: baggingData.obc || "",
              },
            },
            { upsert: false }
          )
            .then(() => {
              console.log(
                `Updated shipment ${masterAwbNo} with bagging and run details`
              );
            })
            .catch((err) => console.log("Shipment update error:", err.message));
        });

        return NextResponse.json(updatedBagging, { status: 200 });
      }

      // Handle REMOVE action
      if (action === "remove" && item?.awbNo) {
        const enteredAwb = item.awbNo.toString().trim().toUpperCase();

        console.log("Attempting to remove AWB:", enteredAwb);

        // Get AWB details first
        const awbDetails = await getAwbDetails(enteredAwb);

        if (!awbDetails) {
          console.warn(
            `AWB details not found for ${enteredAwb}, continuing with removal`
          );
        }

        // Find the item to be removed (check both fields)
        const itemToRemove = baggingData.rowData.find((row) => {
          const rowIdentifier = row.childShipment || row.awbNo;
          return (
            rowIdentifier && rowIdentifier.trim().toUpperCase() === enteredAwb
          );
        });

        if (!itemToRemove) {
          return NextResponse.json(
            { error: `AWB ${enteredAwb} not found in this run` },
            { status: 404 }
          );
        }

        // Remove the "Shipment Left from Hub" event from EventActivity
        if (awbDetails) {
          await removeShipmentLeftEvent(awbDetails);
        }

        // Remove the item from rowData array
        baggingData.rowData = baggingData.rowData.filter((row) => {
          const rowIdentifier = row.childShipment || row.awbNo;
          return !(
            rowIdentifier && rowIdentifier.trim().toUpperCase() === enteredAwb
          );
        });

        // Recalculate summary
        const numberOfBags = new Set(
          baggingData.rowData.map((row) => row.bagNo)
        ).size;

        const totalWeight = baggingData.rowData.reduce(
          (sum, row) => sum + (parseFloat(row.bagWeight) || 0),
          0
        );

        // Update summary fields
        baggingData.noOfBags = numberOfBags;
        baggingData.noOfAwb = baggingData.rowData.length;
        baggingData.runWeight = totalWeight;

        // Save the updated document
        const updatedBagging = await baggingData.save();

        console.log("Successfully removed AWB:", enteredAwb);

        // Remove bagging info from master shipment (for both master and child AWBs)
        setImmediate(async () => {
          const masterAwbNo =
            awbDetails?.type === "child" ? awbDetails.masterAwbNo : enteredAwb;

          Shipment.updateOne(
            { awbNo: masterAwbNo },
            {
              $unset: {
                runNo: "",
                bag: "",
                bagWeight: "",
                baggingStatus: "",
                baggedAt: "",
                runDate: "",
                alMawb: "",
                flight: "",
                obc: "",
              },
            }
          )
            .then(() => {
              console.log(`Removed bagging info from shipment ${masterAwbNo}`);
            })
            .catch((err) =>
              console.log("Shipment removal error:", err.message)
            );
        });

        return NextResponse.json(updatedBagging, { status: 200 });
      }
    }

    // Handle metadata update (if no action specified)
    if (Object.keys(updateData).length > 0) {
      const existingBagging = await Bagging.findOne({ runNo });

      if (!existingBagging) {
        return NextResponse.json(
          {
            error:
              "Bagging data not found for this run number. Use POST to create new.",
          },
          { status: 404 }
        );
      }

      // Prevent updates if finalized (unless explicitly unfinalizing)
      if (existingBagging.isFinal && updateData.isFinal !== false) {
        return NextResponse.json(
          { error: "Cannot update finalized bagging data" },
          { status: 403 }
        );
      }

      // Handle date parsing if provided
      if (updateData.date) {
        let parsedDate;
        if (
          typeof updateData.date === "string" &&
          updateData.date.includes("/")
        ) {
          const [day, month, year] = updateData.date.split("/");
          const paddedMonth = month.padStart(2, "0");
          const paddedDay = day.padStart(2, "0");
          parsedDate = new Date(year + "-" + paddedMonth + "-" + paddedDay);
        } else {
          parsedDate = new Date(updateData.date);
        }

        if (isNaN(parsedDate)) {
          return NextResponse.json(
            { error: "Invalid date format", original: updateData.date },
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

      console.log("Bagging metadata updated:", updatedBagging);

      // Update all master shipments in this run if run details changed
      if (
        updateData.date ||
        updateData.alMawb ||
        updateData.flight ||
        updateData.obc
      ) {
        setImmediate(async () => {
          const awbsInRun = updatedBagging.rowData;

          if (awbsInRun.length > 0) {
            const shipmentUpdates = {};
            if (updateData.date) shipmentUpdates.runDate = updateData.date;
            if (updateData.alMawb) shipmentUpdates.alMawb = updateData.alMawb;
            if (updateData.flight) shipmentUpdates.flight = updateData.flight;
            if (updateData.obc) shipmentUpdates.obc = updateData.obc;

            const updatePromises = awbsInRun.map(async (row) => {
              const enteredAwb = row.childShipment || row.awbNo;
              if (!enteredAwb) return Promise.resolve();

              const awbDetails = await getAwbDetails(enteredAwb);

              // Always update master shipment (not ChildShipment)
              const masterAwbNo =
                awbDetails?.type === "child"
                  ? awbDetails.masterAwbNo
                  : row.awbNo;

              return Shipment.updateOne(
                { awbNo: masterAwbNo },
                { $set: shipmentUpdates }
              );
            });

            Promise.all(updatePromises)
              .then(() => {
                console.log(
                  `Updated run details for ${awbsInRun.length} shipments`
                );
              })
              .catch((err) => {
                console.log(
                  "Error updating shipment run details:",
                  err.message
                );
              });
          }
        });
      }

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

// DELETE - Delete bagging data
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

    const baggingToDelete = await Bagging.findOne({ runNo });

    if (!baggingToDelete) {
      return NextResponse.json(
        { error: "Bagging data not found for this run number" },
        { status: 404 }
      );
    }

    // Prevent deletion of finalized bagging
    if (baggingToDelete.isFinal) {
      return NextResponse.json(
        { error: "Cannot delete finalized bagging data" },
        { status: 403 }
      );
    }

    const deletedBagging = await Bagging.findOneAndDelete({ runNo });

    // Remove "Shipment Left from Hub" events and bagging info from master shipments
    if (deletedBagging.rowData && Array.isArray(deletedBagging.rowData)) {
      setImmediate(async () => {
        const unsetFields = {
          runNo: "",
          bag: "",
          bagWeight: "",
          baggingStatus: "",
          baggedAt: "",
          runDate: "",
          alMawb: "",
          flight: "",
          obc: "",
        };

        const updatePromises = deletedBagging.rowData.map(async (row) => {
          const enteredAwb = row.childShipment || row.awbNo;
          if (!enteredAwb) return Promise.resolve();

          const awbDetails = await getAwbDetails(enteredAwb);

          // Remove the "Shipment Left from Hub" event
          if (awbDetails) {
            await removeShipmentLeftEvent(awbDetails);
          }

          // Always update master shipment (not ChildShipment)
          const masterAwbNo =
            awbDetails?.type === "child" ? awbDetails.masterAwbNo : row.awbNo;

          return Shipment.updateOne(
            { awbNo: masterAwbNo },
            { $unset: unsetFields }
          );
        });

        Promise.all(updatePromises)
          .then(() => {
            console.log(
              `Removed bagging info and events from ${deletedBagging.rowData.length} shipments`
            );
          })
          .catch((err) => {
            console.log("Error removing shipment info:", err.message);
          });
      });
    }

    console.log(`Bagging data deleted for run ${runNo}`);

    return NextResponse.json(
      { message: "Bagging data deleted successfully", deletedBagging },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting bagging data:", error.message);
    return NextResponse.json(
      {
        error: "Failed to delete bagging data",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
