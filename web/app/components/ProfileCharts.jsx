"use client";

import { CHART, CHART_IRAN, CHART_GRID, CHART_TEXT } from "@/lib/chartTheme";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// نمودارهای عمومی پروفایل رقیب (فیلد `charts` در competitors.json): ستونی یا نواری، یک یا چند سری.
// داده‌ی هر نمودار عیناً از جدول‌های گزارش تحلیلی همان رقیب می‌آد؛ مقدار null (داده‌ی یافت‌نشده) رسم نمی‌شه.
// کلیدهای قدیمی (copper/petrol…) در data/competitors.json مانده‌اند؛ مقدارشان به پالت جدید نگاشت شده.
const COLORS = {
  copper: CHART[0],
  copperLight: CHART[1],
  petrol: CHART[7],
  petrolDark: CHART_IRAN,
};
const axisProps = { fontSize: 12, tick: { fill: CHART_TEXT } };

function ProfileChart({ chart }) {
  // همیشه ستونی: در چیدمان راست‌به‌چپ برچسب‌های محور عمودیِ فارسی روی میله‌ها می‌افتند و بریده می‌شن
  // (همان مشکلی که در نمودارهای ترکیه هم دیده شد)؛ برای دسته‌های زیاد برچسب مایل می‌شه.
  const fmt = (v) => (typeof v === "number" ? v.toLocaleString("fa-IR") : v);
  const height = chart.height || 300;
  const multi = chart.series.length > 1;
  const many = chart.data.length > 4;

  return (
    <div className="card p-4">
      <h4 className="text-sm font-bold text-text mb-1">{chart.title}</h4>
      {chart.note && <p className="text-xs text-text-muted mb-3 leading-6">{chart.note}</p>}
      {/* dir=ltr: در بافت RTL برچسب‌های عددی محور عمودی روی میله‌ها می‌افتند */}
      <div dir="ltr">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chart.data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
          <XAxis
            dataKey="label"
            {...axisProps}
            interval={0}
            {...(many ? { angle: -35, textAnchor: "end", height: 62 } : {})}
          />
          <YAxis {...axisProps} width={60} tickFormatter={fmt} />
          <Tooltip
            formatter={(v, name) => [`${fmt(v)} ${chart.unit || ""}`.trim(), name]}
            contentStyle={{ fontSize: 12, direction: "rtl" }}
          />
          {multi && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {chart.series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={COLORS[s.color] || COLORS.copper} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ProfileCharts({ charts }) {
  return (
    <section data-nav data-nav-title="نمودارها" className="scroll-mt-40">
    <div className="grid gap-4 lg:grid-cols-2">
      {charts.map((c, i) => (
        <div key={i} className={charts.length % 2 === 1 && i === charts.length - 1 ? "lg:col-span-2" : ""}>
          <ProfileChart chart={c} />
        </div>
      ))}
    </div>
    </section>
  );
}
