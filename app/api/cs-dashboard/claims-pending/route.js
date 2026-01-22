// app/api/cs-dashboard/claims-pending/route.js - Alternative version with related data
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Complaint from "@/app/model/Complaint";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";

await connectDB();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "Today";
    const status = searchParams.get("status") || "Process Claim";
    const download = searchParams.get("download") === "true";

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);

    let dateQuery = {};
    let label = "";

    switch (range) {
      case "Today":
        dateQuery = { $gte: todayStart, $lt: todayEnd };
        label = "Today";
        break;
      case "Yesterday":
        dateQuery = { $gte: yesterdayStart, $lt: yesterdayEnd };
        label = "Yesterday";
        break;
      case "Last 7 Days":
        const sevenDaysAgo = new Date(todayStart);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        dateQuery = { $gte: sevenDaysAgo, $lt: todayEnd };
        label = "Last 7 Days";
        break;
      case "Last 30 Days":
        const thirtyDaysAgo = new Date(todayStart);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        dateQuery = { $gte: thirtyDaysAgo, $lt: todayEnd };
        label = "Last 30 Days";
        break;
      default:
        dateQuery = { $gte: todayStart, $lt: todayEnd };
        label = "Today";
    }

    // Find complaints with status "Process Claim"
    const complaints = await Complaint.find({
      status: status,
      createdAt: dateQuery
    }).sort({ createdAt: -1 });

    if (download) {
      // If we need to fetch additional data for downloads
      const formattedClaims = await Promise.all(
        complaints.map(async (complaint) => {
          // Fetch shipment details if needed
          let shipment = null;
          let customer = null;
          
          if (complaint.awbNo) {
            shipment = await Shipment.findOne(
              { awbNo: complaint.awbNo },
              { accountCode: 1, sector: 1, receiverFullName: 1 }
            ).lean();
            
            if (shipment?.accountCode) {
              customer = await CustomerAccount.findOne(
                { accountCode: shipment.accountCode },
                { name: 1, accountCode: 1 }
              ).lean();
            }
          }

          return {
            claimNo: complaint.complaintNo || complaint.complaintID || "",
            claimDate: complaint.createdAt ? new Date(complaint.createdAt).toLocaleDateString() : "",
            awbNo: complaint.awbNo || "",
            customerName: customer?.name || shipment?.receiverFullName || "",
            customerCode: shipment?.accountCode || "",
            sector: shipment?.sector || "",
            claimType: complaint.complaintType || "",
            claimAmount: complaint.claimAmount || "",
            status: complaint.status || "",
            assignedTo: complaint.assignTo || "",
          };
        })
      );

      return NextResponse.json({
        claims: formattedClaims,
        count: complaints.length,
        range: label,
        status: status,
      });
    }

    // Return count only for card display
    return NextResponse.json({
      count: complaints.length,
      range: label,
      status: status,
    });
  } catch (error) {
    console.error("GET Claims Pending Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}