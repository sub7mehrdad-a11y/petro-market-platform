import SalesHome from "./SalesHome";

// پلتفرم جامع بازرگانی (صفحه‌ی اصلی): خلاصه‌ی عملکرد، نمودار فروش، هشدارها و ورود به «مدیریت قراردادها و حسابداری».
// فقط نقش «بازرگانی» (proxy.js). گزارش‌های تفصیلی در /sales/reports و از داخل بخش مدیریت قراردادها باز می‌شوند.
export const dynamic = "force-dynamic";
export const metadata = { title: "پلتفرم جامع بازرگانی" };

export default function SalesPage() {
  return <SalesHome />;
}
