import { redirect } from "next/navigation";

// حساب‌ها و پرداخت‌ها با قراردادها یکی شد: هر قرارداد پرداخت‌هایش را در همان صفحه‌ی «قراردادها و حسابداری» دارد.
export const dynamic = "force-dynamic";

export default function AccountsRedirect() {
  redirect("/sales/contracts");
}
