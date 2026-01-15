import connectDB from "@/app/lib/db";
import Bagging from "@/app/model/bagging";
import Shipment from "@/app/model/portal/Shipment";

export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const runNo = searchParams.get("runNo");

    if (!runNo) {
      return new Response(JSON.stringify({ error: "Run Number is required" }), {
        status: 400,
      });
    }

    const bag = await Bagging.findOne({ runNo }).lean();
    if (!bag)
      return new Response(JSON.stringify({ error: "Run not found" }), {
        status: 404,
      });

    // Map each AWB to its bag details
    const bagAwbMap = {};
    (bag.rowData || []).forEach((r) => {
      if (!r?.awbNo) return;
      bagAwbMap[r.awbNo] = {
        bagNo: String(r.bagNo ?? r.bagno ?? ""),
        bagWeight: Number(r.bagWeight ?? r.weight ?? 0),
      };
    });

    const awbNos = Object.keys(bagAwbMap);
    if (!awbNos.length)
      return new Response(JSON.stringify({ error: "No AWBs in this run" }), {
        status: 404,
      });

    const shipments = await Shipment.find({ awbNo: { $in: awbNos } }).lean();

    const invoices = awbNos.map((awbNo) => {
      const s = shipments.find((x) => x.awbNo === awbNo) || {};
      const b = bagAwbMap[awbNo] || {};

      return {
        // --- For InvoiceCsbV ---
        invoiceNo: s.billNo || "",
        invoiceDate: s.date ? new Date(s.date).toISOString().slice(0, 10) : "",
        airwayBillNumber: s.awbNo || "",
        dateOfSupply: s.date ? new Date(s.date).toISOString().slice(0, 10) : "",
        stateCode: "08", // can make dynamic later
        placeOfSupply: s.receiverState || "",
        igstStatus: "UT", // static or dynamic later

        billTo: {
          name: s.shipperFullName || "",
          address1: s.shipperAddressLine1 || "",
          address2: s.shipperAddressLine2 || "",
          city: s.shipperCity || "",
          pincode: s.shipperPincode || "",
          country: s.shipperCountry || "India",
          email: s.shipperEmail || "",
        },

        shipTo: {
          name: s.receiverFullName || "",
          address1: s.receiverAddressLine1 || "",
          address2: s.receiverAddressLine2 || "",
          city: s.receiverCity || "",
          pincode: s.receiverPincode || "",
          country: s.receiverCountry || "",
          email: s.receiverEmail || "",
        },

        items: (() => {
          const details = s.shipmentAndPackageDetails;
          let out = [];
          if (
            details &&
            typeof details === "object" &&
            !Array.isArray(details)
          ) {
            Object.keys(details).forEach((key) => {
              (details[key] || []).forEach((item) => {
                out.push({
                  description: item.itemName || item.context || "",
                  hsn: item.hsn || "",
                  qty: Number(item.quantity || item.qty || 0),
                  rate: Number(item.rate || 0),
                  amount: Number(item.amount || 0),
                  taxableValue: Number(item.amount || 0),
                  igst: 0,
                  total: Number(item.amount || 0),
                });
              });
            });
          } else if (Array.isArray(s.boxes)) {
            out = s.boxes.map((box) => ({
              description: box.itemName || "",
              hsn: box.hsn || "",
              qty: Number(box.quantity || 0),
              rate: Number(box.rate || 0),
              amount: Number(box.amount || 0),
              taxableValue: Number(box.amount || 0),
              igst: 0,
              total: Number(box.amount || 0),
            }));
          }
          return out;
        })(),

        currency: s.currency || "USD",
        totalAmount: s.totalAmt || 0,
        igstAmount: s.igst || 0,

        bagNo: b.bagNo || "",
        bagWeight: b.bagWeight || 0,
        destination: s.destination || "",
      };
    });

    return new Response(JSON.stringify({ runNo, invoices }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ /api/custom-invoice/csb-v/runwise error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: err.message }),
      { status: 500 }
    );
  }
}
