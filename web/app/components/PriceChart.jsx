"use client";

import {
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

// هر سری = یک ترکیب محصول+کشور+نوع قیمت (چون واحد پول/نوع قیمت‌شون فرق می‌کنه
// و قاطی‌کردن‌شون توی یه خط گمراه‌کننده‌ست).
function buildSeries(rows) {
  const seriesKey = (r) => `${r.product} / ${r.country_or_region} / ${r.price_type}`;
  const byDate = new Map();
  const keys = new Set();

  for (const r of rows) {
    if (r.value == null) continue;
    const key = seriesKey(r);
    keys.add(key);
    const date = r.source_reported_date || r.batch_date;
    if (!byDate.has(date)) byDate.set(date, { date });
    byDate.get(date)[key] = r.value;
  }

  const data = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { data, keys: Array.from(keys) };
}

export default function PriceChart({ rows }) {
  const { data, keys } = buildSeries(rows);

  if (data.length === 0) {
    return (
      <p className="text-sm text-slate-500">هنوز داده‌ی قیمتی با عدد واقعی ثبت نشده.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {keys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            connectNulls
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
