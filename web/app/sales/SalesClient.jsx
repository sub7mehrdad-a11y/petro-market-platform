"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import RichText from "../components/RichText";

const fa = (n, d = 0) => (n == null ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d }));
const usd = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const price = (n) => (n == null ? "—" : `$${fa(n, 1)}`);

function Delta({ pct }) {
  if (pct == null) return null;
  const up = pct > 0;
  return (
    <span className={`text-[11px] font-semibold ${pct === 0 ? "text-text-muted" : up ? "text-success" : "text-danger"}`} dir="ltr">
      {up ? "▲" : pct < 0 ? "▼" : "•"} {Math.abs(pct)}٪
    </span>
  );
}

function Kpi({ label, value, sub, delta, tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone || "text-text"}`}>{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
        {sub}
        <Delta pct={delta} />
      </div>
    </div>
  );
}

// نمودار میله‌ای تناژ هفتگی سفارش‌های قطعی + خط میانگین قیمت (SVG بدون وابستگی)
function WeeklyChart({ weekly }) {
  const data = weekly.slice(-26);
  const W = 700, H = 200, padL = 8, padB = 30, padT = 14;
  const maxT = Math.max(...data.map((w) => w.tons), 1);
  const prices = data.map((w) => w.avg_price).filter((p) => p != null);
  const minP = prices.length ? Math.min(...prices) * 0.95 : 0;
  const maxP = prices.length ? Math.max(...prices) * 1.05 : 1;
  const bw = (W - padL * 2) / data.length;
  const y = (t) => padT + (H - padT - padB) * (1 - t / maxT);
  const py = (p) => padT + (H - padT - padB) * (1 - (p - minP) / (maxP - minP || 1));
  const pts = data.map((w, i) => (w.avg_price == null ? null : [padL + bw * i + bw / 2, py(w.avg_price)])).filter(Boolean);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="روند هفتگی تناژ سفارش‌های قطعی و میانگین قیمت" direction="ltr">
      {data.map((w, i) => (
        <g key={w.week}>
          <rect x={padL + bw * i + bw * 0.12} y={y(w.tons)} width={bw * 0.76} height={Math.max(0, H - padB - y(w.tons))} rx="2" fill="var(--color-primary, #1f6feb)" opacity={w.in_progress ? 0.4 : 0.85} />
          {w.tons > 0 && bw > 16 && <text x={padL + bw * i + bw / 2} y={y(w.tons) - 3} textAnchor="middle" fontSize="8.5" fill="currentColor">{Math.round(w.tons)}</text>}
          {i % Math.ceil(data.length / 13) === 0 && <text x={padL + bw * i + bw / 2} y={H - 12} textAnchor="middle" fontSize="8.5" fill="currentColor" opacity="0.6">{w.week.slice(5)}</text>}
        </g>
      ))}
      {pts.length > 1 && <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#d97706" strokeWidth="1.8" />}
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#d97706" />)}
    </svg>
  );
}

function Table({ title, rows, cols, note }) {
  if (!rows?.length) return null;
  return (
    <section className="card p-4">
      <h3 className="mb-2 text-sm font-bold text-text">{title}</h3>
      {note && <p className="mb-2 text-[11px] leading-5 text-text-muted">{note}</p>}
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

function Issues({ title, items, tone }) {
  if (!items?.length) return null;
  const cls = tone === "danger" ? "border-danger bg-danger-soft text-danger" : "border-warning bg-warning-soft text-warning";
  return (
    <div className={`rounded-lg border p-3 text-xs leading-6 ${cls}`}>
      <b>{fa(items.length)} {title}</b>
      <ul className="mt-1 list-disc ps-5">{items.slice(0, 12).map((e, i) => <li key={i}>{e.row ? `ردیف ${fa(e.row)}: ` : ""}{e.message}</li>)}</ul>
      {items.length > 12 && <div className="mt-1">… و {fa(items.length - 12)} مورد دیگر</div>}
    </div>
  );
}

function UploadPanel({ onSaved }) {
  const fileRef = useRef(null);
  const [asOf, setAsOf] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  async function send(save) {
    const f = fileRef.current?.files?.[0];
    if (!f) { setError("اول فایل اکسل را انتخاب کنید."); return; }
    setBusy(true); setError("");
    const fd = new FormData();
    fd.set("file", f);
    if (asOf.trim()) fd.set("as_of", asOf.trim());
    if (save) fd.set("save", "1");
    try {
      const res = await fetch("/api/sales/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "خطا"); setPreview(data.errors ? { errors: data.errors, warnings: data.warnings || [] } : null); }
      else if (data.saved) { setPreview(null); fileRef.current.value = ""; setAsOf(""); onSaved(); }
      else setPreview(data.preview);
    } catch (e) {
      setError(`ارتباط با سرور برقرار نشد: ${e.message}`);
    } finally { setBusy(false); }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-bold text-text">بارگذاری گزارش فروش (Sales Report)</h2>
      <p className="mb-3 text-xs leading-6 text-text-muted">
        همان فایل اکسل تجمعی تیم (از اول سال، سرستون‌ها در ردیف ۳) را هر هفته بارگذاری کنید؛ هر بارگذاری یک «عکس لحظه‌ای» است و آخرین عکس مبنای تحلیل می‌شود، عکس‌های قبلی برای مقایسه می‌مانند. اول پیش‌نمایش می‌گیرید و بعد تأیید می‌کنید.{" "}
        <a href="/api/sales/template" className="font-semibold text-primary hover:underline">دانلود فایل خالی با همین ساختار ↓</a>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs text-text-muted">
          فایل (.xlsx)
          <input ref={fileRef} type="file" accept=".xlsx" onChange={() => setPreview(null)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-text-muted sm:w-52">
          تاریخ گزارش (پیش‌فرض: امروز)
          <input value={asOf} onChange={(e) => setAsOf(e.target.value)} placeholder="۱۴۰۵/۰۸/۱۳" dir="ltr" className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
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
              گزارش <b>{preview.as_of}</b>: <b>{fa(preview.rows)}</b> ردیف دارای حجم — سفارش قطعی (PI issued): <b>{fa(preview.firm.deals)}</b> ردیف / <b>{fa(preview.firm.tons, 1)}</b> تن؛
              پیشنهاد (Just quoted): <b>{fa(preview.quote.deals)}</b> / {fa(preview.quote.tons, 1)} تن؛ وضعیت نامشخص: {fa(preview.unknown.deals)}.
              {preview.skipped_empty > 0 && <span className="text-text-muted"> ({fa(preview.skipped_empty)} ردیف خالی/بدون حجم نادیده گرفته شد.)</span>}
              {preview.will_replace && <span className="text-warning"> ⚠ جایگزین گزارش قبلی همین تاریخ ({fa(preview.will_replace.rows)} ردیف) می‌شود.</span>}
              {preview.previous_snapshot && <span className="text-text-muted"> با گزارش {preview.previous_snapshot.as_of} مقایسه می‌شود.</span>}
            </div>
          )}
          <Issues title="ردیف خطا (ذخیره نمی‌شوند)" items={preview.errors} tone="danger" />
          <Issues title="هشدار (ذخیره می‌شوند)" items={preview.warnings} />
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

  async function removeSnapshot(asOf) {
    if (!confirm(`گزارش ${asOf} حذف شود؟`)) return;
    const res = await fetch(`/api/sales/report?as_of=${asOf}`, { method: "DELETE" });
    if (res.ok) load(); else alert((await res.json()).error || "حذف نشد");
  }

  const s = data?.summary;
  const w30 = s?.window30;
  return (
    <div className="space-y-6">
      <PageHeader title="عملکرد فروش تیم بازرگانی" subtitle="فایل «Sales Report» تیم (سفارش‌ها، تناژ، قیمت، کشور مقصد، شرکت‌های طرف قرارداد، پرداخت) اینجا بارگذاری و تحلیل می‌شود. این بخش فقط برای نقش بازرگانی دیده می‌شود و داده‌ها روی دیسک دائمی سرور می‌مانند، نه در گیت." />

      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {data?.storage_problem && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">⚠ {data.storage_problem}</div>}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
        <span className="text-text-muted">حسابداری فروش:</span>
        <Link href="/sales/accounts" className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover">حساب‌ها و پرداخت‌ها (قرارداد · مشتری · مانده) ←</Link>
      </div>

      <UploadPanel onSaved={load} />

      {s && !s.empty && (
        <>
          <p className="text-xs text-text-muted">
            گزارش به تاریخ <b>{s.as_of}</b> — «سفارش قطعی» = PI صادرشده؛ «پیشنهاد» (Just quoted) در فروش نمی‌آید و جداگانه به‌عنوان پایپ‌لاین دیده می‌شود. میانگین قیمت‌ها وزنی بر حسب تناژ و فقط ردیف‌های دلاری‌اند.
          </p>

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

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="سفارش قطعی از ابتدای سال" value={`${fa(s.firm_totals.tons)} تن`} sub={`${fa(s.firm_totals.deals)} سفارش · ${usd(s.firm_totals.revenue_usd)}`} />
            <Kpi label="۳۰ روز اخیر" value={`${fa(w30.last.tons)} تن`} sub={`قبلش ${fa(w30.prev.tons)} تن`} delta={w30.tons_pct} />
            <Kpi label="میانگین وزنی قیمت" value={price(s.firm_totals.avg_price)} sub={s.price.fob_avg != null ? `FOB/FCA ${price(s.price.fob_avg)} (${s.price.fob_vs_ref_pct > 0 ? "+" : ""}${fa(s.price.fob_vs_ref_pct, 1)}٪ از مرجع ${s.ref_price})` : `مرجع ${s.ref_price} FOB`} />
            <Kpi label="پایپ‌لاین (Just quoted)" value={`${fa(s.pipeline.tons)} تن`} sub={`${fa(s.pipeline.deals)} پیشنهاد · ${fa(s.pipeline.stale_over_45d.deals)} مانده بیش از ۴۵ روز`} />
            <Kpi label="منتظر پرداخت (Yet to pay)" value={`${fa(s.receivables.unpaid_tons)} تن`} sub={`${fa(s.receivables.unpaid_deals)} سفارش · ${usd(s.receivables.unpaid_usd)}`} tone={s.receivables.unpaid_deals ? "text-warning" : undefined} />
          </div>

          <section className="card p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text">روند هفتگی سفارش‌های قطعی (میله: تناژ، خط نارنجی: میانگین قیمت)</h2>
              <span className="text-[11px] text-text-muted">هفته‌ی روشن‌تر = هفته‌ی جاری (ناتمام)</span>
            </div>
            <WeeklyChart weekly={s.weekly} />
          </section>

          <section className="card border-primary p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text">تحلیل هوشمند عملکرد (مغز پلتفرم)</h2>
              {data.ai_enabled && (
                <button type="button" disabled={analyzing} onClick={runAnalysis} className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer">
                  {analyzing ? "در حال تحلیل…" : analysis ? "تحلیل دوباره" : "تحلیل این گزارش"}
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

          {s.since_last && (
            <section className="card p-4 text-sm leading-7">
              <h2 className="mb-1 text-sm font-bold text-text">تغییر نسبت به گزارش قبلی ({s.since_last.prev_as_of})</h2>
              <p className="text-text">
                سفارش قطعی جدید: <b>{fa(s.since_last.new_firm.deals)}</b> سفارش / {fa(s.since_last.new_firm.tons, 1)} تن؛ پرداخت تازه‌دریافت‌شده: <b>{fa(s.since_last.newly_paid.deals)}</b> سفارش / {fa(s.since_last.newly_paid.tons, 1)} تن.
              </p>
            </section>
          )}

          {s.alignment && (
            <section className="card p-4 text-sm leading-7">
              <h2 className="mb-1 text-sm font-bold text-text">هم‌خوانی سفارش‌ها با اولویت‌های مغز ({fa(s.alignment.window_days)} روز اخیر)</h2>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(s.alignment.tier_share_tons).map(([k, v]) => (
                  <span key={k} className="rounded-full border border-border bg-canvas px-3 py-1">{k === "A" || k === "B" || k === "C" ? `ردهٔ ${k}` : k}: {fa(v, 1)}٪ تناژ</span>
                ))}
              </div>
              {s.alignment.tier_a_without_sales.length > 0 && <p className="mt-2 text-text-muted">ردهٔ A بدون سفارش: {s.alignment.tier_a_without_sales.map((c) => <Link key={c} href={`/countries/${c}`} className="text-primary hover:underline me-2">{c}</Link>)}</p>}
              {s.alignment.sold_outside_ranking.length > 0 && <p className="text-text-muted">سفارش به کشورهای خارج از رتبه‌بندی مغز: {s.alignment.sold_outside_ranking.join("، ")}</p>}
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Table title="به تفکیک کشور مقصد (سفارش قطعی)" rows={s.by_country} cols={[
              { label: "کشور", render: (r) => <Link href={`/countries/${r.key}`} className="text-primary-hover hover:underline">{r.key}</Link> },
              { label: "تن", render: (r) => fa(r.tons, 1) },
              { label: "سهم", render: (r) => `${fa(r.share_tons, 1)}٪` },
              { label: "قیمت میانگین", render: (r) => price(r.avg_price) },
              { label: "آخرین سفارش", render: (r) => r.last_date || "—" },
            ]} />
            <Table title="شرکت‌های طرف قرارداد (۱۵ مشتری برتر)" rows={s.buyers} note={`تمرکز: مشتری اول ${fa(s.concentration.top1_share, 1)}٪، سه مشتری برتر ${fa(s.concentration.top3_share, 1)}٪ (${fa(s.concentration.buyer_count)} مشتری)`} cols={[
              { label: "شرکت", render: (r) => r.name },
              { label: "کشور", render: (r) => r.country },
              { label: "تن", render: (r) => fa(r.tons, 1) },
              { label: "سهم", render: (r) => `${fa(r.share_tons, 1)}٪` },
              { label: "سفارش", render: (r) => fa(r.deals) },
            ]} />
            <Table title="سن بدهی پرداخت‌نشده (از تاریخ PI)" rows={s.receivables.aging} note={`پرداخت‌شده ${fa(s.receivables.paid_tons)} تن · پیش‌پرداخت‌گرفته ${fa(s.receivables.partial_tons)} تن · وضعیت نامشخص ${fa(s.receivables.unknown_tons)} تن`} cols={[
              { label: "بازه", render: (r) => r.label }, { label: "سفارش", render: (r) => fa(r.deals) },
              { label: "تن", render: (r) => fa(r.tons, 1) }, { label: "دلار", render: (r) => usd(r.revenue_usd) },
            ]} />
            <Table title="پایپ‌لاین: پیشنهادهای باز به تفکیک کشور" rows={s.pipeline.by_country} cols={[
              { label: "کشور", render: (r) => r.key }, { label: "تن", render: (r) => fa(r.tons, 1) },
              { label: "پیشنهاد", render: (r) => fa(r.deals) }, { label: "قیمت پیشنهادی", render: (r) => price(r.avg_price) },
            ]} />
            <Table title="به تفکیک گرید" rows={s.by_grade} cols={[
              { label: "گرید", render: (r) => r.key }, { label: "تن", render: (r) => fa(r.tons, 1) },
              { label: "سهم", render: (r) => `${fa(r.share_tons, 1)}٪` }, { label: "قیمت میانگین", render: (r) => price(r.avg_price) },
            ]} />
            <Table title="شرایط تحویل و کارخانه (سفارش قطعی)" note={`تولیدشده ${fa(s.production.produced_tons)} از ${fa(s.production.firm_tons)} تن · بارگیری‌شده ${fa(s.production.loaded_tons)} تن`} rows={[...s.by_incoterm.map((r) => ({ ...r, kind: "تحویل" })), ...s.by_plant.map((r) => ({ ...r, kind: "کارخانه" }))]} cols={[
              { label: "نوع", render: (r) => r.kind }, { label: "مقدار", render: (r) => r.key },
              { label: "تن", render: (r) => fa(r.tons, 1) }, { label: "قیمت میانگین", render: (r) => price(r.avg_price) },
            ]} />
          </div>
        </>
      )}

      {s?.empty && <section className="card p-5 text-sm text-text-muted">هنوز گزارشی بارگذاری نشده. فایل «Sales Report» تیم را بالا بارگذاری کنید.</section>}

      {data?.snapshots?.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-bold text-text">گزارش‌های بارگذاری‌شده</h2>
          <ul className="divide-y divide-border text-xs">
            {data.snapshots.map((r) => (
              <li key={r.as_of} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>گزارش {r.as_of} — {fa(r.rows)} ردیف — {r.filename || "—"} — {r.uploaded_by || "؟"} — {new Date(r.uploaded_at).toLocaleDateString("fa-IR")}{r.replaced_count ? ` (${fa(r.replaced_count)} بار جایگزین شده)` : ""}</span>
                <button type="button" onClick={() => removeSnapshot(r.as_of)} className="text-danger hover:underline cursor-pointer">حذف</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
