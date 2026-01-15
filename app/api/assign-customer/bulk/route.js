import connectDB from "@/app/lib/db";
import * as XLSX from "xlsx";
import SalesTarget from "@/app/model/SalesTarget";
import Employee from "@/app/model/Employee";
import CustomerAccount from "@/app/model/CustomerAccount";

export async function POST(req) {
  await connectDB();

  try {
    // Read raw file as ArrayBuffer
    const body = await req.arrayBuffer();
    const buffer = Buffer.from(body);

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Excel file is empty" }), {
        status: 400,
      });
    }

    // Fetch all valid sales employees from DB
    const salesEmployees = await Employee.find(
      { department: "Sales" },
      "userId userName"
    );
    const validUserIds = salesEmployees.map((emp) =>
      emp.userId.trim().toLowerCase()
    );

    // Helper to clean Excel strings
    const cleanString = (str) =>
      str
        ?.toString()
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase() || "";

    const errors = [];

    // First pass: validate all rows
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const userId = row.userId?.toString().trim();
      const month = row.month?.trim();
      const targetTonnage = row.targetTonnage;
      const targetAmount = row.targetAmount;

      // Basic validation
      if (!userId || !month) {
        errors.push({
          row: index + 2,
          error: "Missing required fields (userId or month)",
        });
        continue;
      }

      // Validate userId exists in Sales department
      if (!validUserIds.includes(cleanString(userId))) {
        errors.push({
          row: index + 2,
          error: `Invalid or non-sales userId: ${userId}`,
        });
        continue;
      }

      // Validate numeric fields if provided
      if (targetTonnage && isNaN(Number(targetTonnage))) {
        errors.push({
          row: index + 2,
          error: "Invalid targetTonnage (must be a number)",
        });
        continue;
      }

      if (targetAmount && isNaN(Number(targetAmount))) {
        errors.push({
          row: index + 2,
          error: "Invalid targetAmount (must be a number)",
        });
        continue;
      }

      // Validate addCustomers if provided
      const addCustomersRaw = row.addCustomers?.toString().trim() || "";
      const addCustomerCodes = addCustomersRaw
        ? addCustomersRaw
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : [];

      if (addCustomerCodes.length > 0) {
        const validCodes = await CustomerAccount.find({
          accountCode: { $in: addCustomerCodes },
        }).distinct("accountCode");

        const invalidCodes = addCustomerCodes.filter(
          (code) => !validCodes.includes(code)
        );
        if (invalidCodes.length > 0) {
          errors.push({
            row: index + 2,
            error: `Invalid customer codes: ${invalidCodes.join(", ")}`,
          });
        }
      }
    }

    // All-or-nothing: fail if any errors
    if (errors.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Upload failed due to validation errors",
          failedRows: errors,
        }),
        { status: 400 }
      );
    }

    // Second pass: process all rows
    const results = [];

    for (const row of rows) {
      const userId = row.userId.toString().trim();
      const month = row.month.trim();
      const stateAssigned = row.stateAssigned?.toString().trim() || "";

      // Parse cities
      const citiesRaw = row.cities?.toString().trim() || "";
      const cities = citiesRaw
        ? citiesRaw
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : [];

      // Parse addCustomers
      const addCustomersRaw = row.addCustomers?.toString().trim() || "";
      const addCustomerCodes = addCustomersRaw
        ? addCustomersRaw
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : [];

      // Parse removeCustomers
      const removeCustomersRaw = row.removeCustomers?.toString().trim() || "";
      const removeCustomerCodes = removeCustomersRaw
        ? removeCustomersRaw
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : [];

      const targetTonnage = row.targetTonnage ? Number(row.targetTonnage) : 0;
      const targetAmount = row.targetAmount ? Number(row.targetAmount) : 0;
      const remarks = row.remarks?.toString().trim() || "";

      // Get employee details
      const employee = salesEmployees.find((emp) => emp.userId === userId);
      const userName = row.userName?.trim() || employee?.userName || "";

      // Fetch or create SalesTarget
      let salesTarget = await SalesTarget.findOne({ userId, month });

      if (!salesTarget) {
        salesTarget = new SalesTarget({
          userId,
          userName,
          month,
          stateAssigned,
          citiesAssigned: cities,
          customersAssigned: [],
          targetTonnage,
          targetAmount,
          remarks,
        });
      } else {
        // Update existing target
        salesTarget.userName = userName;
        salesTarget.stateAssigned = stateAssigned;
        salesTarget.citiesAssigned = cities;
        salesTarget.targetTonnage = targetTonnage;
        salesTarget.targetAmount = targetAmount;
        salesTarget.remarks = remarks;
      }

      // Handle removeCustomers first
      if (removeCustomerCodes.length > 0) {
        salesTarget.customersAssigned = salesTarget.customersAssigned.filter(
          (c) => !removeCustomerCodes.includes(c.accountCode)
        );

        // Unassign from CustomerAccount
        for (const code of removeCustomerCodes) {
          const customer = await CustomerAccount.findOne({ accountCode: code });
          if (customer && customer.salesPersonName === userName) {
            customer.salesPersonName = "";
            await customer.save();
          }
        }
      }

      // Handle addCustomers
      if (addCustomerCodes.length > 0) {
        for (const code of addCustomerCodes) {
          const customer = await CustomerAccount.findOne({ accountCode: code });
          if (!customer) continue;

          // Remove from previous salesperson if assigned
          if (
            customer.salesPersonName &&
            customer.salesPersonName !== userName
          ) {
            const prevTarget = await SalesTarget.findOne({
              userName: customer.salesPersonName,
              month,
            });
            if (prevTarget) {
              prevTarget.customersAssigned =
                prevTarget.customersAssigned.filter(
                  (c) => c.accountCode !== code
                );
              await prevTarget.save();
            }
          }

          // Assign to new salesperson
          customer.salesPersonName = userName;
          await customer.save();

          // Add to salesTarget if not already there
          if (
            !salesTarget.customersAssigned.some((c) => c.accountCode === code)
          ) {
            salesTarget.customersAssigned.push({
              accountCode: code,
              name: customer.name || customer.customerName || code,
            });
          }
        }
      }

      await salesTarget.save();

      // Update Employee document if current month
      const now = new Date();
      const currentMonthStr = `${now.toLocaleString("default", {
        month: "long",
      })}-${now.getFullYear()}`;

      if (month === currentMonthStr) {
        await Employee.findOneAndUpdate(
          { userId },
          {
            stateAssigned,
            cityAssigned: cities,
          },
          { new: true }
        );
      }

      results.push({ userId, month, status: "success" });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully uploaded ${results.length} records`,
        results,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("Bulk upload failed:", err);
    return new Response(
      JSON.stringify({
        error: "Server error during upload",
        details: err.message,
      }),
      { status: 500 }
    );
  }
}
