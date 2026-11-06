import ForecastClient from "./ForecastClient";

// دفتر پیش‌بینی مغز (مرحله‌ی ۰) — فقط نقش «بازرگانی» (proxy.js). هر کاربر با حساب خودش؛ پیش‌بینی مغز فقط بعد از ثبت خودش دیده می‌شود.
export const dynamic = "force-dynamic";
export const metadata = { title: "دفتر پیش‌بینی" };

export default function ForecastPage() {
  return <ForecastClient />;
}
