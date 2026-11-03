"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import RichText from "../components/RichText";

const fa = (n, d = 0) => (n == null ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d }));
const usd = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);

function Delta({ pct }) {
  if (pct == null) return null;
  const up = pct > 0;
  return (
    <span className={`text-[11px] font-semibold ${pct === 0 ? "text-text-muted" : up ? "text-success" : "text-danger"}`} dir="ltr">
      {up ? "▲" : pct < 0 ? "▼" : "•"} {Math.abs(pct)}٪
    </span>
  );
}

function Kpi({ label, value, sub, delta }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-text">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
        {sub}
        <Delta pct={delta} />
      </div>
    </div>
  );
}

// نمودار میله‌ای ساده‌ی تناژ هفتگی + خط قیمت میانگین (SVG بدون وابستگی)
function WeeklyChart({ weekly }) {
  const data = weekly.slice(-16);
  const W = 640, H = 190, padL = 8, padB = 28, padT = 14;
  const maxT = Math.max(...data.map((w) => w.tons), 1);
  const prices = data.map((w) => w.avg_price).filter((p) => p != null);
  const minP = prices.length ? Math.min(...prices) * 0.95 : 0;
  const maxP = prices.length ? Math.max(...prices) * 1.05 : 1;
  const bw = (W - padL * 2) / data.length;
  const y = (t) => padT + (H - padT - padB) * (1 - t / maxT);
  const py = (p) => padT + (H - padT - padB) * (1 - (p - minP) / (maxP - minP || 1));
  const line = data.map((w, i) => (w.avg_price == null ? null : `${padL + bw * i + bw / 2},${py(w.avg_price)}`)).filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="روند هفتگی تناژ و قیمت" direction="ltr">
      {data.map((w, i) => (
        <g key={w.week}>
          <rect x={padL + bw * i + bw * 0.15} y={y(w.tons)} width={bw * 0.7} height={H - padB - y(w.tons)} rx="3" fill="var(--color-primary, #1f6feb)" opacity="0.85" />
          <text x={padL + bw * i + bw / 2} y={y(w.tons) - 3} textAnchor="middle" fontSize="9" fill="currentColor">{Math.round(w.tons)}</text>
          <text x={padL + bw * i + bw / 2} y={H - 12} textAnchor="middle" fontSize="8.5" fill="currentColor" opacity="0.6">{w.week.slice(5)}</text>
        </g>
      ))}
      {line && <polyline points={line} fill="none" stroke="#d97706" strokeWidth="2" />}
      {data.map((w, i) => w.avg_price != null && <circle key={w.week} cx={padL + bw * i + bw / 2} cy={py(w.avg_price)} r="3" fill="#d97706" />)}
    </svg>
  );
}

function Table({ title, rows, cols }) {
  if (!rows?.length) return null;
  return (
    <section className="card p-4">
      <h3 className="mb-2 text-sm font-bold text-text">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted">
              {cols.map((c) => <th key={c.label} className="px-2 py-1.5 text-start font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {cols.map((c) => <td key={c.label} className="px-2 py-1.5 text-text">{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UploadPanel({ onSaved }) {
  const fileRef = useRef(null);
  const [week, setWeek] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  async function send(save) {
    const f = fileRef.current?.files?.[0];
    if (!f) { setError("اول فایل اکسل را انتخاب کنید."); return; }
    setBusy(true); setError("");
    const fd = new FormData();
    fd.set("file", f);
    if (week.trim()) fd.set("week_start", week.trim());
    if (save) fd.set("save", "1");
    try {
      const res = await fetch("/api/sales/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "خطا"); setPreview(data.errors ? { errors: data.errors, warnings: data.warnings || [] } : null); }
      else if (data.saved) { setPreview(null); fileRef.current.value = ""; setWeek(""); onSaved(data.preview); }
      else setPreview(data.preview);
    } catch (e) {
      setError(`ارتباط با سرور برقرار نشد: ${e.message}`);
    } finally { setBusy(false); }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-bold text-text">بارگذاری گزارش هفتگی</h2>
      <p className="mb-3 text-xs leading-6 text-text-muted">
        هر هفته یک فایل اکسل با قالب رسمی. اول پیش‌نمایش می‌گیرید و بعد تأیید می‌کنید؛ اگر همان هفته قبلاً بارگذاری شده باشد جایگزین می‌شود.{" "}
        <a href="/api/sales/template" className="font-semibold text-primary hover:underline">دانلود قالب اکسل ↓</a>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs text-text-muted">
          فایل گزارش (.xlsx)
          <input ref={fileRef} type="file" accept=".xlsx" onChange={() => setPreview(null)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-text-muted sm:w-52">
          هفته (اختیاری؛ هر تاریخ داخل هفته)
          <input value={week} onChange={(e) => setWeek(e.target.value)} placeholder="۱۴۰۵/۰۸/۱۰" dir="ltr" className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        </label>
        <button type="button" disabled={busy} onClick={() => send(false)} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer">
          {busy ? "…" : "پیش‌نمایش"}
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      {preview && (
        <div className="mt-4 space-y-3 text-sm">
          {preview.rows != null && (
            <div className="rounded-lg bg-canvas p-3 leading-7">
              هفته‌ی <b>{preview.week_start}</b> (شروع شنبه) — <b>{fa(preview.rows)}</b> ردیف معتبر، <b>{fa(preview.tons, 1)}</b> تن.
              {preview.will_replace && <span className="text-warning"> ⚠ جایگزین گزارش قبلی همین هفته ({fa(preview.will_replace.rows)} ردیف) می‌شود.</span>}
              {preview.other_weeks_in_dates?.length > 0 && <span className="text-text-muted"> تاریخ بعضی ردیف‌ها در هفته‌های دیگر است ({preview.other_weeks_in_dates.join("، ")}) ولی همه در همین هفته ثبت می‌شوند.</span>}
            </div>
          )}
          {preview.errors?.length > 0 && (
            <div className="rounded-lg border border-danger bg-danger-soft p-3 text-xs leading-6 text-danger">
              <b>{fa(preview.errors.length)} ردیف خطا (ذخیره نمی‌شوند):</b>
              <ul className="mt-1 list-disc ps-5">{preview.errors.slice(0, 12).map((e, i) => <li key={i}>ردیف {fa(e.row)}: {e.message}</li>)}</ul>
            </div>
          )}
          {preview.warnings?.length > 0 && (
            <div className="rounded-lg border border-warning bg-warning-soft p-3 text-xs leading-6 text-warning">
              <b>{fa(preview.warnings.length)} هشدار (ذخیره می‌شوند):</b>
              <ul className="mt-1 list-disc ps-5">{preview.warnings.slice(0, 12).map((e, i) => <li key={i}>ردیف {fa(e.row)}: {e.message}</li>)}</ul>
            </div>
          )}
          {preview.rows > 0 && (
            <button type="button" disabled={busy} onClick={() => send(true)} className="rounded-lg bg-success px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 cursor-pointer">
              تأیید و ذخیره‌ی گزارش
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function SalesClient() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysis, setAnalysis] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/summary", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "خطا");
      setData(j); setAnalysis(j.analysis); setError("");
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function runAnalysis() {
    setAnalyzing(true); setAnalysisError("");
    try {
      const res = await fetch("/api/sales/analyze", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "خطا");
      setAnalysis(j.analysis);
    } catch (e) { setAnalysisError(e.message); } finally { setAnalyzing(false); }
  }

  async function removeWeek(week) {
    if (!confirm(`گزارش هفته‌ی ${week} حذف شود؟`)) return;
    const res = await fetch(`/api/sales/report?week=${week}`, { method: "DELETE" });
    if (res.ok) load(); else alert((await res.json()).error || "حذف نشد");
  }

  const s = data?.summary;
  return (
    <div className="space-y-6">
      <PageHeader title="عملکرد فروش تیم بازرگانی" subtitle="گزارش هفتگی تیم (فروش، تناژ، قیمت، کشور مقصد، شرکت‌های طرف قرارداد) اینجا بارگذاری و تحلیل می‌شود. این بخش فقط برای نقش بازرگانی دیده می‌شود و داده‌ها روی دیسک دائمی سرور می‌مانند، نه در گیت." />

      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {data?.storage_problem && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">⚠ {data.storage_problem}</div>}

      <UploadPanel onSaved={() => load()} />

      {s && !s.empty && (
        <>
          {s.alerts.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-bold text-text">هشدارها و نکته‌ها</h2>
              <ul className="space-y-1.5">
                {s.alerts.map((a, i) => (
                  <li key={i} className={`flex gap-2 text-sm leading-7 ${a.level === "warn" ? "text-warning" : "text-text"}`}>
                    <span>{a.level === "warn" ? "⚠" : "ℹ"}</span><span>{a.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={`تناژ هفته‌ی ${s.latest.week}`} value={`${fa(s.latest.tons, 1)} تن`} sub={s.avg4_tons != null ? `میانگین ${fa(s.avg4_weeks)} هفته‌ی قبل ${fa(s.avg4_tons, 1)}` : ""} delta={s.changes?.tons_pct} />
            <Kpi label="فروش دلاری هفته" value={usd(s.latest.revenue_usd)} sub={`${fa(s.latest.deals)} قرارداد`} delta={s.changes?.revenue_pct} />
            <Kpi label="میانگین وزنی قیمت" value={s.latest.avg_price != null ? `$${fa(s.latest.avg_price, 1)}` : "—"} sub={`مرجع ${s.ref_price} FOB`} delta={s.changes?.price_pct} />
            <Kpi label="کشور / مشتری این هفته" value={`${fa(s.latest.countries)} / ${fa(s.latest.buyers)}`} sub={`کل: ${fa(s.totals.tons, 1)} تن در ${fa(s.totals.weeks)} هفته`} />
          </div>

          <section className="card p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text">روند هفتگی (میله: تناژ، خط نارنجی: میانگین قیمت)</h2>
              {s.price.fob_avg_all != null && (
                <span className="text-[11px] text-text-muted">میانگین FOB-محور کل دوره: ${fa(s.price.fob_avg_all, 1)} ({s.price.fob_vs_ref_pct > 0 ? "+" : ""}{fa(s.price.fob_vs_ref_pct, 1)}٪ نسبت به مرجع)</span>
              )}
            </div>
            <WeeklyChart weekly={s.weekly} />
          </section>

          <section className="card border-primary p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text">تحلیل هوشمند عملکرد (مغز پلتفرم)</h2>
              {data.ai_enabled && (
                <button type="button" disabled={analyzing} onClick={runAnalysis} className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer">
                  {analyzing ? "در حال تحلیل…" : analysis ? "تحلیل دوباره" : "تحلیل این هفته"}
                </button>
              )}
            </div>
            {!data.ai_enabled && (
              <p className="text-xs leading-6 text-text-muted">
                تحلیل متنی با هوش مصنوعی خاموش است، چون داده‌ی قراردادها محرمانه است و فقط با تصمیم صریح مدیریت (<code>SALES_AI_ENABLED=true</code>) خلاصه‌ی بدون نام مشتری برای مدل فرستاده می‌شود. همه‌ی نمودارها، جدول‌ها و هشدارهای این صفحه بدون هوش مصنوعی و محلی محاسبه می‌شوند.
              </p>
            )}
            {analysisError && <div className="mt-2 text-sm text-danger">{analysisError}</div>}
            {analysis && (
              <>
                <RichText text={analysis.text} className="mt-2" />
                {analysis.ungrounded_numbers?.length > 0 && (
                  <p className="mt-2 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-xs text-warning">⚠ عددهای بدون پشتوانه‌ی داده: <span dir="ltr">{analysis.ungrounded_numbers.join("، ")}</span></p>
                )}
              </>
            )}
          </section>

          {s.alignment && (
            <section className="card p-4 text-sm leading-7">
              <h2 className="mb-1 text-sm font-bold text-text">هم‌خوانی فروش با اولویت‌های مغز (۸ هفته‌ی اخیر)</h2>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(s.alignment.tier_share_tons).map(([k, v]) => (
                  <span key={k} className="rounded-full border border-border bg-canvas px-3 py-1">{k === "A" || k === "B" || k === "C" ? `ردهٔ ${k}` : k}: {fa(v, 1)}٪ تناژ</span>
                ))}
              </div>
              {s.alignment.tier_a_without_sales.length > 0 && <p className="mt-2 text-text-muted">ردهٔ A بدون فروش: {s.alignment.tier_a_without_sales.map((c) => <Link key={c} href={`/countries/${c}`} className="text-primary hover:underline me-2">{c}</Link>)}</p>}
              {s.alignment.sold_outside_ranking.length > 0 && <p className="text-text-muted">فروش به کشورهای خارج از رتبه‌بندی: {s.alignment.sold_outside_ranking.join("، ")}</p>}
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Table title="به تفکیک کشور مقصد" rows={s.by_country} cols={[
              { label: "کشور", render: (r) => <Link href={`/countries/${r.key}`} className="text-primary-hover hover:underline">{r.key}</Link> },
              { label: "تن", render: (r) => fa(r.tons, 1) },
              { label: "سهم", render: (r) => `${fa(r.share_tons, 1)}٪` },
              { label: "قیمت میانگین", render: (r) => (r.avg_price != null ? `$${fa(r.avg_price, 1)}` : "—") },
              { label: "آخرین فروش", render: (r) => r.last_week },
            ]} />
            <Table title="شرکت‌های طرف قرارداد (۱۵ مشتری برتر)" rows={s.buyers} cols={[
              { label: "شرکت", render: (r) => r.name },
              { label: "کشور", render: (r) => r.country },
              { label: "تن", render: (r) => fa(r.tons, 1) },
              { label: "سهم", render: (r) => `${fa(r.share_tons, 1)}٪` },
              { label: "هفته‌های فعال", render: (r) => fa(r.weeks_active) },
            ]} />
            <Table title="به تفکیک گرید" rows={s.by_grade} cols={[
              { label: "گرید", render: (r) => r.key }, { label: "تن", render: (r) => fa(r.tons, 1) },
              { label: "سهم", render: (r) => `${fa(r.share_tons, 1)}٪` }, { label: "قیمت میانگین", render: (r) => (r.avg_price != null ? `$${fa(r.avg_price, 1)}` : "—") },
            ]} />
            <Table title="به تفکیک اینکوترمز و وضعیت" rows={[...s.by_incoterm.map((r) => ({ ...r, kind: "اینکوترمز" })), ...s.by_status.map((r) => ({ ...r, kind: "وضعیت" }))]} cols={[
              { label: "نوع", render: (r) => r.kind }, { label: "مقدار", render: (r) => r.key },
              { label: "تن", render: (r) => fa(r.tons, 1) }, { label: "قراردادها", render: (r) => fa(r.deals) },
            ]} />
          </div>

          <Table title="هفته‌ها" rows={[...s.weekly].reverse()} cols={[
            { label: "هفته (شروع شنبه)", render: (r) => r.week }, { label: "تن", render: (r) => fa(r.tons, 1) },
            { label: "دلار", render: (r) => usd(r.revenue_usd) }, { label: "میانگین قیمت", render: (r) => (r.avg_price != null ? `$${fa(r.avg_price, 1)}` : "—") },
            { label: "قرارداد", render: (r) => fa(r.deals) }, { label: "کشور", render: (r) => fa(r.countries) },
          ]} />
        </>
      )}

      {s?.empty && <section className="card p-5 text-sm text-text-muted">هنوز گزارشی بارگذاری نشده. قالب اکسل را دانلود کنید، پر کنید و بالا بارگذاری کنید.</section>}

      {data?.reports?.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-bold text-text">گزارش‌های بارگذاری‌شده</h2>
          <ul className="divide-y divide-border text-xs">
            {data.reports.map((r) => (
              <li key={r.week_start} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>هفته‌ی {r.week_start} — {fa(r.rows)} ردیف — {r.filename || "—"} — {r.uploaded_by || "؟"} — {new Date(r.uploaded_at).toLocaleDateString("fa-IR")}{r.replaced_count ? ` (${fa(r.replaced_count)} بار جایگزین شده)` : ""}</span>
                <button type="button" onClick={() => removeWeek(r.week_start)} className="text-danger hover:underline cursor-pointer">حذف</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
