import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import Bagging from "@/app/model/bagging";
import ChildShipment from "@/app/model/portal/ChildShipment";

// Helper to convert date to YYYYMMDD
function formatDateYYYYMMDD(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

// Helper to parse and validate date
function parseDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

// POST /api/reports/booking-report
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const {
      code,
      runNumber,
      origin,
      sector,
      salePerson,
      branch,
      destination,
      service,
      from,
      to,
      holdShipments,
      skipMum,
      skipAmd,
      csbV,
      includeChild,
      balanceShipment,
    } = body;

    console.log("=== RECEIVED FILTERS ===");
    console.log("includeChild:", includeChild);
    console.log("========================");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Both 'from' and 'to' dates are required" },
        { status: 400 }
      );
    }

    // Parse and validate dates
    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    if (!fromDate || !toDate) {
      return NextResponse.json(
        { error: "Invalid date format. Please provide valid dates." },
        { status: 400 }
      );
    }

    if (fromDate > toDate) {
      return NextResponse.json(
        { error: "'From' date cannot be later than 'To' date" },
        { status: 400 }
      );
    }

    // Set end of day for toDate to include all records on that day
    toDate.setHours(23, 59, 59, 999);

    // Build query
    const query = {
      createdAt: { $gte: fromDate, $lte: toDate },
    };

    // Text filters with case-insensitive regex
    if (code) query.accountCode = { $regex: code, $options: "i" };
    if (runNumber) query.runNo = { $regex: runNumber, $options: "i" };
    if (origin) query.origin = { $regex: origin.trim(), $options: "i" };
    if (destination)
      query.destination = { $regex: destination.trim(), $options: "i" };
    if (sector) query.sector = { $regex: sector, $options: "i" };
    if (service) query.service = { $regex: service, $options: "i" };

    console.log("Query being executed:", JSON.stringify(query, null, 2));

    // Fetch parent shipments
    let shipments = await Shipment.find(query).lean();

    console.log("Initial parent shipments count:", shipments.length);

    // If no parent shipments found, return empty array
    if (shipments.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    // Fetch customer accounts for filtering and additional data
    const accountCodes = [
      ...new Set(shipments.map((b) => b.accountCode).filter(Boolean)),
    ];
    let accounts = [];

    if (accountCodes.length > 0) {
      const accountQuery = {
        accountCode: { $in: accountCodes },
      };

      // Add salePerson filter if provided
      if (salePerson) {
        accountQuery.salesPersonName = { $regex: salePerson, $options: "i" };
      }

      // Add branch filter if provided
      if (branch) {
        accountQuery.branch = { $regex: branch, $options: "i" };
      }

      accounts = await CustomerAccount.find(accountQuery).lean();
    }

    const accountMap = {};
    accounts.forEach((a) => {
      accountMap[a.accountCode] = {
        branch: a.branch,
        name: a.name,
        salesPersonName: a.salesPersonName,
      };
    });

    // Filter shipments based on accounts if salePerson/branch filters applied
    if (salePerson || branch) {
      const allowedCodes = accounts.map((a) => a.accountCode);
      shipments = shipments.filter((b) => allowedCodes.includes(b.accountCode));
      console.log("After account filtering:", shipments.length);
    }

    // Checkbox filters on parent shipments
    const beforeCheckboxCount = shipments.length;
    shipments = shipments.filter((shipment) => {
      // Hold shipments filter
      if (holdShipments && !shipment.isHold) return false;

      // Skip Mumbai filter - Check ORIGIN
      if (skipMum) {
        const originLower = (shipment.origin || "").toLowerCase();
        const shouldSkip =
          originLower.includes("mumbai") || originLower.includes("bom");
        if (shouldSkip) {
          return false;
        }
      }

      // Skip Ahmedabad filter - Check ORIGIN
      if (skipAmd) {
        const originLower = (shipment.origin || "").toLowerCase();
        const shouldSkip =
          originLower.includes("ahmedabad") ||
          originLower.includes("amd") ||
          originLower.includes("ahmadabad");
        if (shouldSkip) {
          return false;
        }
      }

      // CSB filter
      if (csbV && !shipment.csb) return false;

      // Balance shipment filter
      if (balanceShipment) {
        const paymentLower = (shipment.payment || "").toLowerCase();
        if (!paymentLower.includes("balance")) {
          return false;
        }
      }

      return true;
    });

    console.log("After checkbox filtering:", shipments.length);
    console.log("Filtered out:", beforeCheckboxCount - shipments.length);

    // ✅ Fetch child shipments if includeChild is enabled
    let childShipments = [];
    if (includeChild) {
      const awbNumbers = shipments.map((s) => s.awbNo).filter(Boolean);
      
      console.log("=== SEARCHING FOR CHILD SHIPMENTS ===");
      console.log("Parent AWB Numbers:", awbNumbers);

      if (awbNumbers.length > 0) {
        childShipments = await ChildShipment.find({
          $or: [
            { masterAwbNo: { $in: awbNumbers } },
            { MAWB: { $in: awbNumbers } },
          ],
        }).lean();

        console.log("Found child shipments:", childShipments.length);
        console.log("Child shipment details:", childShipments.map(c => ({
          childAwb: c.childAwbNo,
          masterAwb: c.masterAwbNo || c.MAWB,
          destination: c.destination
        })));
      }
    }

    // Create a map of parent AWB to child shipments
    const childMap = {};
    childShipments.forEach((child) => {
      const parentKey = child.masterAwbNo || child.MAWB;
      if (parentKey) {
        if (!childMap[parentKey]) {
          childMap[parentKey] = [];
        }
        childMap[parentKey].push(child);
        console.log(`Mapped child ${child.childAwbNo} to parent ${parentKey}`);
      }
    });

    // Fetch Bagging info if runNo exists
    const runNos = [...new Set(shipments.map((b) => b.runNo).filter(Boolean))];
    let baggingData = [];
    if (runNos.length > 0) {
      baggingData = await Bagging.find({ runNo: { $in: runNos } }).lean();
    }

    // Combine parent and child shipments
    let bookings = [];

    shipments.forEach((parent) => {
      // Get bag number for parent
      let bagNo = null;
      if (parent.runNo) {
        const baggingDoc = baggingData.find((bg) => bg.runNo === parent.runNo);
        if (baggingDoc && baggingDoc.rowData) {
          const row = baggingDoc.rowData.find((r) => r.awbNo === parent.awbNo);
          if (row) bagNo = row.bagNo;
        }
      }

      const customerInfo = accountMap[parent.accountCode] || {};
      
      // Check if this parent has children
      const children = includeChild ? (childMap[parent.awbNo] || []) : [];
      const hasChildren = children.length > 0;

      // ✅ If parent has children, ONLY show the children (not the parent)
      if (includeChild && hasChildren) {
        console.log(`✅ Parent AWB ${parent.awbNo} has ${children.length} children - showing only children`);
        
        children.forEach((child, index) => {
          console.log(`  - Child ${index + 1}: ${child.childAwbNo} -> Master: ${child.masterAwbNo || child.MAWB}`);
          
          const childRecord = {
            ...parent, // Include parent's data as base
            awbNo: child.childAwbNo || "", // Replace parent AWB with child AWB in awbNo column
            masterAwbNo: parent.awbNo, // Show parent AWB in masterAwbNo column
            bagNo, // Same bag as parent
            // ✅ Map child shipment fields correctly based on schema
            receiverFullName: child.consigneeName || "",
            receiverAddressLine1: child.consigneeAdd || "",
            receiverCity: child.consigneeCity || "",
            receiverState: child.consigneeState || "",
            receiverPincode: child.consigneeZip || "",
            receiverPhoneNumber: "", // Child schema doesn't have phone
            destination: child.destination || parent.destination,
            // Keep parent's other data
            pcs: parent.pcs || "",
            totalActualWt: parent.totalActualWt || "",
            totalVolWt: parent.totalVolWt || "",
            chargableWt: parent.chargableWt || "",
            totalInvoiceValue: parent.totalInvoiceValue || "",
            // Use child's _id to differentiate from parent
            _id: child._id.toString(), // Convert to string for uniqueness
            // Keep parent's dates
            createdAt: parent.createdAt
              ? formatDateYYYYMMDD(parent.createdAt)
              : "",
            date: parent.date
              ? formatDateYYYYMMDD(parent.date)
              : "",
            shipmentDate: parent.shipmentDate
              ? formatDateYYYYMMDD(parent.shipmentDate)
              : "",
            branch: customerInfo.branch || parent.branch || "",
            name: customerInfo.name || parent.customer || "",
            salesPersonName:
              customerInfo.salesPersonName || parent.salesPersonName || "",
            // Add forwarder info from child
            shipmentForwarderTo: child.forwarder || "",
            shipmentForwardingNo: child.forwardingNo || "",
            // Keep all parent fields
            accountCode: parent.accountCode,
            runNo: parent.runNo,
            flightDate: parent.flightDate,
            manifestNumber: parent.manifestNumber,
            origin: parent.origin,
            sector: parent.sector,
            service: parent.service,
            upsService: parent.upsService,
            payment: parent.payment,
            goodstype: parent.goodstype,
            volDisc: parent.volDisc,
            currency: parent.currency,
            containerNo: parent.containerNo,
            isHold: parent.isHold,
            holdReason: parent.holdReason,
            otherHoldReason: parent.otherHoldReason,
            unholdDate: parent.unholdDate,
            csb: parent.csb,
            userBranch: parent.userBranch,
            insertUser: parent.insertUser,
            localMfNo: parent.localMfNo,
          };
          
          bookings.push(childRecord);
        });
      } else {
        // ✅ If parent has NO children, show the parent normally
        bookings.push({
          ...parent,
          bagNo,
          masterAwbNo: "", // Parent has no master AWB - use empty string
          date: parent.date ? formatDateYYYYMMDD(parent.date) : null,
          shipmentDate: parent.shipmentDate
            ? formatDateYYYYMMDD(parent.shipmentDate)
            : null,
          createdAt: parent.createdAt
            ? formatDateYYYYMMDD(parent.createdAt)
            : null,
          branch: customerInfo.branch || parent.branch || null,
          name: customerInfo.name || parent.customer || null,
          salesPersonName:
            customerInfo.salesPersonName || parent.salesPersonName || null,
        });
      }
    });

    console.log("Final bookings count:", bookings.length);
    console.log(`Parents: ${shipments.length}, Total records: ${bookings.length}`);

    return NextResponse.json(bookings, { status: 200 });
  } catch (error) {
    console.error("Error fetching shipments:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching shipments." },
      { status: 500 }
    );
  }
}