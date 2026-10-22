import Link from "next/link";
import { notFound } from "next/navigation";
import { getParsedReport, getReportsManifest, getCountryProfile, getLatestPricesForCountry } from "@/lib/data";
import DetailedReportView from "../../components/DetailedReportView";
import SummaryReportView from "../../components/SummaryReportView";
import HtmlReportFrame from "../../components/HtmlReportFrame";

const REPORT_TYPE_FA = { detailed: "گزارش مفصل", summary: "گزارش مدیریتی (خلاصه)" };

export function generateStaticParams() {
  return getReportsManifest().map((r) => ({ id: r.id }));
}

export default async function ReportDetailPage({ params }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const manifest = getReportsManifest();
  const entry = manifest.find((r) => r.id === id);

  if (!entry) {
    notFound();
  }

  const parsed = getParsedReport(id);
  const isSummary = parsed?.report_type === "summary";
  const countryProfile = isSummary ? getCountryProfile(entry.country) : null;
  const livePrices = isSummary ? getLatestPricesForCountry(entry.country) : [];
  const backHref = entry.report_type === "detailed" ? "/archive" : "/reports";
  const backLabel = entry.report_type === "detailed" ? "← بایگانی گزارش‌ها" : "← گزارش‌های هوشمند";

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-text-muted hover:text-primary transition-colors">
          {backLabel}
        </Link>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold">{entry.title}</h1>
            <p className="text-sm text-text-muted mt-1">
              {entry.country} · {entry.product}
              {entry.report_type && <> · {REPORT_TYPE_FA[entry.report_type]}</>}
            </p>
          </div>
          <div className="shrink-0 flex flex-wrap gap-2">
            {entry.docx_relative_path && (
              <a
                href={`/api/reports/download?id=${encodeURIComponent(entry.id)}&format=docx`}
                className="border border-primary text-primary-hover text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-primary-soft transition-all"
              >
                دانلود فایل Word
              </a>
            )}
            <a
              href={`/api/reports/download?id=${entry.id}`}
              className="bg-primary text-white text-sm font-medium rounded-lg px-4 py-2.5 shadow-sm hover:bg-primary-hover hover:shadow-md transition-all"
            >
              {entry.docx_relative_path ? "دانلود نسخه‌ی HTML" : "دانلود فایل اصلی"}
            </a>
          </div>
        </div>

        {!parsed ? (
          <p className="text-sm text-text-muted">
            نسخه‌ی وب هوشمند برای این فایل ساخته نشده؛ فقط فایل اصلی رو دانلود کنید.
          </p>
        ) : parsed.format === "html" ? (
          <HtmlReportFrame src={parsed.html_path} title={entry.title} />
        ) : isSummary ? (
          <SummaryReportView report={parsed} livePrices={livePrices} countryProfile={countryProfile} />
        ) : (
          <DetailedReportView blocks={parsed.blocks || []} />
        )}
      </section>
    </div>
  );
}
