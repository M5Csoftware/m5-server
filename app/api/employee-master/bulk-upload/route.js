import connectDB from "@/app/lib/db";
import Employee from "@/app/model/Employee";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

await connectDB();
const permissionGroups = {
  "title-Master (Administrative Control)": [
    "permission-Export",
    "permission-Import",
    "permission-Entity Manager",
    "permission-Branch Master",
    "permission-Vendor Master",
    "permission-Customer",
    "permission-Employee Master",
    "permission-Tax Settings",
    "permission-Fuel Settings",
    "permission-Shipper Tariff",
    "permission-Shipper Tariff Bulk",
    "permission-Modify Shipper Tariff",
    "permission-Assign Customer & Target",
    "permission-Assign Sector",
    "permission-Custom Reports",
  ],

  "title-Booking": [
    "permission-AWB Entry",
    "permission-Digital Tally",
    "permission-Manifest",
    "permission-Hub Inscan (Client)",
    "permission-Quick Inscan",
    "permission-Manifest Close",
    "permission-Bulk Upload",
    "permission-RTO Shipment",
    "permission-Branch Manifest Report",
    "permission-International Pickup Order",
    "permission-Alert Messages",
  ],

  "title-Accounts": [
    "permission-Accounts Deletion",
    "permission-Accounts Edit",
    "permission-Payment Entry",
    "permission-Credit Limit Temp",
    "permission-accounts-account-ledger",
    "permission-Zone",
    "permission-Rate Sheet",
    "permission-Expense Entry",
    "permission-Amount Log",
    "permission-Credit Note",
    "permission-Debit Note",
    "permission-Account Ledger Mail",
    "permission-Claim For Lost Shipment",
    "permission-Discount Credit Note",
    "permission-Account Ledger Mail",
    "permission-Total Outstanding",
    "permission-Run Wise Sale Report",
    "permission-Payment Collection Report",
    "permission-accounts-sale-with-collection-report",
    "permission-Sale With Total Receiving",
    "permission-Booking Report With Amount",
    "permission-accounts-credit-limit-report",
    "permission-accounts-credit-limit-report-with-days",
    // "permission-Sale Report With Days",
    "permission-accounts-month-sale",
    "permission-New Sale Report",
    "permission-Payment Receipt Summary",
    "permission-Credit Summary Report",
    "permission-Debit Summary Report",
    // "permission-Claim For Lost Shipment Summary",
    // "permission-Discount Credit Note Summary",
    // "permission-Payment Report",
    // "permission-Payment Verification",
    // "permission-Invoice Deletion",
    "permission-Suspense Account Access",
    "permission-FOC Account",
  ],

  "title-Operations": [
    "permission-Run Entry",
    "permission-Clubbing",
    "permission-Bagging",
    "permission-Create Child Number",
    "permission-Run Transfer",
    "permission-Branch Bagging",
    "permission-operations-offload-shipment",
    "permission-Awb Print",
    "permission-Overseas Manifest",
    "permission-Bagging With Barcode",
    "permission-Child AWB No Report",
    "permission-Manifest Report",
    "permission-Manifest Report D",
    "permission-Club Report",
    "permission-Bag Report",
    "permission-EDI Report",
    "permission-Message Sheet",
    "permission-Custom Invoice",
    "permission-RTO Shipment Report",
    "permission-CSB V Report",
    "permission-Run Number Report",
  ],

  "title-Billing": [
    "permission-Billing Deletion",
    "permission-Billing Edit",
    "permission-Sales Report",
    "permission-AWB Billing",
    "permission-Invoice",
    "permission-Bulk Invoice",
    "permission-Bulk Invoice Delete",
    "permission-Invoice PTP",
    "permission-Upload IRN Number",
    "permission-Invoice Summary",
    "permission-Extra Charges",
    "permission-Email Invoice",
    "permission-Rate Hike",
    "permission-Data Lock",
    "permission-Auto Calculation",
    "permission-Sale Report With Hold",
    "permission-billing-sale-with-collection-report",
    "permission-billing-credit-limit-report",
    "permission-billing-account-ledger",
    "permission-billing-credit-limit-report-with-days",
    "permission-Sale Summary Sector Wise",
    "permission-billing-run-summary",
    "permission-billing-sale-report-with-child-number",
    "permission-billing-month-sale",
    "permission-Credit Note Summary AWB No. Wise",
    "permission-Day Wise Sale",
    "permission-Invoice PTP Summary",
  ],

  "title-Customer Care": [
    "permission-CC Deletion",
    "permission-CC Edit",
    "permission-Shipment Query",
    "permission-Register Complaint",
    "permission-Event Activity",
    "permission-Update Forwarding Number",
    "permission-POD Entry",
    "permission-POA Entry",
    "permission-POD Email",
    "permission-Message Circular",
    "permission-Portal Balance",
    "permission-Ticket Dashboard",
    "permission-customercare-offload-shipment",
    "permission-Tracking Report",
    "permission-Complaint Report",
    "permission-Client Report",
    "permission-Multiple Run Wise",
    "permission-Shipment Status Report",
    "permission-Child Shipment Status Report",
    "permission-Forwarding Number Report",
    // "permission-CC Report",
    "permission-customercare-run-summary",
  ],

  "title-Reports": [
    "permission-reports-booking-report",
    "permission-Airwaybill Log",
    "permission-Booking With Sale",
  ],
};

const departmentPermissionMap = {
  Sales: [
    "title-Operations",
    "title-Reports",
    "title-Customer Care",
    "title-Booking",
    "title-Accounts",
  ],

  Operations: ["title-Operations", "title-Booking", "title-Reports"],

  "Customer Support": [
    "title-Booking",
    "title-Operations",
    "title-Customer Care",
    "title-Reports",
  ],

  Account: [
    "title-Booking",
    "title-Operations",
    "title-Customer Care",
    "title-Reports",
    "title-Accounts",
    "title-Billing",
  ], // all except master

  Billing: [
    "title-Master (Administrative Control)",
    "title-Booking",
    "title-Accounts",
    "title-Operations",
    "title-Billing",
    "title-Customer Care",
    "title-Reports",
  ], // all

  "Sale Support": ["title-Booking", "title-Operations", "title-Accounts"],

  Management: [
    "title-Master (Administrative Control)",
    "title-Booking",
    "title-Accounts",
    "title-Operations",
    "title-Billing",
    "title-Customer Care",
    "title-Reports",
  ], // all
};

const departmentDashboardMap = {
  Operations: ["Operations"],
  Billing: ["Billing Employee"],
  Account: ["Collection HOD"],
  Sales: ["Sales"],
  Management: [
    "Revenue",
    "Sales",
    "Operations",
    "Sales HOD",
    "CS",
    "Collection HOD",
    "Billing Employee",
    "SS",
    "Counter Part",
  ],
  Other: [""],
};

const buildPermissionsForDepartment = (department) => {
  const titles = departmentPermissionMap[department] || [];
  const permissionsObj = {};

  titles.forEach((titleKey) => {
    const perms = permissionGroups[titleKey] || [];

    perms.forEach((permKey) => {
      const clean = permKey.replace("permission-", "");
      permissionsObj[clean] = true;
    });
  });

  return permissionsObj;
};

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { message: "No file uploaded" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const createdEmployees = [];

    for (const row of rows) {
      const { userId, userName, email, password, branch, department, hub } =
        row;

      const role = department === "Management" ? "Admin" : "User";

      const dashboardAccess = departmentDashboardMap[department] || [];

      const permissionsObj = buildPermissionsForDepartment(department);

      let newUserId = userId;
      if (!newUserId) {
        const last = await Employee.findOne().sort({ createdAt: -1 });
        const next = last
          ? (parseInt(last.userId) + 1).toString().padStart(8, "0")
          : "11484000";
        newUserId = next;
      }

      const newEmployee = await Employee.create({
        userId: newUserId,
        userName,
        email,
        password,
        branch,
        hub,
        department,
        role,
        dashboardAccess,
        permissions: permissionsObj,
        createdBy: "BULK",
      });

      createdEmployees.push(newEmployee);
    }

    return NextResponse.json(
      { message: "Bulk upload done", createdEmployees },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Bulk upload failed", error: err.message },
      { status: 500 }
    );
  }
}
