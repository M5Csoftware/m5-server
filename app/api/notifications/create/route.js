import connectDB from "@/app/lib/db";
import Notification from "@/app/model/Notification";

export async function POST(req) {
  await connectDB();

  const body = await req.json();

  const notification = await Notification.create(body);

  return Response.json(notification);
}
