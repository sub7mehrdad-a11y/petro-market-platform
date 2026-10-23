// گرید شرکت‌ها برای نمایش در صفحه‌ی کشور — بر پایه‌ی همان classifyGrade ایمیل معرفی (متن آزاد «گرید هدف» → food/feed/industrial/unclear).
// جدا از outreachStatus تا صفحه‌های استاتیک وابستگی‌های IMAP/SMTP را نکشند.
import { classifyGrade } from "@/lib/outreachTemplate";

export const GRADE_LABELS_FA = {
  food: "خوراکی",
  feed: "دامی",
  industrial: "صنعتی",
  unclear: "نامشخص/چندگانه",
};

export function gradeOf(company) {
  return classifyGrade(company.target_grade);
}

export function countByGrade(companies) {
  const counts = { food: 0, feed: 0, industrial: 0, unclear: 0 };
  for (const c of companies) counts[gradeOf(c)] += 1;
  return counts;
}
