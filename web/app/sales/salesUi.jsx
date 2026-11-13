"use client";

import Link from "next/link";

// اجزای مشترک پنل بازرگانی (قالب عددها، کارت شاخص، نمودار میله‌ای+خطی، نوار ناوبری بخش‌ها).

export const fa = (n, d = 0) => (n == null ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d }));
export const usd = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
export const price = (n) => (n == null ? "—" : `$${fa(n, 1)}`);

export function Delta({ pct }) {
  if (pct == null) return null;
  const up = pct > 0;
  return (
    <span className={`text-[11px] font-semibold ${pct === 0 ? "text-text-muted" : up ? "text-success" : "text-danger"}`} dir="ltr">
      {up ? "▲" : pct < 0 ? "▼" : "•"} {Math.abs(pct)}٪
    </span>
  );
}

export function Kpi({ label, value, sub, delta, tone }) {
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
export function WeeklyChart({ weekly }) {
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

// نوار بخش‌های «مدیریت قراردادها و حسابداری». فقط در صفحه‌های داخل این بخش دیده می‌شود (صفحه‌ی اصلی فقط ورودی دارد).
const TABS = [
  { href: "/sales/contracts", label: "قراردادها" },
  { href: "/sales/contracts/new", label: "+ ثبت قرارداد جدید" },
  { href: "/sales/accounts", label: "حساب‌ها و پرداخت‌ها" },
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
