import connectDB from "@/app/lib/db";
import ServiceMaster from "@/app/model/ServiceMaster";
import { NextResponse } from "next/server";

connectDB();

export async function POST(req) {
    try {
        const body = await req.json();
        const { serviceName, dimensions, weights, pcs } = body;

        if (!serviceName) {
            return NextResponse.json(
                { error: "Service name is required" },
                { status: 400 }
            );
        }

        // Fetch service master data
        const service = await ServiceMaster.findOne({ 
            serviceName: serviceName.trim() 
        });

        if (!service) {
            return NextResponse.json({
                valid: true,
                message: "No service rules found",
                warnings: []
            });
        }

        const errors = [];
        const warnings = [];

        // Check if service is active
        if (service.softwareStatus === "In-Active") {
            warnings.push(`Service "${service.serviceName}" is marked as In-Active.`);
        }

        // Validate max PCS per AWB
        if (service.maxPcsPerAWB > 0 && pcs > service.maxPcsPerAWB) {
            errors.push(`Maximum ${service.maxPcsPerAWB} pieces allowed per AWB. Current: ${pcs}`);
        }

        // Validate multiple PCS configuration
        if (!service.multiplePcsAllow && pcs > 1) {
            errors.push("Multiple pieces not allowed for this service.");
        }

        // Validate noOfPcs limit if enabled
        if (service.multiplePcsAllow && service.noOfPcs > 0 && pcs > service.noOfPcs) {
            errors.push(`Maximum ${service.noOfPcs} pieces allowed. Current: ${pcs}`);
        }

        // Validate average weight if enabled
        if (service.averageWeightAllow && service.averageLimit > 0) {
            const actualWt = weights?.actualWt || 0;
            const volWt = weights?.volWt || 0;
            
            if (actualWt > service.averageLimit) {
                warnings.push(`Actual weight (${actualWt}) exceeds average limit of ${service.averageLimit}kg`);
            }
            
            if (service.boxLimit > 0 && pcs > 0) {
                const avgPerBox = actualWt / pcs;
                if (avgPerBox > service.boxLimit) {
                    warnings.push(`Average weight per box (${avgPerBox.toFixed(2)}kg) exceeds box limit of ${service.boxLimit}kg`);
                }
            }
        }

        // Validate per PCS dimensions
        if (dimensions && service.perPcs) {
            const { length, width, height } = dimensions;
            const volume = (length * width * height) / 5000;
            
            if (service.perPcs.minActualWeight > 0 && weights?.actualWt < service.perPcs.minActualWeight) {
                errors.push(`Per PCS minimum actual weight: ${service.perPcs.minActualWeight}kg`);
            }
            
            if (service.perPcs.maxActualWeight > 0 && weights?.actualWt > service.perPcs.maxActualWeight) {
                errors.push(`Per PCS maximum actual weight: ${service.perPcs.maxActualWeight}kg`);
            }
            
            if (service.perPcs.minVolumeWeight > 0 && volume < service.perPcs.minVolumeWeight) {
                errors.push(`Per PCS minimum volume weight: ${service.perPcs.minVolumeWeight}kg`);
            }
            
            if (service.perPcs.maxVolumeWeight > 0 && volume > service.perPcs.maxVolumeWeight) {
                errors.push(`Per PCS maximum volume weight: ${service.perPcs.maxVolumeWeight}kg`);
            }
        }

        // Validate per AWB dimensions
        if (weights && service.perAWB) {
            if (service.perAWB.minActualWeight > 0 && weights.actualWt < service.perAWB.minActualWeight) {
                errors.push(`Per AWB minimum actual weight: ${service.perAWB.minActualWeight}kg`);
            }
            
            if (service.perAWB.maxActualWeight > 0 && weights.actualWt > service.perAWB.maxActualWeight) {
                errors.push(`Per AWB maximum actual weight: ${service.perAWB.maxActualWeight}kg`);
            }
            
            if (service.perAWB.minVolumeWeight > 0 && weights.volWt < service.perAWB.minVolumeWeight) {
                errors.push(`Per AWB minimum volume weight: ${service.perAWB.minVolumeWeight}kg`);
            }
            
            if (service.perAWB.maxVolumeWeight > 0 && weights.volWt > service.perAWB.maxVolumeWeight) {
                errors.push(`Per AWB maximum volume weight: ${service.perAWB.maxVolumeWeight}kg`);
            }
            
            if (service.perAWB.minChargeableWeight > 0 && weights.chargeableWt < service.perAWB.minChargeableWeight) {
                errors.push(`Per AWB minimum chargeable weight: ${service.perAWB.minChargeableWeight}kg`);
            }
            
            if (service.perAWB.maxChargeableWeight > 0 && weights.chargeableWt > service.perAWB.maxChargeableWeight) {
                errors.push(`Per AWB maximum chargeable weight: ${service.perAWB.maxChargeableWeight}kg`);
            }
        }

        // Validate max shipment value
        if (service.maxShipmentValue > 0 && weights?.invoiceValue > service.maxShipmentValue) {
            errors.push(`Maximum shipment value: ${service.maxShipmentValue}`);
        }

        return NextResponse.json({
            valid: errors.length === 0,
            errors,
            warnings,
            serviceDetails: {
                serviceName: service.serviceName,
                softwareStatus: service.softwareStatus,
                portalStatus: service.portalStatus,
                multiplePcsAllow: service.multiplePcsAllow,
                noOfPcs: service.noOfPcs,
                averageWeightAllow: service.averageWeightAllow,
                averageLimit: service.averageLimit,
                boxLimit: service.boxLimit,
                volDiscountPercent: service.volDiscountPercent,
                maxPcsPerAWB: service.maxPcsPerAWB,
                maxShipmentValue: service.maxShipmentValue
            }
        });

    } catch (err) {
        console.error("Service validation error:", err);
        return NextResponse.json(
            { error: "Validation failed", details: err.message },
            { status: 500 }
        );
    }
}