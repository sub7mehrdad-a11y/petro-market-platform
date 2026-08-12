import Link from "next/link";
import { notFound } from "next/navigation";
import { getParsedReport, getReportsManifest } from "@/lib/data";
import DetailedReportView from "../../components/DetailedReportView";
import SummaryReportView from "../../components/SummaryReportView";

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

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-slate-500 hover:underline">
          ← همه‌ی گزارش‌ها
        </Link>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold">{entry.title}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {entry.country} · {entry.product}
              {entry.report_type && <> · {REPORT_TYPE_FA[entry.report_type]}</>}
            </p>
          </div>
          <a
            href={`/api/reports/download?id=${entry.id}`}
            className="shrink-0 bg-emerald-700 text-white text-sm rounded-md px-4 py-2 hover:bg-emerald-800"
          >
            دانلود فایل اصلی
          </a>
        </div>

        {!parsed ? (
          <p className="text-sm text-slate-500">
            نسخه‌ی وب هوشمند برای این فایل ساخته نشده؛ فقط فایل اصلی رو دانلود کنید.
          </p>
        ) : parsed.report_type === "summary" ? (
          <SummaryReportView report={parsed} />
        ) : (
          <DetailedReportView blocks={parsed.blocks || []} />
        )}
      </section>
    </div>
  );
}
