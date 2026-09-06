import { getCompanies, getCountryEnglishName, getEmailOutreachSent } from "@/lib/data";
import { classifyGrade } from "@/lib/outreachTemplate";
import OutreachClient from "./OutreachClient";

// فقط ۴۰۷ شرکت داریم — فیلتر/جست‌وجو کاملاً سمت کلاینت انجام می‌شه (مثل
// بانک شرکت‌ها)، بدون رفت‌وبرگشت شبکه؛ فقط عمل «ارسال» به سرور می‌ره چون
// راز SMTP اونجاست.
export default function OutreachPage() {
  const sentEmails = new Set(getEmailOutreachSent().map((r) => r.email));

  const companies = getCompanies()
    .filter((c) => c.email)
    .map((c) => ({
      id: c.id,
      english_name: c.english_name,
      country: c.country,
      country_en: getCountryEnglishName(c.country),
      industry: c.industry,
      target_grade: c.target_grade,
      grade: classifyGrade(c.target_grade),
      email: c.email,
      already_sent: sentEmails.has((c.email || "").trim().toLowerCase()),
    }));

  const countries = [...new Set(companies.map((c) => c.country))].sort((a, b) => a.localeCompare(b, "fa"));

  return (
    <OutreachClient
      companies={companies}
      countries={countries}
      sendingEnabled={process.env.OUTREACH_SENDING_ENABLED === "true"}
    />
  );
}
