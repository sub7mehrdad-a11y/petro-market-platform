import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// فقط برای ناوبری سمت کلاینت (Sidebar) — تا خوندن کوکی لازم نیست توی
// layout.js (سرور) بیفته و کل سایت رو از prerender استاتیک خارج کنه.
export async function GET() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ username: null, role: null }, { status: 401 });
  }
  // outreachEnabled اینجا (runtime) خونده می‌شه، نه توی layout.js — تا با ست‌کردن
  // env روی Liara فقط restart کافی باشه و به rebuild نیاز نباشه.
  return NextResponse.json({
    username: session.username,
    role: session.role,
    outreachEnabled: process.env.OUTREACH_UI_ENABLED === "true",
  });
}
