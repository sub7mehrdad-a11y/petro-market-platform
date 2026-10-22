"use client";
import { sourceDateFa, gregorianFa, jalaliFa } from "@/lib/dateFormat";

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
import { CHART, CHART_GRID, CHART_TEXT } from "@/lib/chartTheme";

// پالت دسته‌ای اعتبارسنجی‌شده (validate_palette.js، حالت light — همه‌ی چک‌ها PASS):
// مسی (برند اصلی) → قرمز هشدار (از قبل تو پروژه بود) → آبی → سبز. ترتیب ثابته،
// چرخشی انتخاب نمی‌شه. پترول برند اینجا نیست چون رنگ‌آمیزی خیلی کم‌اشباعی داره
// (فقط برای متن/پس‌زمینه مناسبه، نه برای تفکیک سری‌های داده — زیر آستانه‌ی chroma
// رد شد).
const SERIES_COLORS = CHART.slice(0, 4);

const PRICE_TYPE_FA = { domestic: "داخلی", FOB: "FOB", CIF: "CIF" };
const CURRENCY_FA = { USD: "دلار آمریکا", CNY: "یوان چین", EUR: "یورو" };

// هرگز قیمت دلاری (FOB/CIF) رو با قیمت ارز محلی (داخلی) روی یک محور قاطی نکن —
// مقیاسشون کاملاً فرق می‌کنه (مثلاً ۱۰۳۰ یوآن در برابر ۲۵۰ دلار) و کنار هم گمراه‌کننده‌ست.
// به‌جاش برای هر ارز یک نمودار جدا با محور خودش می‌سازیم.
function groupByCurrency(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (r.value == null) continue;
    if (!groups.has(r.currency)) groups.set(r.currency, []);
    groups.get(r.currency).push(r);
  }
  return groups;
}

// محور زمان باید روی batch_date (تاریخ واقعی جمع‌آوری، ISO و همیشه قابل‌مرتب‌سازی)
// بایسته، نه source_reported_date (برچسب آزاد از منبع مثل «Q2 2026» یا «June 2026»
// که رشته‌ای مرتب‌شون کنی ترتیب غلط می‌ده — مثلاً «August» قبل از «June» میاد).
// source_reported_date فقط توی tooltip به‌عنوان اطلاعات تکمیلی نشون داده می‌شه.
function buildSeries(rows) {
  const seriesKey = (r) => `${r.country_or_region} · ${PRICE_TYPE_FA[r.price_type] || r.price_type}`;
  const byDate = new Map();
  const keys = new Set();

  for (const r of rows) {
    const key = seriesKey(r);
    keys.add(key);
    const date = r.batch_date || r.source_reported_date;
    if (!byDate.has(date)) byDate.set(date, { date });
    const bucket = byDate.get(date);
    bucket[key] = r.value;
    bucket[`${key}__reported`] = r.source_reported_date;
  }

  const data = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { data, keys: Array.from(keys) };
}

function CurrencyChart({ currency, unit, rows }) {
  const { data, keys } = buildSeries(rows);
  if (data.length === 0) return null;

  return (
    <div className="mb-4 last:mb-0">
      <p className="text-xs text-text-muted mb-1">
        بر حسب {CURRENCY_FA[currency] || currency} — {unit || "تن"}
      </p>
      <div dir="ltr">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="date" fontSize={12} tickFormatter={(d) => gregorianFa(d, { short: true })} />
          <YAxis
            fontSize={12}
            label={{ value: currency, angle: -90, position: "insideLeft", fontSize: 11, fill: CHART_TEXT }}
          />
          <Tooltip wrapperStyle={{ direction: "rtl" }}
            formatter={(value, name) => [`${value} ${currency}`, name]}
            labelFormatter={(date, payload) => {
              const reported = payload?.[0]?.payload?.[`${payload[0].name}__reported`];
              return reported ? `تاریخ جمع‌آوری: ${gregorianFa(date)} (منبع: ${sourceDateFa(reported)})` : `تاریخ جمع‌آوری: ${date}`;
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {keys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              connectNulls
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function PriceChart({ rows }) {
  const groups = groupByCurrency(rows);

  if (groups.size === 0) {
    return (
      <p className="text-sm text-text-muted">هنوز داده‌ی قیمتی با عدد واقعی ثبت نشده.</p>
    );
  }

  return (
    <div>
      {Array.from(groups.entries()).map(([currency, currencyRows]) => (
        <CurrencyChart
          key={currency}
          currency={currency}
          unit={currencyRows[0]?.unit}
          rows={currencyRows}
        />
      ))}
    </div>
  );
}
