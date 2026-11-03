import SalesClient from "./SalesClient";

// عملکرد فروش تیم بازرگانی — فقط نقش «بازرگانی» (proxy.js). داده از /api/sales/summary خوانده می‌شود (دیسک دائمی سرور).
export const dynamic = "force-dynamic";
export const metadata = { title: "عملکرد فروش" };

export default function SalesPage() {
  return <SalesClient />;
}
