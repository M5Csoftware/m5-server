// Generate Pickup Code
function generatePickupCode() {
    return "PCK" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Format time → 04:01 PM
function formatTime(date) {
    return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

// Format date → DD/MM/YYYY
function formatDate(date) {
    return date.toLocaleDateString("en-GB");
}

// Format Day → Monday, Tuesday...
function formatDay(date) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
}

/* =====================================================
   UNIVERSAL NOTIFICATION BUILDER
   ===================================================== */
export function buildShipmentBookedNotification({
    accountCode,
    type,
    title,
    awb,           // Can be single AWB like "M5123..." OR array ["M1","M2"]
    manifestNo,    // For Manifest Requested
    address = "",
    holdReason = "",
}) {
    const now = new Date();
    const timestamp = formatTime(now);
    const formattedDate = `${timestamp}, ${formatDate(now)}, ${formatDay(now)}`;

    let description = "";

    /* ==========================================
       TYPE-WISE DYNAMIC DESCRIPTION HANDLING
       ========================================== */

    // If AWB is array → join for readability
    const awbText = Array.isArray(awb) ? awb.join(", ") : awb;

    switch (type) {

        /* ---------------------------
           Shipment Booked
        ---------------------------- */
        case "Shipment Booked":
            description = `AWB ${awbText} has been created and is ready for manifest.`;
            break;

        /* ---------------------------
           Manifest Requested
        ---------------------------- */
        case "Manifest Requested":
            if (!manifestNo) {
                description = `Manifest has been requested.`;
            } else {
                description = `Manifest ${manifestNo} has been requested for AWB ${awbText}.`;
            }
            break;

        /* ---------------------------
           Shipment Hold
        ---------------------------- */
        case "Shipment Hold":
            description = `AWB ${awbText} has been put on hold. ${holdReason ? "Reason: " + holdReason : ""
                }`;
            break;

        /* ---------------------------
           Shipment received at Hub
        ---------------------------- */
        case "Shipment received at Hub":
            description = `Your shipment AWB ${awbText} has been received at the hub.`;
            break;

        default:
            description = "You have a new notification.";
    }

    /* ==========================================
       BASE PAYLOAD
       ========================================== */
    const payload = {
        accountCode: accountCode?.toUpperCase(),
        type,
        title,
        description,
        awb: awbText || "",
        address,
        timestamp,
        date: formattedDate,
    };

    /* ==========================================
        Pickup code ONLY for shipment-booked
       ========================================== */
    if (type === "Shipment Booked") {
        payload.pickupCode = generatePickupCode();
    }

    return payload;
}
