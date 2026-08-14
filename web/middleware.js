import { NextResponse } from "next/server";

/**
 * محافظت از کل سایت با رمز عبور (HTTP Basic Auth).
 *
 * چرا این‌جا و نه تنظیمات Vercel: قابلیت Password Protection خود Vercel فقط در
 * پلن پولی (Pro) هست؛ این میدل‌ور همون کار رو روی پلن رایگان انجام می‌ده.
 *
 * مزیت جانبی مهم: چون خزنده‌های گوگل هم جواب ۴۰۱ می‌گیرن، سایت اصلاً ایندکس
 * نمی‌شه — یعنی محتوای داخلی شرکت (لیست شرکت‌ها، قیمت پایه، تحلیل رقبا) توی
 * نتایج جست‌وجو ظاهر نمی‌شه.
 *
 * رمز هرگز داخل کد نیست: از متغیرهای محیطی خونده می‌شه که در داشبورد Vercel
 * تنظیم می‌شن (Settings > Environment Variables):
 *   SITE_USER      نام کاربری (اگه تنظیم نشه، پیش‌فرض: sepehran)
 *   SITE_PASSWORD  رمز عبور  (اگه تنظیم نشه، محافظت غیرفعاله)
 *
 * اگه SITE_PASSWORD تنظیم نشده باشه عمداً سایت رو باز می‌ذاریم، تا اجرای محلی
 * (npm run dev) بدون دردسر رمز کار کنه.
 */

// مقایسه‌ی طول‌ثابت تا زمان پاسخ، حرفی درباره‌ی درستی رمز نزنه.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function middleware(request) {
  const expectedPassword = process.env.SITE_PASSWORD;

  // محافظت فقط وقتی فعاله که رمز تعریف شده باشه (یعنی روی Vercel).
  if (!expectedPassword) {
    return NextResponse.next();
  }

  const expectedUser = process.env.SITE_USER || "sepehran";
  const header = request.headers.get("authorization") || "";

  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);

      if (safeEqual(user, expectedUser) && safeEqual(pass, expectedPassword)) {
        return NextResponse.next();
      }
    } catch {
      // هدر خراب — مثل عدم احراز هویت رفتار کن
    }
  }

  return new NextResponse("احراز هویت لازم است — Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Sepehran Chemistry R&D", charset="UTF-8"',
    },
  });
}

export const config = {
  // همه‌ی مسیرها محافظت می‌شن به‌جز فایل‌های داخلی Next.js و آیکون‌ها.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
