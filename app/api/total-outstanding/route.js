import connectDB from "@/app/lib/db";
import CustomerAccount from "@/app/model/CustomerAccount";
import Shipment from "@/app/model/portal/Shipment";
import PaymentEntry from "@/app/model/PaymentEntry";

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get('accountCode');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    // If specific accountCode is requested
    if (accountCode) {
      const account = await CustomerAccount.findOne({ accountCode });
      if (!account) {
        return Response.json({ error: "Customer account not found" }, { status: 404 });
      }

      // Calculate totalSales and totalReceipt for single account
      const totalSalesResult = await Shipment.aggregate([
        { $match: { accountCode: account.accountCode } },
        { $group: { _id: null, total: { $sum: "$totalAmt" } } }
      ]);

      const totalReceiptResult = await PaymentEntry.aggregate([
        { $match: { accountCode: account.accountCode } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]);

      const totalSales = totalSalesResult[0]?.total || 0;
      const totalReceipt = totalReceiptResult[0]?.total || 0;
      const totalOutstanding = totalSales - totalReceipt;

      // Calculate advance from leftOverBalance
      const leftOverBalance = parseFloat(account.leftOverBalance || 0);
      let advance = 0;
      if (leftOverBalance < 0) {
        advance = leftOverBalance; // Negative value represents advance
      }

      // Calculate OS without hold
      const shipments = await Shipment.find({
        accountCode: account.accountCode,
        isHold: false
      });
      
      const osWithoutHold = shipments.reduce((sum, shipment) => 
        sum + (shipment.totalAmt || 0), 0
      );

      // Calculate credit balance: creditLimit + totalOutstanding
      const creditLimit = parseFloat(account.creditLimit || 0);
      const creditBalance = creditLimit + totalOutstanding;

      return Response.json({
        ...account.toObject(),
        totalSales,
        totalReceipt,
        totalOutstanding,
        advance,
        osWithoutHold,
        creditBalance
      });
    }

    // Get all customer accounts
    let customerAccounts = await CustomerAccount.find({});

    // Build date filter if provided
    let dateFilter = {};
    if (fromDate && toDate) {
      const startDate = new Date(fromDate);
      const endDate = new Date(toDate);
      
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      dateFilter = {
        date: {
          $gte: startDate,
          $lte: endDate
        }
      };
    }

    // Calculate totals for each account
    customerAccounts = await Promise.all(customerAccounts.map(async (account) => {
      // Calculate total sales
      const salesMatch = { accountCode: account.accountCode, ...dateFilter };
      const totalSalesResult = await Shipment.aggregate([
        { $match: salesMatch },
        { $group: { _id: null, total: { $sum: "$totalAmt" } } }
      ]);

      // Calculate total receipt
      const receiptMatch = { accountCode: account.accountCode, ...dateFilter };
      const totalReceiptResult = await PaymentEntry.aggregate([
        { $match: receiptMatch },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]);

      const totalSales = totalSalesResult[0]?.total || 0;
      const totalReceipt = totalReceiptResult[0]?.total || 0;
      
      // Total Outstanding = totalSales - totalReceipt
      const totalOutstanding = totalReceipt - totalSales;

      // Calculate advance from leftOverBalance
      const leftOverBalance = parseFloat(account.leftOverBalance || 0);
      let advance = 0;
      if (leftOverBalance < 0) {
        advance = leftOverBalance; // Negative value represents advance
      }

      // Calculate OS without hold (non-hold shipments only)
      const nonHoldMatch = { 
        accountCode: account.accountCode, 
        isHold: false,
        ...dateFilter 
      };
      const osWithoutHoldResult = await Shipment.aggregate([
        { $match: nonHoldMatch },
        { $group: { _id: null, total: { $sum: "$totalAmt" } } }
      ]);
      
      const osWithoutHold = osWithoutHoldResult[0]?.total || 0;

      // Calculate credit balance: creditLimit + totalOutstanding
      const creditLimit = parseFloat(account.creditLimit || 0);
      const creditBalance = creditLimit + totalOutstanding;

      return {
        ...account.toObject(),
        totalSales,
        totalReceipt,
        totalOutstanding,
        advance,
        osWithoutHold,
        creditBalance
      };
    }));

    // If date range is provided, filter to only show accounts with activity
    if (fromDate && toDate) {
      customerAccounts = customerAccounts.filter(account => 
        account.totalSales > 0 || account.totalReceipt > 0
      );
    }

    return Response.json(customerAccounts);

  } catch (error) {
    console.error("Error in total-outstanding route:", error);
    return Response.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}