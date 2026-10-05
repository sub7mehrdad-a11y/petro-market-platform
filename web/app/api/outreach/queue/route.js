import { NextResponse } from "next/server";
import { getQueueSummary, queueAction } from "@/lib/outreachQueue";

// وضعیت صف ارسال (برای پنل زنده‌ی صفحه‌ی /outreach). فقط نقش «بازرگانی» (proxy.js).
export async function GET() {
  return NextResponse.json(getQueueSummary());
}

const ACTIONS = new Set(["pause", "resume", "cancel_all", "cancel", "retry_failed"]);

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }
  if (!ACTIONS.has(body?.action)) {
    return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  }
  queueAction(body.action, body.ids);
  return NextResponse.json(getQueueSummary());
}
