import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import Bagging from "@/app/model/bagging";
import RunEntry from "@/app/model/RunEntry";
import CustomerAccount from "@/app/model/CustomerAccount";
import ChildShipment from "@/app/model/portal/ChildShipment";

connectDB();

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const awbNo = searchParams.get("awbNo");

        // Variables 
        let bagNo = null;
        let bagWeight = null;
        let almawb = null;
        let flight = null;
        let flightNo = null;
        let obc = null;
        let customerName = null;
        let branch = null;
        let childShipments = [];
        let mawb = null;
        let runNo = null;

        if (!awbNo) {
            return NextResponse.json(
                { message: "Airway bill number is required" },
                { status: 400 }
            );
        }

        if (awbNo) {
            let shipment = await Shipment.findOne({ awbNo });

            if (!shipment) {
                const child = await ChildShipment.findOne({ childAwbNo: awbNo });
                if (!child) {
                    return NextResponse.json(
                        { message: "No matching shipment found" },
                        { status: 404 }
                    );
                }
                shipment = await Shipment.findOne({ awbNo: child.masterAwbNo });
            }
            
            const accountCode = shipment.accountCode;

            // ✅ FIXED: Fetch bagging data for THIS AWB (not from shipment.runNo)
            const baggingData = await Bagging.findOne({
                $or: [
                    { "rowData.awbNo": awbNo },
                    { "rowData.childShipment": awbNo }
                ]
            });

            if (baggingData) {
                // Find the specific row for this AWB
                const row = baggingData.rowData.find(
                    item => item.awbNo === awbNo || item.childShipment === awbNo
                );

                if (row) {
                    bagNo = row.bagNo || null;
                    bagWeight = row.bagWeight || null;
                    runNo = row.runNo || baggingData.runNo || null;
                }

                // Get bagging-level details
                mawb = baggingData.Mawb || null;
                almawb = baggingData.alMawb || null;
                flight = baggingData.flight || null;
                obc = baggingData.obc || null;

                // Get flight number from RunEntry if we have runNo
                if (runNo) {
                    const runData = await RunEntry.findOne({ runNo });
                    if (runData) {
                        flightNo = runData.flightnumber || null;
                    }
                }
            }

            // Fetch child shipments for this master AWB
            const childShipmentsData = await ChildShipment.find({ 
                masterAwbNo: awbNo 
            });
            
            if (childShipmentsData && childShipmentsData.length > 0) {
                // Fetch all bagging data that contains any of these child AWBs
                const childAwbNumbers = childShipmentsData.map(c => c.childAwbNo);
                
                const baggingDataList = await Bagging.find({
                    "rowData.childShipment": { $in: childAwbNumbers }
                });
                
                // Get unique run numbers from bagging data to fetch RunEntry details
                const runNumbers = [...new Set(baggingDataList.map(b => b.runNo))];
                const runEntries = await RunEntry.find({ runNo: { $in: runNumbers } });
                
                // Create a map of runNo to RunEntry details
                const runEntryMap = {};
                runEntries.forEach(runEntry => {
                    runEntryMap[runEntry.runNo] = {
                        flightNo: runEntry.flightnumber || ""
                    };
                });
                
                // Create a map of child AWB to bagging details for quick lookup
                const baggingMap = {};
                baggingDataList.forEach(baggingDoc => {
                    baggingDoc.rowData.forEach(row => {
                        if (row.childShipment && childAwbNumbers.includes(row.childShipment)) {
                            const runEntryData = runEntryMap[baggingDoc.runNo] || {};
                            baggingMap[row.childShipment] = {
                                bagNo: row.bagNo || "",
                                bagWeight: row.bagWeight || "",
                                runNo: row.runNo || baggingDoc.runNo || "",
                                alMawb: baggingDoc.alMawb || "",
                                flight: baggingDoc.flight || "",
                                flightNo: runEntryData.flightNo || "",
                                obc: baggingDoc.obc || ""
                            };
                        }
                    });
                });
                
                // Build child shipments array with bagging details
                childShipments = childShipmentsData.map((child, index) => {
                    const bagDetails = baggingMap[child.childAwbNo] || {
                        bagNo: "",
                        bagWeight: "",
                        runNo: "",
                        alMawb: "",
                        flight: "",
                        flightNo: "",
                        obc: ""
                    };
                    
                    return {
                        srNo: index + 1,
                        childAwbNo: child.childAwbNo,
                        forwardingNo: child.forwardingNo || "",
                        forwarderCode: child.forwarder || "",
                        destination: child.destination || "",
                        consigneeName: child.consigneeName || "",
                        bagNo: bagDetails.bagNo,
                        bagWeight: bagDetails.bagWeight,
                        runNo: bagDetails.runNo,
                        alMawb: bagDetails.alMawb,
                        flight: bagDetails.flight,
                        flightNo: bagDetails.flightNo,
                        obc: bagDetails.obc
                    };
                });
            }
            
            const customer = await CustomerAccount.findOne({ accountCode });
            if (customer) {
                customerName = customer.name;
                branch = customer.branch;
            }
            
            const consignorDetail = {
                name: shipment.shipperFullName,
                addressLine1: shipment.shipperAddressLine1,
                addressLine2: shipment.shipperAddressLine2,
                city: shipment.shipperCity,
                country: shipment.shipperCountry,
                state: shipment.shipperState,
                pincode: shipment.shipperPincode,
                phoneNo: shipment.shipperPhoneNumber,
            };
            
            const consigneeDetail = {
                name: shipment.receiverFullName,
                addressLine1: shipment.receiverAddressLine1,
                addressLine2: shipment.receiverAddressLine2,
                city: shipment.receiverCity,
                country: shipment.receiverCountry,
                state: shipment.receiverState,
                pincode: shipment.receiverPincode,
                phoneNo: shipment.receiverPhoneNumber,
            };

            const response = {
                mawb: mawb || shipment.awbNo,
                runNo: runNo,
                bagNo: bagNo,
                bagWeight: bagWeight,
                almawb: almawb,
                flight: flight,
                flightNo: flightNo,
                obc: obc,
                sector: shipment.sector,
                destination: shipment.destination,
                accountCode: accountCode,
                customerName: customerName,
                branch: branch,
                billNo: shipment.billNo,
                consigneeDetail: consigneeDetail,
                consignorDetail: consignorDetail,
                goodsType: shipment.goodstype,
                pcs: shipment.pcs,
                totalActualWt: shipment.totalActualWt,
                totalVolWt: shipment.totalVolWt,
                chgWt: shipment.chgWt,
                payment: shipment.payment,
                service: shipment.service,
                isHold: shipment.isHold,
                holdReason: shipment.holdReason,
                value: shipment.totalInvoiceValue,
                currency: shipment.currency,
                content: shipment.content,
                holdNotification: "To be implemented",
                operationRemark: shipment.operationRemark,
                origin: shipment.origin,
                date: shipment.date,
                forwarder: shipment.forwarder,
                forwardingNo: shipment.forwardingNo,
                shipmentType: shipment.shipmentType,
                totalInvoiceValue: shipment.totalInvoiceValue,
                childShipments: childShipments,
            };

            return NextResponse.json({ response });
        }

        // If awb doesn't matched
        return NextResponse.json(
            { message: "Shipment not found" },
            { status: 400 }
        );
    } catch (error) {
        return NextResponse.json(
            { message: "Error fetching shipment", error: error.message },
            { status: 500 }
        );
    }
}