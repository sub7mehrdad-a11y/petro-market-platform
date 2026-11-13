import ReportsClient from "./ReportsClient";

// گزارش‌گیری فروش (جزئیات گزارش، بارگذاری فایل، تحلیل مغز) — فقط نقش «بازرگانی» (proxy.js). از بخش «مدیریت قراردادها و حسابداری» وارد می‌شوند.
export const dynamic = "force-dynamic";
export const metadata = { title: "گزارش‌گیری فروش" };

export default function ReportsPage() {
  return <ReportsClient />;
}
