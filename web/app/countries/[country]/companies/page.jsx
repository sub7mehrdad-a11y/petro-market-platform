import { notFound } from "next/navigation";
import { getCompanies, getCountries } from "@/lib/data";
import { gradeOf } from "@/lib/companyGrades";
import CountryCompaniesClient from "./CountryCompaniesClient";

// صفحه‌ی کامل شرکت‌های یک کشور (مقصد باکس «شرکت‌ها» در صفحه‌ی کشور). خودِ صفحه استاتیک است؛ وضعیت ایمیل و ارسال
// فقط برای نقش بازرگانی و از API (/api/outreach/company-status) در مرورگر می‌آید، پس برای بقیه چیزی از ایمیل دیده نمی‌شود.
export function generateStaticParams() {
  const withCompanies = new Set(getCompanies().map((c) => c.country).filter(Boolean));
  return getCountries().filter((c) => withCompanies.has(c)).map((country) => ({ country }));
}

export default async function CountryCompaniesPage({ params }) {
  const { country: rawCountry } = await params;
  const country = decodeURIComponent(rawCountry);

  const companies = getCompanies()
    .filter((c) => c.country === country)
    .map((c) => ({
      id: c.id,
      english_name: c.english_name,
      arabic_name: c.arabic_name || null,
      industry: c.industry || null,
      target_grade: c.target_grade || null,
      grade: gradeOf(c),
      purchasing_potential: c.purchasing_potential || null,
      action_plan: c.action_plan || null,
      phone: c.phone || null,
      email: c.email || null,
      website: c.website || null,
      address: c.address || null,
    }));

  if (companies.length === 0) notFound();

  return <CountryCompaniesClient country={country} companies={companies} />;
}
