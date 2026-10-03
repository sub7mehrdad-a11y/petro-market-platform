import { NextResponse } from "next/server";
import { findUserByUsername } from "@/lib/data";
import { verifyPassword, createSession, SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from "@/lib/auth";

export async function POST(request) {
  // بدون این، createSession پایین‌تر throw می‌کنه و کاربر یک ۵۰۰ خام می‌بینه —
  // به‌جاش یک پیام روشن بده (یادت باشه: SESSION_SECRET هم توی .env محلی هم
  // توی تنظیمات محیطی Liara لازمه).
  if (!process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: "پیکربندی سرور ناقص است (SESSION_SECRET تنظیم نشده)." },
      { status: 500 }
    );
  }

  let username, password;
  try {
    ({ username, password } = await request.json());
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json({ error: "نام کاربری و رمز عبور الزامی است." }, { status: 400 });
  }

  const user = findUserByUsername(username);
  // پیام خطای یکسان برای «کاربر نیست» و «رمز غلط است» — تا امکان حدس‌زدن
  // نام‌های کاربری معتبر از روی تفاوت پیام فراهم نشه.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "نام کاربری یا رمز عبور اشتباه است." }, { status: 401 });
  }

  const token = createSession(user);
  const response = NextResponse.json({ ok: true, role: user.role });
  // Secure فقط وقتی کاربر واقعاً با https وارد شده (پشت پروکسی Liara پروتکل
  // اصلی توی x-forwarded-proto میاد). قبلاً با NODE_ENV=production همیشه Secure
  // بود: روی http (دامنه‌ی بدون SSL، یا آدرس شبکه‌ی محلی) مرورگر کوکی رو دور
  // می‌ریخت و کاربر بعد از «ورود موفق» دوباره به /login برمی‌گشت.
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const isHttps = forwardedProto ? forwardedProto === "https" : request.nextUrl.protocol === "https:";
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return response;
}
