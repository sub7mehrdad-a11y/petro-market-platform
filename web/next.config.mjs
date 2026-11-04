import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // پوشه‌های data/ و reports/ بیرون از web/ هستن (کنارش، نه داخلش). موقع دیپلوی
  // روی Vercel، Next.js به‌صورت پیش‌فرض فقط فایل‌های داخل web/ رو همراه تابع
  // سرورلس می‌بره — پس باید صریحاً بگیم ریشه‌ی ردیابی، ریشه‌ی ریپوئه و این دو
  // پوشه هم باید همراه بسته بشن، وگرنه دکمه‌ی «دانلود فایل اصلی» روی سرور
  // ۴۰۴ می‌ده (هرچند صفحات ایستا چون موقع build ساخته می‌شن سالم می‌مونن).
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/api/reports/**": ["../reports/**/*"],
    "/**": ["../data/**/*"],
  },
  // روی ماشین‌های کم‌حافظه (لپ‌تاپ ۸ گیگ با چند برنامه‌ی باز) ساخت صفحه‌ها با ۷ کارگر موازی به OOM می‌خورد؛
  // با NEXT_BUILD_CPUS=2 تعداد کارگرها کم می‌شود. بدون این متغیر رفتار پیش‌فرض (لیارا) دست‌نخورده است.
  ...(Number(process.env.NEXT_BUILD_CPUS) > 0 ? { experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) } } : {}),
};

export default nextConfig;
