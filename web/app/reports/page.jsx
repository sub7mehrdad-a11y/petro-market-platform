import Link from "next/link";
import { getReportsManifest, getParsedReport } from "@/lib/data";

export default function SmartReportsPage() {
  const smartReports = getReportsManifest().filter((r) => r.report_type === "summary");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">گزارش‌های هوشمند</h1>
        <p className="text-sm text-slate-500 mt-1">
          همون گزارش‌های مدیریتی که به مدیران ارائه می‌شه — با فرمت مصوب، و همیشه بر اساس آخرین قیمت‌های
          جمع‌آوری‌شده به‌روز می‌مونه (به بخش «قیمت‌های زنده» داخل هر گزارش نگاه کنید). گزارش‌های مفصل و
          آرشیو کامل رو توی <Link href="/archive" className="text-emerald-700 hover:underline">آرشیو گزارش‌ها</Link> پیدا کنید.
        </p>
      </div>

      {smartReports.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-500">هنوز گزارش هوشمندی ثبت نشده.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {smartReports.map((r) => {
            const parsed = getParsedReport(r.id);
            const stats = (parsed?.key_stats || []).slice(0, 2);
            return (
              <Link
                key={r.id}
                href={`/reports/${r.id}`}
                className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-emerald-600 hover:shadow-sm transition"
              >
                <div className="text-xs text-slate-500 mb-1">{r.country} · {r.product}</div>
                <h2 className="font-bold mb-3 leading-6">{r.title}</h2>
                {stats.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {stats.map((s, i) => (
                      <div key={i} className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                        <span className="text-slate-500">{s.label}: </span>
                        <span className="font-semibold text-emerald-800">{s.value} {s.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
                <span className="inline-block mt-3 text-sm text-emerald-700">مشاهده‌ی گزارش کامل ←</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
