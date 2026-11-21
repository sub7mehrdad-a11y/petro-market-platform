"use client";

import Link from "next/link";

// اجزای مشترک پنل بازرگانی (قالب عددها، کارت شاخص، نمودارهای SVG بدون وابستگی، نوار ناوبری بخش‌ها).

export const fa = (n, d = 0) => (n == null ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d }));
export const usd = (n) => (n == null ? "—" : `${n < 0 ? "-" : ""}$${Math.abs(Number(n)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
export const price = (n) => (n == null ? "—" : `$${fa(n, 1)}`);
/** ارقام لاتین داخل یک متن ← فارسی (اعشار «.» بین ارقام ← «٫»)؛ برای متن‌های ساخته‌شده در سرور */
export const faDigits = (t) => String(t ?? "").replace(/(?<=\d)\.(?=\d)/g, "٫").replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
export const fdate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("fa-IR", { timeZone: "UTC" }) : "—");

export function Delta({ pct }) {
  if (pct == null) return null;
  const up = pct > 0;
  return (
    <span className={`text-[11px] font-semibold ${pct === 0 ? "text-text-muted" : up ? "text-success" : "text-danger"}`} dir="ltr">
      {up ? "▲" : pct < 0 ? "▼" : "•"} {fa(Math.abs(pct))}٪
    </span>
  );
}

export function Kpi({ label, value, sub, delta, tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone || "text-text"}`}>{value}</div>
      {(sub || delta != null) && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          {sub}
          <Delta pct={delta} />
        </div>
      )}
    </div>
  );
}

// نمودار میله‌ای تناژ هفتگی سفارش‌های قطعی + خط میانگین قیمت
export function WeeklyChart({ weekly }) {
  const data = weekly.slice(-26);
  return <BarLineChart items={data.map((w) => ({ key: w.week, label: w.week.slice(5), tons: w.tons, price: w.avg_price, faded: w.in_progress }))} aria="روند هفتگی تناژ سفارش‌های قطعی و میانگین قیمت" />;
}

// نمودار میله‌ای ماهانه (تناژ) + خط قیمت
export function MonthlyChart({ months }) {
  return <BarLineChart items={months.map((m) => ({ key: m.month, label: m.month.slice(2), tons: m.tons, price: m.avg_price }))} aria="روند ماهانه‌ی تناژ صادرات و میانگین قیمت" />;
}

function BarLineChart({ items, aria }) {
  const W = 700, H = 200, padL = 8, padB = 30, padT = 14;
  if (!items.length) return null;
  const maxT = Math.max(...items.map((w) => w.tons), 1);
  const prices = items.map((w) => w.price).filter((p) => p != null);
  const minP = prices.length ? Math.min(...prices) * 0.95 : 0;
  const maxP = prices.length ? Math.max(...prices) * 1.05 : 1;
  const bw = (W - padL * 2) / items.length;
  const y = (t) => padT + (H - padT - padB) * (1 - t / maxT);
  const py = (p) => padT + (H - padT - padB) * (1 - (p - minP) / (maxP - minP || 1));
  const pts = items.map((w, i) => (w.price == null ? null : [padL + bw * i + bw / 2, py(w.price)])).filter(Boolean);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={aria} direction="ltr">
      {items.map((w, i) => (
        <g key={w.key}>
          <rect x={padL + bw * i + bw * 0.12} y={y(w.tons)} width={bw * 0.76} height={Math.max(0, H - padB - y(w.tons))} rx="2" fill="var(--color-primary, #1f6feb)" opacity={w.faded ? 0.4 : 0.85} />
          {w.tons > 0 && bw > 16 && <text x={padL + bw * i + bw / 2} y={y(w.tons) - 3} textAnchor="middle" fontSize="8.5" fill="currentColor">{Math.round(w.tons)}</text>}
          {i % Math.ceil(items.length / 13) === 0 && <text x={padL + bw * i + bw / 2} y={H - 12} textAnchor="middle" fontSize="8.5" fill="currentColor" opacity="0.6">{w.label}</text>}
        </g>
      ))}
      {pts.length > 1 && <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#d97706" strokeWidth="1.8" />}
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#d97706" />)}
    </svg>
  );
}

/** میله‌های افقی: items = [{label, value, tone?: "us"|"muted"|"warn", note?}] */
export function HBars({ items, unit = "", max, fmt = (v) => fa(v, 0) }) {
  const m = max || Math.max(...items.map((i) => i.value || 0), 1);
  const color = { us: "bg-primary", muted: "bg-text-muted/40", warn: "bg-warning", ref: "bg-success" };
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="grid grid-cols-[8.5rem_1fr_6rem] items-center gap-2 text-xs sm:grid-cols-[11rem_1fr_7rem]">
          <div className={`truncate ${it.tone === "us" ? "font-bold text-text" : "text-text-muted"}`} title={it.label}>{it.label}</div>
          <div dir="ltr" className="h-4 rounded bg-canvas"><div className={`h-4 rounded ${color[it.tone] || color.muted}`} style={{ width: `${Math.min(100, ((it.value || 0) / m) * 100)}%` }} /></div>
          <div className="text-text" dir="ltr" style={{ textAlign: "start" }}>{fmt(it.value)}{unit}{it.note ? <span className="ms-1 text-[10px] text-text-muted">{it.note}</span> : null}</div>
        </div>
      ))}
    </div>
  );
}

// نوار بخش‌های پنل بازرگانی (در همه‌ی صفحه‌های داخلی)
const TABS = [
  { href: "/sales/contracts", label: "قراردادها و حسابداری" },
  { href: "/sales/loading", label: "بارگیری و ارسال" },
  { href: "/sales/customers", label: "مشتریان" },
  { href: "/sales/reports", label: "گزارش‌ها" },
];
export function SalesNav({ active }) {
  return (
    <nav className="mb-5 flex flex-wrap items-center gap-2 text-xs" aria-label="بخش‌های پنل بازرگانی">
      <Link href="/sales" className="rounded-lg border border-border bg-surface px-3 py-1.5 text-text-muted hover:text-text">← پلتفرم جامع بازرگانی</Link>
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`rounded-lg px-3 py-1.5 font-medium ${active === t.href ? "bg-primary text-white" : "border border-border bg-surface text-text hover:bg-canvas"}`}>{t.label}</Link>
      ))}
    </nav>
  );
}

const STACK_COLOR = { us: "#1f6feb", iran: "#7fb2f0", rival: "#d97706", other: "#b9c0cc" };
/** نوار انباشته‌ی ترکیب بازار: parts = [{label, tons, pct, tone}] */
export function StackedBar({ parts }) {
  if (!parts?.length) return null;
  return (
    <div>
      <div dir="ltr" className="flex h-8 overflow-hidden rounded-lg border border-border">
        {parts.map((p, i) => (
          <div key={i} title={`${p.label}: ${fa(p.tons)} تن (${fa(p.pct, 1)}٪)`} style={{ width: `${Math.max(p.pct, 0.8)}%`, background: p.tone === "rival" ? ["#d97706", "#e6a23c", "#c2410c", "#f0b429"][i % 4] : STACK_COLOR[p.tone] }} className="h-full" />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p, i) => (
          <li key={i} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.tone === "rival" ? ["#d97706", "#e6a23c", "#c2410c", "#f0b429"][i % 4] : STACK_COLOR[p.tone] }} /><span className={p.tone === "us" ? "font-bold text-text" : "text-text-muted"}>{p.label}</span><span className="text-text">{fa(p.tons)} تن · {fa(p.pct, 1)}٪</span></li>
        ))}
      </ul>
    </div>
  );
}

/** روند قیمت ما (ماهانه) با خط‌های مرجع افقی: refs = [{label, value, tone}] */
export function PriceTrendChart({ months, refs }) {
  const pts = (months || []).filter((m) => m.avg_price != null);
  if (!pts.length) return null;
  const W = 700, H = 230, padL = 38, padR = 8, padT = 12, padB = 28;
  const vals = [...pts.map((m) => m.avg_price), ...refs.map((r) => r.value)];
  const lo = Math.min(...vals) * 0.92, hi = Math.max(...vals) * 1.05;
  const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo || 1));
  const x = (i) => padL + ((W - padL - padR) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)));
  const col = { muted: "#94a3b8", ref: "#16a34a", us: "#1f6feb" };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" direction="ltr" role="img" aria-label="روند ماهانه‌ی قیمت ما در برابر مرجع‌های رقبا">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => { const v = lo + (hi - lo) * t; return <g key={t}><line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="currentColor" opacity="0.08" /><text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.6">{Math.round(v)}</text></g>; })}
      {refs.map((r) => (
        <g key={r.label}>
          <line x1={padL} x2={W - padR} y1={y(r.value)} y2={y(r.value)} stroke={col[r.tone] || col.muted} strokeWidth="1.1" strokeDasharray="5 4" opacity="0.8" />
          <text x={W - padR} y={y(r.value) - 3} textAnchor="end" fontSize="8.5" fill={col[r.tone] || col.muted}>{r.label} {Math.round(r.value)}</text>
        </g>
      ))}
      <polyline points={pts.map((m, i) => `${x(i)},${y(m.avg_price)}`).join(" ")} fill="none" stroke={col.us} strokeWidth="2.2" />
      {pts.map((m, i) => <g key={m.month}><circle cx={x(i)} cy={y(m.avg_price)} r="3" fill={col.us} /><text x={x(i)} y={H - 10} textAnchor="middle" fontSize="8.5" fill="currentColor" opacity="0.6">{m.month.slice(2)}</text><text x={x(i)} y={y(m.avg_price) - 6} textAnchor="middle" fontSize="8.5" fill={col.us}>{Math.round(m.avg_price)}</text></g>)}
    </svg>
  );
}
