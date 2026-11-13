import CustomersClient from "./CustomersClient";

// پرونده‌ی مشتریان (تماس، آدرس، یادداشت، خلاصه‌ی حساب) — فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";
export const metadata = { title: "مشتریان" };

export default function CustomersPage() {
  return <CustomersClient />;
}
