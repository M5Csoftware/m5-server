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

    console.log("===================================================================");
    console.log("CANADA MASTER SHEET CALCULATIONS");
    console.log("===================================================================");
    console.log(`Total shipments found: ${shipments.length}`);
    console.log(`Run Number: ${runNo}`);
    console.log("===================================================================\n");

    // First, calculate finalValue for each shipment (Excel Sheet 2 calculation)
    const shipmentsWithFinalValue = shipments.map(shipment => {
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
        ...shipment,
        weightForValue: weightForValue,
        rateRequired: rateRequired,
        finalValue: finalValue,
        valueRequired: valueRequired,
        roundOffRemove: roundOffRemove,
        crossCheck: crossCheck
      };
    });

    // ======================
    // STEP 1: First Excel Calculation (Sheet1)
    // ======================
    console.log("EXCEL SHEET 1 CALCULATIONS (Individual Items)");
    console.log("===================================================================");
    
    const firstExcelData = shipmentsWithFinalValue.flatMap(shipment => {
      // Use the calculated finalValue as Total AWB Value
      const totalAwbValue = parseFloat(shipment.finalValue) || 0;
      
      // For Sheet1, we need individual items
      const items = [];
      
      console.log(`\nAWB: ${shipment.awbNo || "N/A"}`);
      console.log(`- Weight for Value: ${shipment.weightForValue} (from ${shipment.totalActualWt})`);
      console.log(`- Rate Required: ${shipment.rateRequired}`);
      console.log(`- Total AWB Value (calculated): ${totalAwbValue}`);
      
      // Process shipmentAndPackageDetails similar to Australia route
      if (shipment.shipmentAndPackageDetails && 
          typeof shipment.shipmentAndPackageDetails === 'object') {
        
        // Handle both object format {"1": [...], "2": [...]} and array format
        let detailsArray = [];
        
        if (Array.isArray(shipment.shipmentAndPackageDetails)) {
          detailsArray = shipment.shipmentAndPackageDetails;
        } else {
          // Extract arrays from object keys (box numbers)
          Object.keys(shipment.shipmentAndPackageDetails).forEach(boxKey => {
            const boxItems = shipment.shipmentAndPackageDetails[boxKey];
            if (Array.isArray(boxItems)) {
              boxItems.forEach(item => {
                detailsArray.push({
                  ...item,
                  box: boxKey
                });
              });
            }
          });
        }

        // Calculate total original custom value from all items
        const originalCustomValue = detailsArray.reduce((sum, detail) => {
          const amount = detail.amount || detail.amt || 0;
          return sum + parseFloat(amount);
        }, 0);

        console.log(`- Original Custom Value (sum of all items): ${originalCustomValue}`);

        // Process each detail item
        detailsArray.forEach((detail, idx) => {
          const description = detail.context || detail.description || "No Description";
          const hsn = detail.hsnNo || detail.hsn || "";
          const qty = detail.qty || 0;
          const rate = detail.rate || 0;
          const amount = detail.amount || detail.amt || 0;
          const boxNo = detail.box || "1";
          
          // Calculate % age of current value = Amt / OriginalCustomValue
          const percentageOfCurrentValue = originalCustomValue > 0 ? (parseFloat(amount) / originalCustomValue) : 0;
          
          // TOTAL AWB VALUE REQUIRED = calculated finalValue
          const totalAwbValueRequired = totalAwbValue;
          
          // VALUE PER CONTENT = TOTAL AWB VALUE REQUIRED * %age of current value
          const valuePerContent = totalAwbValueRequired * percentageOfCurrentValue;
          
          console.log(`\n  Item ${idx + 1} (Box ${boxNo}):`);
          console.log(`    - Description: ${description}`);
          console.log(`    - HSN: ${hsn}`);
          console.log(`    - Qty: ${qty}`);
          console.log(`    - Rate: ${rate}`);
          console.log(`    - Amount: ${amount}`);
          console.log(`    - % of Current Value: ${amount} / ${originalCustomValue} = ${percentageOfCurrentValue.toFixed(4)} (${(percentageOfCurrentValue * 100).toFixed(2)}%)`);
          console.log(`    - Total AWB Value Required: ${totalAwbValueRequired}`);
          console.log(`    - Value per Content: ${totalAwbValueRequired} × ${percentageOfCurrentValue.toFixed(4)} = ${valuePerContent.toFixed(2)}`);
          
          items.push({
            awbNo: shipment.awbNo || "",
            box: boxNo,
            description: description,
            hsn: hsn,
            qty: parseFloat(qty),
            rate: parseFloat(rate),
            amount: parseFloat(amount),
            originalCustomValue: originalCustomValue,
            currency: shipment.currency || shipment.currencys || "CAD",
            percentageOfCurrentValue: percentageOfCurrentValue,
            totalAwbValue: totalAwbValueRequired,
            valuePerContent: valuePerContent
          });
        });
        
      } else {
        // Fallback: If no shipmentAndPackageDetails, use content/boxes
        let description = "No Description";
        if (Array.isArray(shipment.content) && shipment.content.length > 0) {
          description = shipment.content.filter(c => c && c.trim()).join(", ") || description;
        } else if (typeof shipment.content === 'string' && shipment.content.trim()) {
          description = shipment.content;
        }
        
        const originalCustomValue = parseFloat(shipment.customValue) || parseFloat(shipment.totalInvoiceValue) || 0;
        const amount = originalCustomValue;
        const rate = 1;
        const quantity = 1;
        
        const percentageOfCurrentValue = originalCustomValue > 0 ? (amount / originalCustomValue) : 0;
        const totalAwbValueRequired = totalAwbValue;
        const valuePerContent = totalAwbValueRequired * percentageOfCurrentValue;
        
        console.log(`- Original Custom Value (total invoice): ${originalCustomValue}`);
        console.log(`\n  Shipment Item (fallback):`);
        console.log(`    - Amount: ${amount}`);
        console.log(`    - % of Current Value: ${percentageOfCurrentValue.toFixed(4)}`);
        console.log(`    - Value per Content: ${valuePerContent.toFixed(2)}`);
        
        items.push({
          awbNo: shipment.awbNo || "",
          box: "1",
          description: description,
          hsn: "",
          qty: quantity,
          rate: rate,
          amount: amount,
          originalCustomValue: originalCustomValue,
          currency: shipment.currency || shipment.currencys || "CAD",
          percentageOfCurrentValue: percentageOfCurrentValue,
          totalAwbValue: totalAwbValueRequired,
          valuePerContent: valuePerContent
        });
      }
      
      return items;
    });

    console.log("\n===================================================================");
    console.log(`TOTAL ITEMS IN SHEET 1: ${firstExcelData.length}`);
    console.log("===================================================================\n");

    // ======================
    // STEP 2: Second Excel - Group by AWBNo and Description
    // ======================
    console.log("EXCEL SHEET 2 CALCULATIONS (Grouped Items)");
    console.log("===================================================================");
    console.log("Grouping items by AWB No and Description...\n");
    
    const groupedMap = new Map();
    
    firstExcelData.forEach((item, index) => {
      // Group by AWB No + Description + HSN
      const key = `${item.awbNo}_${item.description}_${item.hsn}`;
      
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          awbNo: item.awbNo,
          description: item.description,
          hsn: item.hsn,
          totalQty: 0,
          totalValuePerContent: 0,
          originalCustomValue: item.originalCustomValue,
          box: item.box || ""
        });
        console.log(`New group created for AWB: ${item.awbNo}, Description: ${item.description}`);
      }
      
      const existing = groupedMap.get(key);
      const oldQty = existing.totalQty;
      const oldValue = existing.totalValuePerContent;
      
      existing.totalQty += item.qty;
      existing.totalValuePerContent += item.valuePerContent;
      
      console.log(`  Item ${index + 1} added to group`);
      console.log(`    - Qty: ${oldQty} + ${item.qty} = ${existing.totalQty}`);
      console.log(`    - Value per Content: ${oldValue.toFixed(2)} + ${item.valuePerContent.toFixed(2)} = ${existing.totalValuePerContent.toFixed(2)}`);
    });
    
    const secondExcelData = Array.from(groupedMap.values());
    
    console.log("\nGROUPED RESULTS (Sheet 2):");
    console.log("-------------------------------------------------------------------");
    secondExcelData.forEach((item, index) => {
      console.log(`Group ${index + 1}: AWB ${item.awbNo}`);
      console.log(`  - Description: ${item.description}`);
      console.log(`  - HSN: ${item.hsn}`);
      console.log(`  - Total Qty: ${item.totalQty}`);
      console.log(`  - Sum of Value per Content (from Sheet 1): ${item.totalValuePerContent.toFixed(2)}`);
      console.log("-------------------------------------------------------------------");
    });
    
    console.log(`\nTOTAL GROUPS IN SHEET 2: ${secondExcelData.length}`);
    console.log("===================================================================\n");

    // ======================
    // STEP 3: Final Invoice Data (Sheet 3)
    // ======================
    console.log("FINAL INVOICE CALCULATIONS (Sheet 3)");
    console.log("===================================================================");
    console.log("Creating final invoice items...\n");
    
    const finalInvoiceData = [];
    const awbTotalAmtMap = new Map();
    
    secondExcelData.forEach((item, index) => {
      // RATE = totalValuePerContent from Sheet 2
      const rate = item.totalValuePerContent;
      
      const finalItem = {
        awbNo: item.awbNo,
        box: item.box || "",
        description: item.description,
        hsn: item.hsn,
        qty: item.totalQty,
        rate: rate,
        amt: rate * item.totalQty,
        customValue: 0,
        customCurrency: "CAD"
      };
      
      finalInvoiceData.push(finalItem);
      
      const currentTotal = awbTotalAmtMap.get(item.awbNo) || 0;
      awbTotalAmtMap.set(item.awbNo, currentTotal + finalItem.amt);
      
      console.log(`Invoice Item ${index + 1}: AWB ${item.awbNo}`);
      console.log(`  - Description: ${item.description}`);
      console.log(`  - HSN: ${item.hsn}`);
      console.log(`  - Qty: ${item.totalQty}`);
      console.log(`  - Rate (from Sheet 2): ${rate.toFixed(2)}`);
      console.log(`  - Amount: ${rate.toFixed(2)} × ${item.totalQty} = ${finalItem.amt.toFixed(2)}`);
      console.log("-------------------------------------------------------------------");
    });
    
    // Update customValue as sum of all amt for same AWB
    console.log("\nCalculating custom values (sum of amt for same AWB)...");
    finalInvoiceData.forEach(item => {
      const totalAmtForAWB = awbTotalAmtMap.get(item.awbNo) || 0;
      item.customValue = totalAmtForAWB;
      console.log(`AWB ${item.awbNo}: Custom Value = ${totalAmtForAWB.toFixed(2)} (sum of all amt)`);
    });

    // Calculate totals
    const totalQty = finalInvoiceData.reduce((sum, item) => sum + item.qty, 0);
    const totalAmount = finalInvoiceData.reduce((sum, item) => sum + item.amt, 0);
    
    const uniqueCustomValues = Array.from(awbTotalAmtMap.values());
    const totalCustomValue = uniqueCustomValues.reduce((sum, value) => sum + value, 0);
    
    console.log("\n===================================================================");
    console.log("FINAL TOTALS (Sheet 3):");
    console.log("===================================================================");
    console.log(`Total Quantity: ${totalQty}`);
    console.log(`Total Amount: ${totalAmount.toFixed(2)}`);
    console.log(`Total Custom Value: ${totalCustomValue.toFixed(2)}`);
    console.log(`Number of AWB: ${awbTotalAmtMap.size}`);
    console.log(`Number of Invoice Items: ${finalInvoiceData.length}`);
    console.log("===================================================================\n");

    // Get run info from first shipment
    const firstShipment = shipmentsWithFinalValue[0];
    const runInfo = {
      runNo: firstShipment.runNo || "",
      sector: firstShipment.sector || "",
      flight: firstShipment.flight || "",
      date: firstShipment.date || "",
      count: shipments.length,
    };

    const totals = {
      totalQty: totalQty,
      totalAmount: totalAmount,
      totalCustomValue: totalCustomValue
    };

    return NextResponse.json({
      success: true,
      data: {
        firstExcel: firstExcelData,
        secondExcel: secondExcelData,
        finalInvoice: finalInvoiceData
      },
      totals,
      runInfo,
      count: shipments.length,
    });

  } catch (error) {
    console.error("Error fetching CAN invoice data:", error);
    return NextResponse.json(
      { success: false, message: "Error fetching invoice data: " + error.message },
      { status: 500 }
    );
  }
}