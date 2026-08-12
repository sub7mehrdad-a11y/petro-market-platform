"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const COLORS = ["#047857", "#b45309", "#1d4ed8", "#be123c", "#6d28d9"];

// چارت‌های گزارش با {categories, series:[{name, values}]} میان؛ recharts آرایه‌ای
// از آبجکت به شکل {category, seriesName: value, ...} می‌خواد.
function toRechartsData(categories, series) {
  return categories.map((cat, i) => {
    const row = { category: cat };
    for (const s of series) row[s.name] = s.values[i];
    return row;
  });
}

export default function ReportChart({ chart }) {
  const data = toRechartsData(chart.categories || [], chart.series || []);
  const ChartComp = chart.type === "line" ? LineChart : BarChart;

  return (
    <div className="my-4">
      <h4 className="font-semibold text-sm mb-2">
        {chart.title}
        {chart.unit && <span className="text-slate-400 font-normal"> ({chart.unit})</span>}
      </h4>
      <ResponsiveContainer width="100%" height={280}>
        <ChartComp data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="category" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip />
          {chart.series?.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {(chart.series || []).map((s, i) =>
            chart.type === "line" ? (
              <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
            ) : (
              <Bar key={s.name} dataKey={s.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
            )
          )}
        </ChartComp>
      </ResponsiveContainer>
    </div>
  );
}
