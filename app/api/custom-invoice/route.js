// app/api/custom-invoice/route.js
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";

await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const awbNo = searchParams.get("awbNo");
    const runNo = searchParams.get("runNo");

    // ✅ If AWB provided — return single shipment
    if (awbNo) {
      const shipment = await Shipment.findOne({ awbNo }).lean();

      if (!shipment) {
        return new Response(JSON.stringify({ error: "Shipment not found" }), {
          status: 404,
        });
      }

      const responseData = {
        awbNo: shipment.awbNo,
        runNo: shipment.runNo,
        shipperFullName: shipment.shipperFullName,
        shipperAddressLine1: shipment.shipperAddressLine1,
        shipperAddressLine2: shipment.shipperAddressLine2,
        shipperPhoneNumber: shipment.shipperPhoneNumber,
        shipperCity: shipment.shipperCity,
        shipperState: shipment.shipperState,
        shipperPincode: shipment.shipperPincode,
        shipperKycNumber: shipment.shipperKycNumber,
        destination: shipment.destination,
        boxes: shipment.boxes,
        receiverFullName: shipment.receiverFullName,
        receiverAddressLine1: shipment.receiverAddressLine1,
        receiverAddressLine2: shipment.receiverAddressLine2,
        receiverCity: shipment.receiverCity,
        receiverState: shipment.receiverState,
        receiverPincode: shipment.receiverPincode,
        receiverPhoneNumber: shipment.receiverPhoneNumber,
        bookingDate: shipment.createdAt || shipment.date || "",
        currency: shipment.currencys || shipment.currency,
        goodstype: shipment.goodstype,
        payment: shipment.payment,
        totalInvoiceValue: shipment.totalInvoiceValue,
        shipmentAndPackageDetails: shipment.shipmentAndPackageDetails || {},
        shipperKycType: shipment.shipperKycType,
      };

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ✅ If Run Number provided — return all shipments for that run
    if (runNo) {
      const shipments = await Shipment.find({ runNo }).lean();

      if (!shipments.length) {
        return new Response(
          JSON.stringify({ error: "No shipments found for this run" }),
          { status: 404 }
        );
      }

      const formatted = shipments.map((s) => ({
        awbNo: s.awbNo,
        bagNo: s.bagNo || "",
        bagWeight: s.bagWeight || "",
        destination: s.destination || "",
      }));

      return new Response(JSON.stringify(formatted), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ✅ No query given
    return new Response(
      JSON.stringify({ error: "AWB Number or Run Number is required" }),
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in /api/custom-invoice:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
    });
  }
}
