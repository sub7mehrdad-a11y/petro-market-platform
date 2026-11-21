import CustomerProfile from "./CustomerProfile";

// پروفایل یک مشتری (شرکت، افراد کلیدی، راه‌های ارتباطی، سابقه‌ی خرید و پرداخت) — فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";
export const metadata = { title: "پرونده‌ی مشتری" };

export default async function CustomerPage({ params }) {
  const { id } = await params;
  let key = id;
  try { key = decodeURIComponent(id); } catch {}
  return <CustomerProfile id={key} />;
}
