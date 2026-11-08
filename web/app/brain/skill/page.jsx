import SkillClient from "./SkillClient";

// مهارت‌سنجی پیش‌بین‌ها در برابر خط مبنا (مرحله‌ی ۴) — هر کارشناس فقط نمره‌ی خودش را می‌بیند؛ مدیر همه را.
export const dynamic = "force-dynamic";
export const metadata = { title: "مهارت‌سنجی" };

export default function SkillPage() {
  return <SkillClient />;
}
