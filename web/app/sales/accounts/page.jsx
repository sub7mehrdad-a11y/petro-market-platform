import AccountsClient from "./AccountsClient";

// حساب‌ها و پرداخت‌های فروش (قرارداد ↔ پرداخت ↔ حساب مشتری) — فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";
export const metadata = { title: "حساب‌ها و پرداخت‌ها" };

export default function AccountsPage() {
  return <AccountsClient />;
}
