import ChildShipment from "@/app/model/portal/ChildShipment";
import Shipment from "@/app/model/portal/Shipment";
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";

// Connect to MongoDB
connectDB();

// CREATE: Add new child shipments
export async function POST(req) {
  try {
    const body = await req.json();
    const { children, masterAwbNo, destination } = body;

    if (!Array.isArray(children) || !masterAwbNo || !destination) {
      throw new Error("Missing required fields");
    }

    const enrichedChildren = children.map((child) => ({
      ...child,
      masterAwbNo,
      destination,
    }));

    // Save child shipments
    const saved = await ChildShipment.insertMany(enrichedChildren);

    // Get existing shipment to preserve current shipmentAndPackageDetails
    const existingShipment = await Shipment.findOne({ awbNo: masterAwbNo });
    
    if (!existingShipment) {
      console.warn(`Master shipment with AWB ${masterAwbNo} not found`);
      return NextResponse.json(
        { 
          message: "Created", 
          data: saved,
          shipmentUpdated: false,
          warning: "Master shipment not found"
        },
        { status: 201 }
      );
    }

    // Preserve existing shipmentAndPackageDetails 
    const updatedPackageDetails = { ...existingShipment.shipmentAndPackageDetails };
    
    // Add childNo to shipmentAndPackageDetails starting from index 2 (skipping master at index 1)
    saved.forEach((child, index) => {
      const childIndex = (index + 2).toString(); // Start from "2" for first child
      const childNo = child.childAwbNo || child.MAWB || "";
      
      if (updatedPackageDetails[childIndex]) {
        // If package details exist for this index, add childNo to each item in the array
        updatedPackageDetails[childIndex] = updatedPackageDetails[childIndex].map(item => ({
          ...item,
          childNo: childNo
        }));
      } else {
        // If no package details exist for this index, create array with childNo only
        updatedPackageDetails[childIndex] = [{ childNo: childNo }];
      }
    });

    // Handle boxes array separately - add childNo to each box (skip first box which is master)
    let updatedBoxes = existingShipment.boxes ? [...existingShipment.boxes] : [];
    
    // Add childNo to boxes starting from index 1 (skip first box at index 0)
    if (updatedBoxes.length > 0 && saved.length > 0) {
      updatedBoxes = updatedBoxes.map((box, boxIndex) => {
        if (boxIndex === 0) {
          // First box remains with master AWB (no childNo)
          return box;
        }
        
        // For remaining boxes, assign child AWBs
        const childIndex = boxIndex - 1; // Offset by 1 since first box is master
        const childNo = saved[childIndex]?.childAwbNo || saved[childIndex]?.MAWB || "";
        
        return {
          ...box,
          childNo: childNo
        };
      });
    }

    // Prepare update object
    const updateData = { 
      shipmentAndPackageDetails: updatedPackageDetails 
    };

    // Only add boxes to update if they exist
    if (updatedBoxes.length > 0) {
      updateData.boxes = updatedBoxes;
    }

    // Update the master shipment with merged package details and updated boxes
    const updatedShipment = await Shipment.findOneAndUpdate(
      { awbNo: masterAwbNo },
      { 
        $set: updateData
      },
      { 
        new: true,
        upsert: false
      }
    );

    if (!updatedShipment) {
      console.warn(`Master shipment with AWB ${masterAwbNo} not found for package details update`);
    }

    return NextResponse.json(
      { 
        message: "Created", 
        data: saved,
        shipmentUpdated: !!updatedShipment,
        packageDetails: updatedPackageDetails,
        boxes: updatedBoxes
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// READ: Get child shipments by masterAwbNo or all
export async function GET(req) {
  try {
    const masterAwbNo = req.nextUrl.searchParams.get("masterAwbNo");
    const childAwbNo = req.nextUrl.searchParams.get("childAwbNo");

    let result;

    if (childAwbNo) {
      result = await ChildShipment.findOne({ childAwbNo });
    } else if (masterAwbNo) {
      result = await ChildShipment.find({ masterAwbNo });
    } else {
      result = await ChildShipment.find();
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// UPDATE: Update one child shipment by ID
export async function PUT(req) {
  try {
    const body = await req.json();
    const { _id, ...updates } = body;

    if (!_id) throw new Error("Missing _id for update");

    const updated = await ChildShipment.findByIdAndUpdate(_id, updates, {
      new: true,
    });

    if (!updated) throw new Error("Shipment not found");

    return NextResponse.json(
      { message: "Updated", data: updated },
      { status: 200 }
    );
  } catch (error) {
    console.error("PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// DELETE: Delete one child shipment by childAwbNo
export async function DELETE(req) {
  try {
    const body = await req.json();
    const { childAwbNo } = body;

    if (!childAwbNo) {
      throw new Error("Missing childAwbNo for deletion");
    }

    // Find the child shipment first to get masterAwbNo
    const childShipment = await ChildShipment.findOne({ childAwbNo });
    
    if (!childShipment) {
      throw new Error("Child shipment not found");
    }

    const masterAwbNo = childShipment.masterAwbNo;

    // Delete the child shipment
    const deleted = await ChildShipment.findOneAndDelete({ childAwbNo });

    // Update the master shipment to remove childNo from boxes and package details
    const masterShipment = await Shipment.findOne({ awbNo: masterAwbNo });
    
    if (masterShipment) {
      // Remove childNo from boxes
      let updatedBoxes = masterShipment.boxes ? [...masterShipment.boxes] : [];
      updatedBoxes = updatedBoxes.map(box => {
        if (box.childNo === childAwbNo) {
          const { childNo, ...boxWithoutChildNo } = box;
          return boxWithoutChildNo;
        }
        return box;
      });

      // Remove childNo from shipmentAndPackageDetails
      let updatedPackageDetails = { ...masterShipment.shipmentAndPackageDetails };
      Object.keys(updatedPackageDetails).forEach(key => {
        if (Array.isArray(updatedPackageDetails[key])) {
          updatedPackageDetails[key] = updatedPackageDetails[key].map(item => {
            if (item.childNo === childAwbNo) {
              const { childNo, ...itemWithoutChildNo } = item;
              return itemWithoutChildNo;
            }
            return item;
          });
        }
      });

      // Update master shipment
      await Shipment.findOneAndUpdate(
        { awbNo: masterAwbNo },
        {
          $set: {
            boxes: updatedBoxes,
            shipmentAndPackageDetails: updatedPackageDetails
          }
        }
      );
    }

    return NextResponse.json(
      { message: "Deleted", data: deleted },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}