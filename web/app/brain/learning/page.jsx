import LearningClient from "./LearningClient";

// یادگیری مغز (مرحله‌ی ۱۰): نسخه‌های روش، آزمایش‌های فعال، تثبیت ماهانه — فقط مدیر
export const dynamic = "force-dynamic";
export const metadata = { title: "یادگیری مغز" };

export default function LearningPage() {
  return <LearningClient />;
}
