"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";

// صفحه‌ی «یادگیری مغز» — باز‌نویسی کامل: خلاصه، پیش‌بینی کشور تازه، نتیجه‌ی آزمون کشورها با نمودار، یادگیری خودکار، بخش‌های دیگر.
// همه‌ی نمودارها با HTML/SVG ساده‌اند (بدون کتابخانه). متن‌ها کوتاه و بی‌پیرایه.

const faText = (t) => String(t).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const fa = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d }));
const pc = (x, d = 0) => (x === null || x === undefined ? "—" : `${fa(x * 100, d)}٪`);
const dt = (iso) => (iso ? new Date(iso).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }) : "—");
const ROLE = { stat: "تحلیل‌گر آماری", event: "تحلیل‌گر رویدادمحور" };
const STATUS_CLS = { فعال: "text-success", آزمایشی: "text-warning", پیشنهادی: "text-text-muted", بایگانی: "text-text-muted" };

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, ...j };
}
const post = (url, body) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// مقدار با واحد: ٪ / تن / کیلوگرم / احتمال
function showVal(targets, id, v) {
  if (v === null || v === undefined) return "—";
  const u = targets?.find((t) => t.id === id)?.unit || "";
  if (u === "درصد") return `${fa(v, 1)}٪`;
  if (u === "تن") return `${fa(v)} تن`;
  if (u.startsWith("کیلوگرم")) return `${fa(v, 2)} کیلوگرم`;
  return fa(v, 2);
}
const isProb = (targets, id) => targets?.find((t) => t.id === id)?.kind === "probability";

// ---------------------------------------------------------------------------------------------- اجزای کوچک
function Section({ id, title, lead, children }) {
  return (
    <section id={id} className="card p-5 space-y-4 scroll-mt-20">
      <div>
        <h2 className="text-base font-bold text-text">{title}</h2>
        {lead && <p className="mt-1 text-sm leading-7 text-text-muted">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, note, tone }) {
  return (
    <div className="rounded-xl border border-border bg-canvas p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone || "text-text"}`}>{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-text-muted">{note}</div>
    </div>
  );
}

function Table({ head, rows, empty = "داده‌ای نیست." }) {
  if (!rows.length) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-border text-text-muted">{head.map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border last:border-0 align-top">{r.map((c, j) => <td key={j} className="px-2 py-1.5">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// میله‌ی بازه: بازه‌ی پیش‌بینی (lo..hi)، نقطه‌ی پیش‌بینی، حدس ساده و مقدار واقعی روی یک محور
function RangeBar({ lo, hi, point, baseline, truth }) {
  const vals = [lo, hi, point, baseline, truth].filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (!vals.length) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min || Math.abs(max) || 1) * 0.08;
  const a = min - pad, b = max + pad;
  const pos = (v) => `${((v - a) / (b - a)) * 100}%`;
  return (
    <div dir="ltr" className="relative h-6 w-56 sm:w-72">
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      {lo !== undefined && hi !== undefined && <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded bg-primary/25" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} title="بازه‌ی ۸۰٪" />}
      {baseline !== null && baseline !== undefined && <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-text-muted" style={{ left: pos(baseline) }} title="حدس ساده" />}
      {point !== undefined && <div className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded bg-primary" style={{ left: pos(point) }} title="حدس مغز" />}
      {truth !== null && truth !== undefined && <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-success" style={{ left: pos(truth) }} title="واقعی" />}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] text-text-muted">
      <span><span className="inline-block h-3 w-1.5 rounded bg-primary align-middle" /> حدس مغز</span>
      <span><span className="inline-block h-3 w-8 rounded bg-primary/25 align-middle" /> بازه‌ی ۸۰٪</span>
      <span><span className="inline-block h-2.5 w-2.5 rotate-45 bg-text-muted align-middle" /> حدس ساده (میانه‌ی کشورهای دیگر)</span>
      <span><span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white bg-success align-middle shadow" /> مقدار واقعی</span>
    </div>
  );
}

// نمودار میله‌ای دوطرفه از صفر: مثبت سبز، منفی قرمز
function Diverging({ items, fmt, posLabel, negLabel }) {
  if (!items.length) return <p className="text-sm text-text-muted">داده‌ای نیست.</p>;
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 0.0001);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px] text-text-muted"><span>← {negLabel}</span><span>{posLabel} →</span></div>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[8rem_1fr_5rem] items-center gap-2 text-xs">
          <div className="truncate" title={it.label}>{it.label}</div>
          <div dir="ltr" className="relative h-5">
            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
            <div className={`absolute top-0.5 h-4 rounded ${it.value >= 0 ? "bg-success" : "bg-danger"}`} style={{ left: it.value >= 0 ? "50%" : `${50 - (Math.abs(it.value) / max) * 50}%`, width: `${(Math.abs(it.value) / max) * 50}%` }} />
          </div>
          <div className="text-text-muted" dir="ltr">{fmt(it.value)}{it.sub ? ` · ${it.sub}` : ""}</div>
        </div>
      ))}
    </div>
  );
}

function HBar({ items, fmt = fa, color = "bg-primary" }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[11rem_1fr_3rem] items-center gap-2 text-xs">
          <div className="truncate" title={it.label}>{it.label}</div>
          <div dir="ltr" className="h-4 rounded bg-canvas"><div className={`h-4 rounded ${color}`} style={{ width: `${(it.value / max) * 100}%` }} /></div>
          <div className="text-text-muted">{fmt(it.value)}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- صفحه
export default function LearningClient() {
  const [bt, setBt] = useState(null); // /api/brain/backtest
  const [lr, setLr] = useState(null); // /api/brain/learning
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState([]);
  const [newCountry, setNewCountry] = useState("");
  const [chartTarget, setChartTarget] = useState("imports_tons");
  const [res, setRes] = useState({});

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api("/api/brain/backtest", { cache: "no-store" }), api("/api/brain/learning", { cache: "no-store" })]);
    if (!a.ok) { setError(a.error || "خطا در بارگذاری"); return; }
    setError(""); setBt(a); if (b.ok) setLr(b);
  }, []);
  useEffect(() => { load(); }, [load]);

  const running = !!bt?.learning?.status?.running;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [running, load]);

  const S = bt?.summary;
  const T = bt?.targets;
  const note = (m) => setLog((l) => [m, ...l].slice(0, 8));

  async function runOne(country) {
    setBusy(country);
    const r = await post("/api/brain/backtest", { action: "run", country });
    note(r.ok ? `${country}: ${fa(r.scored)} از ${fa(r.total)} هدف سنجیده شد` : `${country}: ${r.error || "ناموفق"}`);
    setBusy("");
    await load();
  }
  async function runAll() {
    for (const c of bt.countries) await runOne(c);
  }
  async function predictNew(e) {
    e.preventDefault();
    const country = newCountry.trim();
    if (!country) return;
    setBusy(`پیش‌بینی ${country}`);
    const r = await post("/api/brain/backtest", { action: "predict_new", country });
    note(r.ok ? `${country}: ${fa(r.rows)} پیش‌بینی ثبت و قفل شد` : `${country}: ${r.error || "ناموفق"}`);
    setBusy(""); setNewCountry("");
    await load();
  }
  async function startLearning() {
    const r = await post("/api/brain/backtest", { action: "learn_start" });
    if (!r.ok) note(r.error || "شروع نشد");
    await load();
  }
  async function runLearningAction(action, extra = {}) {
    setBusy(action);
    const r = await post("/api/brain/learning", { action, ...extra });
    note(r.ok ? "انجام شد" : r.error || "انجام نشد");
    setBusy("");
    await load();
  }

  // ---- مشتق‌ها
  const numericTargets = useMemo(() => (T || []).filter((t) => t.kind === "number"), [T]);
  const forwardByCountry = useMemo(() => {
    const m = new Map();
    for (const r of bt?.forward_rows || []) { if (!m.has(r.country)) m.set(r.country, []); m.get(r.country).push(r); }
    return [...m.entries()];
  }, [bt]);
  const skillItems = useMemo(() => (S?.by_target || []).filter((t) => t.mean_skill !== null).map((t) => ({ label: t.label, value: t.mean_skill, sub: `n=${fa(t.n)}` })).sort((a, b) => b.value - a.value), [S]);
  const errItems = useMemo(() => (S?.rows || [])
    .filter((r) => r.target === chartTarget && r.result?.scored && r.truth > 0 && r.forecast?.point !== undefined)
    .map((r) => ({ label: r.country, value: ((r.forecast.point - r.truth) / r.truth) * 100 }))
    .sort((a, b) => b.value - a.value), [S, chartTarget]);
  const L = bt?.learning;
  const st = L?.status || {};
  const active = L?.methods?.find((m) => m.status === "فعال");
  const causeItems = useMemo(() => {
    const c = new Map();
    for (const a of L?.autopsies || []) if (a.root_cause_fa) c.set(a.root_cause_fa, (c.get(a.root_cause_fa) || 0) + 1);
    return [...c.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [L]);

  const o = S?.overall;
  const verdict = o?.n
    ? [
        o.n < 20 && "نمونه کم است. نتیجه قطعی نیست.",
        o.mean_skill > 0 && o.beats_baseline_pct >= 60 ? "مغز از حدس ساده بهتر است." : "مغز هنوز از حدس ساده بهتر نیست.",
        o.coverage !== null && o.coverage < 0.6 && "بازه‌ها تنگ‌اند: مغز بیش‌ازحد مطمئن است.",
        o.coverage !== null && o.coverage > 0.95 && "بازه‌ها پهن‌اند: مغز بیش‌ازحد محتاط است.",
      ].filter(Boolean)
    : ["هنوز چیزی سنجیده نشده."];

  return (
    <div className="space-y-6">
      <PageHeader title="یادگیری مغز" />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {log.length > 0 && <div className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs leading-6">{log.map((l, i) => <div key={i}>• {l}</div>)}</div>}

      <nav className="flex flex-wrap gap-2 text-xs" aria-label="فهرست بخش‌ها">
        {[["sum", "۱. خلاصه"], ["new", "۲. کشور تازه"], ["res", "۳. نتیجه‌ی آزمون"], ["learn", "۴. یادگیری خودکار"], ["more", "۵. بخش‌های دیگر"], ["gloss", "۶. واژه‌ها"]].map(([id, l]) => <a key={id} href={`#${id}`} className="rounded-full border border-border bg-surface px-3 py-1 hover:bg-canvas">{l}</a>)}
      </nav>

      {!bt && !error && <p className="text-sm text-text-muted">در حال بارگذاری…</p>}

      {bt && S && (
        <>
          {/* ۱) خلاصه */}
          <Section id="sum" title="۱. خلاصه">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat label="کشورهای سنجیده‌شده" value={`${fa(S.by_country.length)} از ${fa(bt.countries.length)}`} note="بقیه هنوز اجرا نشده یا با خطا قطع شده." />
              <Stat label="اهداف سنجیده‌شده" value={fa(o.n)} />
              <Stat label="مهارت میانگین" value={fa(o.mean_skill, 2)} tone={o.mean_skill > 0 ? "text-success" : "text-danger"} />
              <Stat label="بهتر از حدس ساده" value={o.beats_baseline_pct === null ? "—" : `${fa(o.beats_baseline_pct)}٪`} note="سهم موردهایی که مغز از میانه‌ی کشورهای دیگر بهتر بود." />
              <Stat label="پوشش بازه" value={pc(o.coverage)} tone={o.coverage !== null && (o.coverage < 0.6 || o.coverage > 0.95) ? "text-warning" : "text-text"} />
              <Stat label="خطای متوسط" value={pc(o.mean_abs_rel_err)} />
            </div>
            <ul className="space-y-1 text-sm">{verdict.map((v, i) => <li key={i} className="flex gap-2"><span>▸</span><span>{v}</span></li>)}</ul>
          </Section>

          {/* ۲) کشور تازه */}
          <Section id="new" title="۲. پیش‌بینی برای کشور تازه">
            <form onSubmit={predictNew} className="flex flex-wrap items-center gap-2">
              <input value={newCountry} onChange={(e) => setNewCountry(e.target.value)} placeholder="نام کشور، مثلاً قطر" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <button type="submit" disabled={!!busy || !bt.has_key || !newCountry.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 cursor-pointer">{busy.startsWith("پیش‌بینی") ? "در حال ثبت…" : "ثبت پیش‌بینی"}</button>
              {!bt.has_key && <span className="text-xs text-danger">کلید مغز تنظیم نشده.</span>}
            </form>
            {forwardByCountry.length === 0 && <p className="rounded-lg border border-border bg-canvas p-3 text-sm">هنوز پیش‌بینی ثبت نشده.</p>}
            {forwardByCountry.map(([country, rows]) => {
              const done = rows.filter((r) => r.result?.scored).length;
              return (
                <div key={country} className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <h3 className="text-lg font-bold">{country}</h3>
                    <span className="text-xs text-text-muted">ثبت: {dt(rows[0].made_at)}</span>
                    <span className="text-xs text-text-muted">روش: {rows[0].method_version || "پایه"}</span>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-xs">🔒 قفل‌شده</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${done === rows.length ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{done === rows.length ? "همه سنجیده شد" : `${fa(done)} از ${fa(rows.length)} سنجیده شد`}</span>
                  </div>
                  <Legend />
                  <Table
                    head={["هدف", "حدس مغز", "بازه‌ی ۸۰٪", "نمودار", "حدس ساده", "واقعی", "وضعیت"]}
                    rows={rows.map((r) => {
                      const p = isProb(T, r.target);
                      const f = r.forecast;
                      return [
                        <b key="l">{r.label}</b>,
                        f ? (p ? `${fa(f.p * 100)}٪ احتمال بله` : showVal(T, r.target, f.point)) : <span className="text-danger">نامعتبر</span>,
                        f && !p ? `${showVal(T, r.target, f.lo)} تا ${showVal(T, r.target, f.hi)}` : "—",
                        f ? (p ? <RangeBar lo={0} hi={1} point={f.p} baseline={r.baseline} truth={r.truth} /> : <RangeBar lo={f.lo} hi={f.hi} point={f.point} baseline={r.baseline} truth={r.truth} />) : null,
                        r.baseline === null || r.baseline === undefined ? "—" : p ? `${fa(r.baseline * 100)}٪` : showVal(T, r.target, r.baseline),
                        r.truth === null || r.truth === undefined ? <span className="text-text-muted">هنوز نیست</span> : p ? (r.truth ? "بله" : "خیر") : showVal(T, r.target, r.truth),
                        r.result?.scored ? (p ? `خطا (brier): ${fa(r.result.brier, 2)}` : `خطا ${pc(r.result.abs_rel_err)}؛ ${r.result.inside ? "داخل بازه ✓" : "بیرون بازه ✗"}`) : <span className="text-warning">منتظر گزارش کشور</span>,
                      ];
                    })}
                  />
                  {(() => {
                    const cc = (bt.forward_conclusions || []).find((x) => x.country === country);
                    return cc && cc.lines.length > 0 ? (
                      <div className="rounded-lg border border-border bg-canvas p-3">
                        <h4 className="mb-1.5 text-sm font-bold text-text">نتیجه‌گیری</h4>
                        <ul className="space-y-1 text-sm leading-7">{cc.lines.map((l, i) => <li key={i} className="flex gap-2"><span>▸</span><span>{faText(l)}</span></li>)}</ul>
                        {cc.items.length > 0 && (
                          <div className="mt-3">
                            <Diverging items={cc.items.filter((x) => x.bias_pct != null).map((x) => ({ label: x.label, value: Math.max(-200, Math.min(200, x.bias_pct)), sub: x.inside ? "داخل بازه" : "بیرون بازه" }))} fmt={(v) => `${v > 0 ? "+" : ""}${fa(v)}٪`} posLabel="بیش‌برآورد" negLabel="کم‌برآورد" />
                          </div>
                        )}
                      </div>
                    ) : null;
                  })()}
                  {rows.some((r) => r.reason) && (
                    <details className="text-xs">
                      <summary className="cursor-pointer">دلیل مغز برای هر حدس</summary>
                      <ul className="mt-1 space-y-1 text-text-muted">{rows.filter((r) => r.reason).map((r, i) => <li key={i}><b className="text-text">{r.label}:</b> {r.reason}</li>)}</ul>
                    </details>
                  )}
                </div>
              );
            })}
          </Section>

          {/* ۳) نتیجه‌ی آزمون */}
          <Section id="res" title="۳. نتیجه‌ی آزمون روی کشورها">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={!!busy || !bt.has_key} onClick={runAll} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 cursor-pointer">{busy && !busy.startsWith("پیش‌بینی") && busy !== "learn_start" ? `در حال اجرا: ${busy}…` : "اجرای همه‌ی کشورها"}</button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-bold">مهارت هر هدف</h3>
                <Diverging items={skillItems} fmt={(v) => fa(v, 2)} posLabel="بهتر" negLabel="بدتر" />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold">بیش‌برآورد یا کم‌برآورد؟</h3>
                  <select value={chartTarget} onChange={(e) => setChartTarget(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs">
                    {numericTargets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                {errItems.length ? (
                  <div className="space-y-1.5">
                    {(() => {
                      const max = Math.max(...errItems.map((i) => Math.abs(i.value)), 1);
                      return errItems.map((it) => (
                        <div key={it.label} className="grid grid-cols-[7rem_1fr_4rem] items-center gap-2 text-xs">
                          <div className="truncate">{it.label}</div>
                          <div dir="ltr" className="relative h-5"><div className="absolute inset-y-0 left-1/2 w-px bg-border" /><div className={`absolute top-0.5 h-4 rounded ${it.value >= 0 ? "bg-danger" : "bg-primary"}`} style={{ left: it.value >= 0 ? "50%" : `${50 - (Math.abs(it.value) / max) * 50}%`, width: `${(Math.abs(it.value) / max) * 50}%` }} /></div>
                          <div dir="ltr" className="text-text-muted">{it.value > 0 ? "+" : ""}{fa(it.value)}٪</div>
                        </div>
                      ));
                    })()}
                    <div className="flex justify-between text-[11px] text-text-muted"><span>← کم‌برآورد</span><span>بیش‌برآورد →</span></div>
                  </div>
                ) : <p className="text-sm text-text-muted">برای این هدف داده‌ای نیست.</p>}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-bold">جدول هر هدف</h3>
              <Table
                head={["هدف", "تعداد", "مهارت", "بهتر از حدس ساده", "پوشش بازه", "خطای متوسط"]}
                rows={S.by_target.map((t) => [t.label, fa(t.n), <span key="s" className={t.mean_skill > 0 ? "text-success" : t.mean_skill < 0 ? "text-danger" : ""}>{fa(t.mean_skill, 2)}</span>, t.beats_baseline_pct === null ? "—" : `${fa(t.beats_baseline_pct)}٪`, pc(t.coverage), pc(t.mean_abs_rel_err)])}
              />
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-bold">جدول هر کشور</h3>
              <Table
                head={["کشور", "اهداف سنجیده", "مهارت", "خطای متوسط", "اجرا"]}
                rows={bt.countries.map((c) => {
                  const row = S.by_country.find((x) => x.country === c);
                  return [<b key="c">{c}</b>, row ? fa(row.n) : <span className="text-text-muted">اجرا نشده</span>, row ? <span key="s" className={row.mean_skill > 0 ? "text-success" : "text-danger"}>{fa(row.mean_skill, 2)}</span> : "—", row ? pc(row.mean_abs_rel_err) : "—", <button key="b" type="button" disabled={!!busy || !bt.has_key} onClick={() => runOne(c)} className="rounded border border-border px-2 py-0.5 cursor-pointer disabled:opacity-50">{busy === c ? "…" : row ? "اجرای دوباره" : "اجرا"}</button>];
                })}
              />
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer font-bold">همه‌ی ردیف‌ها: حدس، واقعی، خطا ({fa(S.rows.length)})</summary>
              <div className="mt-2">
                <Table
                  head={["کشور", "هدف", "حدس مغز", "حدس ساده", "واقعی", "خطا", "بازه"]}
                  rows={S.rows.filter((r) => r.result?.scored).map((r) => {
                    const p = isProb(T, r.target);
                    return [r.country, r.label, p ? `${fa(r.forecast.p * 100)}٪` : showVal(T, r.target, r.forecast?.point), p ? `${fa(r.baseline * 100)}٪` : showVal(T, r.target, r.baseline), p ? (r.truth ? "بله" : "خیر") : showVal(T, r.target, r.truth), p ? `brier ${fa(r.result.brier, 2)}` : pc(r.result.abs_rel_err), p ? "—" : r.result.inside ? "داخل ✓" : "بیرون ✗"];
                  })}
                />
              </div>
            </details>
          </Section>

          {/* ۴) یادگیری خودکار */}
          <Section id="learn" title="۴. یادگیری خودکار از اشتباه">
            <ol className="grid gap-2 text-xs sm:grid-cols-5">
              {["اجرا روی همه‌ی کشورها", "بررسی خطاها با پنج سؤال", "نوشتن قاعده‌ی کلی", "آزمون روی کشورهای دیده‌نشده", "بهتر شد؟ فعال. نشد؟ بایگانی"].map((t, i) => (
                <li key={i} className="rounded-xl border border-border bg-canvas p-3"><div className="text-lg font-bold text-primary">{fa(i + 1)}</div><div>{t}</div></li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={st.running || !bt.has_key} onClick={startLearning} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 cursor-pointer">{st.running ? "در حال یادگیری…" : "شروع یادگیری خودکار"}</button>
              <span className={`rounded-full px-3 py-1 text-xs ${st.running ? "bg-warning-soft text-warning" : "bg-canvas text-text-muted"}`}>{st.running ? "در حال اجرا" : "بیکار"}</span>
              {active && <span className="text-xs">روش فعال: <b dir="ltr">{active.version}</b> ({fa(active.rules.length)} قاعده)</span>}
            </div>
            {st.error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">{st.error}</div>}
            {st.summary && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="دورهای انجام‌شده" value={fa(st.summary.iterations?.length)} />
                <Stat label="نسخه‌ی فعال‌شده" value={fa(st.summary.promoted)} />
                <Stat label="خطا، پیش از یادگیری" value={pc(st.summary.initial?.mean_abs_rel_err)} />
                <Stat label="خطا، بعد از یادگیری" value={pc(st.summary.final?.mean_abs_rel_err)} />
              </div>
            )}
            {st.log?.some((l) => l.includes("مهلت") || l.includes("✗")) && (
              <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-xs leading-6 text-warning">
                چند اجرا به‌علت دیر جواب‌دادن Gemini قطع شد.
              </div>
            )}
            {st.log?.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-sm font-bold">گزارش پیشرفت</h3>
                <ul className="max-h-72 overflow-auto rounded-lg border border-border p-2 text-xs leading-6">
                  {[...st.log].reverse().map((l, i) => <li key={i} className={l.includes("✗") ? "text-danger" : l.includes("✓") ? "text-success" : "text-text-muted"}>{l}</li>)}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-bold">نسخه‌های روش</h3>
              <Table
                head={["نسخه", "وضعیت", "قاعده‌ها", "مقایسه روی کشورهای دیده‌نشده", "دلیل"]}
                rows={(L.methods || []).map((m) => [
                  <b key="v" dir="ltr">{m.version}</b>,
                  <span key="s" className={STATUS_CLS[m.status] || ""}>{m.status}</span>,
                  m.rules.length ? <ol key="r" className="list-decimal ps-4 space-y-1">{m.rules.map((r, i) => <li key={i}>{r}</li>)}</ol> : <span className="text-text-muted">بدون قاعده‌ی اضافه</span>,
                  m.validation?.pairs > 0 ? `خطا ${pc(m.validation.err_current)} ← ${pc(m.validation.err_candidate)}؛ بهتر ${fa(m.validation.better)}، بدتر ${fa(m.validation.worse)}` : "—",
                  m.reason || "—",
                ])}
                empty="هنوز نسخه‌ای نیست."
              />
              {L.scores?.length > 1 && (
                <div className="pt-2">
                  <p className="mb-1 text-xs text-text-muted">خطای متوسط هر نسخه (کمتر بهتر):</p>
                  <HBar items={L.scores.filter((x) => x.mean_abs_rel_err !== null).map((x) => ({ label: `${x.version} (${x.status})`, value: x.mean_abs_rel_err * 100 }))} fmt={(v) => `${fa(v)}٪`} />
                </div>
              )}
            </div>

            {causeItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold">علت اشتباه‌ها (از بررسی پنج‌سؤالی)</h3>
                <HBar items={causeItems} color="bg-warning" />
              </div>
            )}

            {L.autopsies?.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-bold">بررسی هر اشتباه ({fa(L.autopsies.length)})</summary>
                <ul className="mt-2 space-y-3">
                  {L.autopsies.map((a, i) => (
                    <li key={i} className="rounded-lg border border-border p-3 text-xs leading-6">
                      <div className="flex flex-wrap gap-2"><b>{a.country} / {a.target_label || a.target}</b><span className="rounded-full bg-canvas px-2 py-0.5">{a.root_cause_fa || "علت نامعلوم"}</span></div>
                      <Table head={["سؤال", "پاسخ مغز"]} rows={[["اطلاعات اولیه؟", a.answers?.info], ["قاعده؟", a.answers?.rule], ["روش؟", a.answers?.method], ["عامل ویژه‌ی کشور؟", a.answers?.country_factor], ["بازه؟", a.answers?.calibration]]} />
                      {a.fix && <div className="mt-1">قاعده‌ی پیشنهادی: <b>{a.fix}</b></div>}
                      {a.rejected && <div className="mt-1 text-warning">قاعده رد شد: {a.rejected}</div>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Section>

          {/* ۵) بخش‌های دیگر */}
          <Section id="more" title="۵. بخش‌های دیگر">
            {lr && (
              <>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold">پیش‌بینی قیمت: روش هر تحلیل‌گر</h3>
                  <Table
                    head={["تحلیل‌گر", "شرط بازبینی", "نسخه‌ها", ""]}
                    rows={lr.methods.map((m) => [
                      <b key="r">{ROLE[m.role]}</b>,
                      m.state.needs ? "برقرار" : m.state.blocked_reason,
                      m.versions.map((v) => `${v.version}: ${v.status}`).join("، "),
                      <button key="b" type="button" disabled={!!busy || !m.state.needs} onClick={() => runLearningAction("propose_revision", { role: m.role })} className="rounded border border-border px-2 py-0.5 cursor-pointer disabled:opacity-50">پیشنهاد نسخه‌ی تازه</button>,
                    ])}
                  />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold">آزمایش فعال</h3>
                  {lr.config?.experiments?.enabled !== true
                    ? <p className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-xs leading-6 text-warning">⛔ متوقف است. هیچ ایمیلی با قیمت یا متن آزمایشی نمی‌رود.</p>
                    : <p className="text-xs text-text-muted">روشن است.</p>}
                  {lr.experiments.experiments.map((e) => (
                    <div key={e.key} className="rounded-lg border border-border p-3 text-xs">
                      <b>{e.title}</b> — <span className={STATUS_CLS[e.status] || ""}>{e.status}</span>
                      {e.verdict && <div>{e.verdict}</div>}
                      {e.status === "فعال" && (
                        <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(ev) => { ev.preventDefault(); const r = res[e.key] || {}; runLearningAction("experiment_result", { key: e.key, sent: Number(r.sent), replied: Number(r.replied) }); }}>
                          <input dir="ltr" inputMode="numeric" placeholder="ارسال" className="w-20 rounded border border-border px-2 py-0.5" value={res[e.key]?.sent || ""} onChange={(ev) => setRes({ ...res, [e.key]: { ...res[e.key], sent: ev.target.value } })} />
                          <input dir="ltr" inputMode="numeric" placeholder="پاسخ" className="w-20 rounded border border-border px-2 py-0.5" value={res[e.key]?.replied || ""} onChange={(ev) => setRes({ ...res, [e.key]: { ...res[e.key], replied: ev.target.value } })} />
                          <button type="submit" disabled={!!busy} className="rounded border border-border px-2 py-0.5 cursor-pointer disabled:opacity-50">ثبت نتیجه</button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <button type="button" disabled={!!busy} onClick={() => runLearningAction("run_cycle")} className="rounded border border-border px-3 py-1 cursor-pointer disabled:opacity-50">اجرای چرخه‌ی ماهانه</button>
                  <span className="text-text-muted">آخرین چرخه: {lr.state?.last_monthly || "—"}</span>
                  <Link href="/brain/memory" className="underline">صف بازبینی ({fa(lr.open_items.length)} مورد باز)</Link>
                </div>
              </>
            )}
          </Section>

          {/* ۶) واژه‌ها */}
          <Section id="gloss" title="۶. واژه‌ها">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ["حدس ساده (خط مبنا)", "میانه‌ی مقدار همان هدف در کشورهای دیگر. اگر مغز از آن بهتر نباشد، چیزی یاد نگرفته."],
                ["مهارت", "۱ منهای (خطای مغز ÷ خطای حدس ساده). صفر = برابر. منفی = بدتر."],
                ["بازه‌ی ۸۰٪", "مغز می‌گوید ۸۰٪ مطمئن است جواب واقعی داخل این بازه است. باید حدود ۸۰٪ مواقع درست باشد."],
                ["پوشش بازه", "چند درصد مواقع جواب واقعی واقعاً داخل بازه بود."],
                ["خطای نسبی", "فاصله‌ی حدس تا واقعی، تقسیم بر واقعی."],
                ["پیش‌ثبت (قفل)", "حدس قبل از دیدن جواب ثبت می‌شود. بعد دیگر عوض نمی‌شود."],
                ["کشور دیده‌نشده", "کشوری که قاعده‌ی تازه از خطای آن نیامده. آزمون واقعی روی همین‌هاست."],
                ["بیرون از دامنه", "مقدار واقعی از همه‌ی کشورهای مقایسه‌ای بزرگ‌تر یا کوچک‌تر بود. حدس سخت است."],
              ].map(([t, d]) => <div key={t} className="rounded-lg border border-border p-3"><dt className="font-bold">{t}</dt><dd className="mt-1 text-text-muted leading-7">{d}</dd></div>)}
            </dl>
          </Section>
        </>
      )}
    </div>
  );
}
