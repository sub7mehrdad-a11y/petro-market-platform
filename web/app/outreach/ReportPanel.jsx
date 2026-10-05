"use client";

import { useState } from "react";

const GRADE_FA = { food: "خوراکی", feed: "دامی (فید)", industrial: "صنعتی", unclear: "نامشخص/چندگانه", unknown: "نامشخص (کمپین قبلی)" };
const PERIODS = [
  ["7", "۷ روز اخیر"],
  ["30", "۳۰ روز اخیر"],
  ["90", "۹۰ روز اخیر"],
  ["all", "کل زمان"],
];

const n = (v) => (v == null ? "—" : Number(v).toLocaleString("fa-IR"));
const pct = (v) => (v == null ? "—" : `${Number(v).toLocaleString("fa-IR")}٪`);

// گزارش عملکرد: از روی لاگ ارسال + صندوق ورودی ایمیل شرکتی (فقط با درخواست صریح، چون
// خواندن IMAP چند ثانیه تا یک دقیقه طول می‌کشه).
export default function ReportPanel() {
  const [period, setPeriod] = useState("7");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");

  // دانلود: همین گزارشی که روی صفحه است (بدون خواندن دوباره‌ی صندوق ورودی) به سرور فرستاده می‌شه
  // تا اکسل/HTML ساخته و برگردونده بشه.
  async function download(format) {
    if (!report) return;
    setDownloading(format);
    setError("");
    try {
      const res = await fetch("/api/outreach/report/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, report }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "ساخت فایل ناموفق بود.");
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `outreach-report.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("خطا در دانلود فایل.");
    } finally {
      setDownloading("");
    }
  }

  async function build() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/outreach/report?days=${period}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "ساخت گزارش ناموفق بود.");
      else setReport(data);
    } catch {
      setError("خطا در ارتباط با سرور.");
    } finally {
      setLoading(false);
    }
  }

  const t = report?.totals;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold">گزارش عملکرد ایمیل‌ها</h2>
          <p className="text-xs text-slate-500 mt-0.5">چندتا ارسال شد، برای کدام گرید، چندتا تحویل/برگشت خورد و چندتا پاسخ دادن — از روی صندوق ورودی ایمیل شرکتی.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            {PERIODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button type="button" onClick={build} disabled={loading} className="bg-copper-700 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-copper-800 disabled:opacity-40">
            {loading ? "در حال خواندن صندوق ورودی..." : "ساخت گزارش"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}

      {report && t && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button type="button" onClick={() => download("xlsx")} disabled={!!downloading} className="border border-emerald-600 text-emerald-700 text-sm font-medium rounded-lg px-3 py-1.5 hover:bg-emerald-50 disabled:opacity-40">
              {downloading === "xlsx" ? "در حال ساخت..." : "دانلود اکسل (تیم بازرگانی)"}
            </button>
            <button type="button" onClick={() => download("html")} disabled={!!downloading} className="border border-copper-600 text-copper-800 text-sm font-medium rounded-lg px-3 py-1.5 hover:bg-copper-50 disabled:opacity-40">
              {downloading === "html" ? "در حال ساخت..." : "دانلود گزارش هیئت‌مدیره (با نمودار)"}
            </button>
            <span className="text-xs text-slate-400">فایل HTML را در مرورگر باز کنید؛ برای PDF از «چاپ» استفاده کنید.</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-4">
            {[
              ["ارسال‌شده", t.sent],
              ["تحویل تأییدشده", t.confirmed_delivered],
              ["برگشتی قطعی", t.failed],
              ["در تأخیر", t.delayed],
              ["پاسخ واقعی", t.replied],
              ["پاسخ خودکار", t.auto_replied],
            ].map(([label, v]) => (
              <div key={label} className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="text-xl font-bold font-tabular text-petrol-900">{n(v)}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mb-3">
            نرخ برگشتی: <b>{pct(t.bounce_rate_pct)}</b> · نرخ پاسخ (از تحویل‌شده‌ی برآوردی): <b>{pct(t.reply_rate_pct)}</b>
            {t.bounce_rate_pct != null && t.bounce_rate_pct > 5 && (
              <span className="text-rose-700"> — نرخ برگشتی بالاست (بیش از ۵٪)؛ لیست ایمیل‌ها رو پاک‌سازی کن تا اعتبار دامنه نسوزه.</span>
            )}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-3">گرید</th>
                  <th className="py-2 pe-3">ارسال</th>
                  <th className="py-2 pe-3">تحویل‌تأییدشده</th>
                  <th className="py-2 pe-3">برگشتی</th>
                  <th className="py-2 pe-3">پاسخ</th>
                  <th className="py-2">نرخ پاسخ</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.by_grade).map(([g, v]) => (
                  <tr key={g} className="border-b border-slate-100">
                    <td className="py-2 pe-3 font-medium">{GRADE_FA[g] || g}</td>
                    <td className="py-2 pe-3 font-tabular">{n(v.sent)}</td>
                    <td className="py-2 pe-3 font-tabular">{n(v.confirmed_delivered)}</td>
                    <td className="py-2 pe-3 font-tabular">{n(v.failed)}</td>
                    <td className="py-2 pe-3 font-tabular">{n(v.replied)}</td>
                    <td className="py-2 font-tabular">{pct(v.reply_rate_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.replied_companies.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-bold mb-1">شرکت‌های پاسخ‌دهنده</h3>
              <ul className="text-sm text-slate-700 divide-y divide-slate-100">
                {report.replied_companies.map((c, i) => (
                  <li key={i} className="py-1.5">
                    {c.name || "—"} {c.country ? `(${c.country})` : ""} · گرید {GRADE_FA[c.grade] || c.grade}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="mt-4 text-[11px] text-slate-400 space-y-0.5 list-disc ps-4">
            {report.notes.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
