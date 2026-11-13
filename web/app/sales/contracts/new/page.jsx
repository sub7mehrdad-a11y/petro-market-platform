import NewContractClient from "./NewContractClient";

// ثبت قرارداد جدید در پلتفرم (مشتری، سفارش، برنامه‌ی پرداخت و تحویل) — فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";
export const metadata = { title: "ثبت قرارداد جدید" };

export default function NewContractPage() {
  return <NewContractClient />;
}
