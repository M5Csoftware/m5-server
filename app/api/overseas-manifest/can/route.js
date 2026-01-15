import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CANWeightValue from "@/app/model/CANWeightValue";

export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const runNo = searchParams.get("runNo");
    
    if (!runNo) {
      return NextResponse.json(
        { success: false, message: "Run Number is required" },
        { status: 400 }
      );
    }

    // Find all shipments with the given run number AND sector contains "canada" (case-insensitive)
    const shipments = await Shipment.find({ 
      runNo,
      sector: { $regex: /canada/i }
    })
      .sort({ awbNo: 1 })
      .lean();

    if (shipments.length === 0) {
      return NextResponse.json(
        { success: false, message: "No Canada shipments found for this Run Number" },
        { status: 404 }
      );
    }

    // Get all weight values from database for rate calculation
    const weightValues = await CANWeightValue.find({})
      .sort({ weight: 1 })
      .lean();

    // Create a map for quick lookup
    const weightValueMap = new Map();
    weightValues.forEach(item => {
      weightValueMap.set(item.weight, item.valuePerKg);
    });

    // Process shipments and calculate values
    const processedData = shipments.map(shipment => {
      const totalActualWt = shipment.totalActualWt || 0;
      
      // Calculate weight for value (round off totalActualWt)
      const weightForValue = Math.round(totalActualWt);
      
      // Get rate from excel data
      let rateRequired = 0;
      
      // Try exact match first
      if (weightValueMap.has(weightForValue)) {
        rateRequired = weightValueMap.get(weightForValue);
      } else {
        // Find the closest lower weight
        const matchingWeights = Array.from(weightValueMap.keys())
          .filter(w => w <= weightForValue)
          .sort((a, b) => b - a);
        
        if (matchingWeights.length > 0) {
          rateRequired = weightValueMap.get(matchingWeights[0]);
        } else {
          // If no match found, use the smallest weight value
          const smallestWeight = Math.min(...Array.from(weightValueMap.keys()));
          rateRequired = weightValueMap.get(smallestWeight) || 1.0;
        }
      }
      
      // Calculate value required
      const valueRequired = weightForValue * rateRequired;
      
      // Calculate round off remove (value required + 0.33)
      const roundOffRemove = valueRequired + 0.33;
      
      // Final value (same as round off remove)
      const finalValue = roundOffRemove;
      
      // Cross check (finalValue / weight for value)
      const crossCheck = weightForValue > 0 ? (finalValue / weightForValue).toFixed(4) : 0;

      return {
        awbNo: shipment.awbNo || "",
        shipperName: shipment.shipperFullName || "",
        recieverName: shipment.receiverFullName || "",
        description: Array.isArray(shipment.content) ? shipment.content.join(", ") : shipment.content || "",
        destination: shipment.destination || "DDP", // Default to DDP
        pcs: shipment.pcs || 0,
        weight: totalActualWt.toFixed(2),
        weightForValue: weightForValue,
        rateRequired: rateRequired.toFixed(2),
        valueRequired: valueRequired.toFixed(2),
        roundOffRemove: roundOffRemove.toFixed(2),
        finalValue: finalValue.toFixed(2),
        crossCheck: crossCheck,
        // Include original data for reference
        shipmentDate: shipment.date || "",
        sector: shipment.sector || "",
        origin: shipment.origin || "",
        runNo: shipment.runNo || "",
      };
    });

    // Calculate totals
    const totals = {
      totalPcs: processedData.reduce((sum, item) => sum + item.pcs, 0),
      totalWeight: processedData.reduce((sum, item) => sum + parseFloat(item.weight), 0).toFixed(2),
      totalValue: processedData.reduce((sum, item) => sum + parseFloat(item.finalValue), 0).toFixed(2),
    };

    // Get run info from first shipment
    const firstShipment = shipments[0];
    const runInfo = {
      runNo: firstShipment.runNo || "",
      sector: firstShipment.sector || "",
      flight: firstShipment.flight || "",
      date: firstShipment.date || "",
      count: shipments.length,
    };

    return NextResponse.json({
      success: true,
      data: processedData,
      totals,
      runInfo,
      count: shipments.length,
    });

  } catch (error) {
    console.error("Error fetching CAN manifest:", error);
    return NextResponse.json(
      { success: false, message: "Error fetching manifest data: " + error.message },
      { status: 500 }
    );
  }
}