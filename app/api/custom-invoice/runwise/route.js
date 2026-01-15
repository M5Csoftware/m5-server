import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import Shipment from "@/app/model/portal/Shipment";

await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return new Response(JSON.stringify({ error: "Run Number is required" }), { status: 400 });
    }

    const bag = await Bagging.findOne({ runNo }).lean();
    if (!bag) {
      return new Response(JSON.stringify({ error: "Run not found" }), { status: 404 });
    }

    // Map AWB -> bag info
    const bagAwbMap = {};
    (bag.rowData || []).forEach((r) => {
      if (!r?.awbNo) return;
      const bagNo = r.bagNo ?? r.bagno ?? r.bag_number ?? "";
      const bagWeight = r.bagWeight ?? r.weight ?? r.bag_weight ?? 0;
      bagAwbMap[r.awbNo] = {
        bagNo: String(bagNo),
        bagWeight: Number(bagWeight),
        forwardingNo: r.forwardingNo || "",
      };
    });

    const awbNos = Object.keys(bagAwbMap);
    if (awbNos.length === 0) {
      return new Response(JSON.stringify({ error: "No valid AWBs in this run" }), { status: 404 });
    }

    // Pull full shipments for those AWBs
    const shipments = await Shipment.find({ awbNo: { $in: awbNos } }).lean();

    // Build full invoice objects (everything InvoiceContent needs)
    const invoices = awbNos.map((awbNo) => {
      const s = shipments.find((x) => x.awbNo === awbNo) || {};
      const b = bagAwbMap[awbNo] || {};

      return {
        // --- Bag info ---
        awbNo,
        bagNo: b.bagNo || "",
        bagWeight: b.bagWeight || 0,
        forwardingNo: b.forwardingNo || "",

        // --- Shipper ---
        shipperFullName: s.shipperFullName || "",
        shipperAddressLine1: s.shipperAddressLine1 || "",
        shipperAddressLine2: s.shipperAddressLine2 || "",
        shipperPhoneNumber: s.shipperPhoneNumber || "",
        shipperCity: s.shipperCity || "",
        shipperState: s.shipperState || "",
        shipperPincode: s.shipperPincode || "",
        shipperKycNumber: s.shipperKycNumber || "",
        shipperKycType: s.shipperKycType || "other",

        // --- Consignee ---
        receiverFullName: s.receiverFullName || "",
        receiverAddressLine1: s.receiverAddressLine1 || "",
        receiverAddressLine2: s.receiverAddressLine2 || "",
        receiverCity: s.receiverCity || "",
        receiverState: s.receiverState || "",
        receiverPincode: s.receiverPincode || "",
        receiverPhoneNumber: s.receiverPhoneNumber || "",

        // --- Shipment meta ---
        destination: s.destination || "",
        bookingDate: s.createdAt || s.date || "",
        currency: s.currencys || s.currency || "INR",
        weight: s.weight || 0,
        totalInvoiceValue: s.totalInvoiceValue || 0,

        // --- Items / boxes ---
        boxes: Array.isArray(s.boxes) ? s.boxes : [],
        shipmentAndPackageDetails: s.shipmentAndPackageDetails || {},

        // Optional extras if you use them in PDF
        preCarriageBy: s.preCarriageBy || "",
        flightNo: s.flightNo || "",
        placeOfReceipt: s.placeOfReceipt || "",
        portOfLoading: s.portOfLoading || "",
        buyerOrderNo: s.buyerOrderNo || "",
        otherReference: s.otherReference || "",
        buyerIfOther: s.buyerIfOther || "",
        countryOfOrigin: s.countryOfOrigin || "",
        termsOfDelivery: s.termsOfDelivery || s.terms || "",
      };
    });

    // Run summary
    const summary = {
      runNo: bag.runNo || "",
      sector: bag.sector || "",
      flight: bag.flight || "",
      alMawb: bag.alMawb || "",
      counterPart: bag.counterPart || "",
      mhbsNo: bag.mhbsNo || "",
      noOfBags: bag.noOfBags || 0,
      noOfAwb: bag.noOfAwb || 0,
      runWeight: bag.runWeight || 0,
      date: bag.date || "",
    };

    return new Response(JSON.stringify({ summary, invoices }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ /api/custom-invoice/runwise error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: err.message }), {
      status: 500,
    });
  }
}
