import { NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * احراز هویت + کنترل دسترسی چندکاربره‌ی کل سایت.
 *
 * جایگزین Basic Auth مشترک قبلی (یک یوزرنیم/پسورد برای همه، در middleware.js
 * قدیمی) — حالا هر کاربر نشست خودش رو داره و نقش مشخصی: "viewer" (فقط مشاهده‌ی
 * همه‌ی صفحات) یا "commercial" (علاوه بر مشاهده، دسترسی به بخش‌های عملیاتی مثل
 * /outreach). کاربران و نقش‌ها توی data/users.json ذخیره می‌شن (نگاه کن
 * web/scripts/manage-users.mjs برای افزودن/ویرایش).
 *
 * چرا proxy.js نه middleware.js: توی Next.js 16 قرارداد middleware.js منسوخ
 * و به proxy.js تغییر نام کرده (رفتار یکسان، فقط اسم فایل/تابع)؛ طبق
 * AGENTS.md قبل از نوشتن کد همیشه باید docs بسته‌شده‌ی همین نسخه رو چک کرد.
 */

// مسیرهایی که بدون لاگین هم باید در دسترس باشن (صفحه‌ی لاگین خودش + API
// لاگین/خروج) — وگرنه کاربر هیچ‌وقت نمی‌تونه وارد شه.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

// مسیرهایی که فقط نقش «بازرگانی» بهشون دسترسی داره — نقش «مشاهده‌گر»
// (مثلاً مدیران) حتی با لاگین معتبر هم از این‌ها رد می‌شه.
const COMMERCIAL_ONLY_PREFIXES = ["/outreach", "/api/outreach"];

function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isCommercialOnly(pathname) {
  return COMMERCIAL_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: "لازم است وارد شوید." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isCommercialOnly(pathname) && session.role !== "commercial") {
    if (isApi) {
      return NextResponse.json({ error: "دسترسی به این بخش نداری." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // همه‌ی مسیرها محافظت می‌شن به‌جز فایل‌های داخلی Next.js و آیکون‌ها.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
