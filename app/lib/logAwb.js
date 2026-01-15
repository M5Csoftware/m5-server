// app/lib/logAwb.js - FINAL SIMPLE VERSION
import AWBLog from "@/app/model/AWBLog";
import os from "os";

export async function logAWB({
  awbNo,
  action = "",
  actionUser = "Unknown",
  accountCode = "",
  customerName = "",
  ip = "unknown",
  meta = {},
}) {
  if (!awbNo) {
    console.warn("⚠️ logAWB: No awbNo provided");
    return;
  }

  try {
    const hostname = os.hostname();

    await AWBLog.findOneAndUpdate(
      { awbNo },
      {
        $push: {
          logs: {
            action,
            actionUser,
            actionSystemIp: ip,
            actionSystemName: hostname,
            actionLogDate: new Date(),
            meta,
          },
        },
        $set: {
          accountCode: accountCode || null,
          customer: customerName || "",
          customerName: customerName || "",
          lastActionSystemName: hostname,
        },
      },
      { upsert: true, new: true }
    );

    console.log(`✅ AWB logged: ${awbNo} by ${actionUser}`);
  } catch (err) {
    console.error(`❌ AWB Log failed for ${awbNo}:`, err.message);
  }
}
