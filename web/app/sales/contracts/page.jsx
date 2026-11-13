import ContractsClient from "./ContractsClient";

// مدیریت قراردادها و حسابداری (مرکز پنل بازرگانی) — فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";
export const metadata = { title: "مدیریت قراردادها و حسابداری" };

export default function ContractsPage() {
  return <ContractsClient />;
}
