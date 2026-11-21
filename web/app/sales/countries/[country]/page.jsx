import CountryClient from "./CountryClient";

// بررسی عملکرد صادرات به یک کشور — فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";
export const metadata = { title: "بررسی صادرات به کشور" };

export default async function CountryPerformancePage({ params }) {
  const { country } = await params;
  let name = country;
  try { name = decodeURIComponent(country); } catch {}
  return <CountryClient country={name} />;
}
