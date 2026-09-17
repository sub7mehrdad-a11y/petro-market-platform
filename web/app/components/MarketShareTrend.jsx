"use client";

// روند چندساله‌ی سهم بازار — سهم هر کشور مبدأ از یک بازار مقصد (یا از صادرات
// جهانی)، سال به سال. از data/market_share_history.json که
// scripts/ingest_market_share_history.py می‌سازد (منبع: WITS).
//
// چرا جدا از SupplierBreakdown: آن کامپوننت یک عکسِ لحظه‌ایِ یک‌سال است («چه
// کسی الان تأمین‌کننده‌ست»)؛ این یکی روند چندساله را نشان می‌دهد («سهم چه
// کسی دارد رشد/افت می‌کند، و آن سهمِ ازدست‌رفته را چه کسی می‌گیرد») — دو
// سؤال متفاوتند و قاطی‌کردنشان در یک کامپوننت خوانایی هر دو را کم می‌کرد.
//
// محاسبه‌ی سهم/بزرگ‌ترین‌تغییرات از قبل توی ingest انجام شده (movers.ranked)؛
// این کامپوننت فقط رندر می‌کند، عدد نمی‌سازد — همان الگوی ExportTrend.jsx.

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// همون پالت اعتبارسنجی‌شده‌ی PriceChart.jsx (مسی/قرمز/آبی/سبز) + چند رنگ
// مکمل هم‌خانواده برای وقتی بیش از ۴ تأمین‌کننده‌ی برجسته داریم. «سایر» همیشه
// خاکستریه، صرف‌نظر از ترتیب.
const SERIES_COLORS = ["#C9762E", "#9C2B2B", "#0C7DA6", "#4C7A3D", "#7C5CBF", "#B08900"];
const OTHER_COLOR = "#94a3b8";
const MAX_SERIES = 5; // بیشتر از این، به «سایر» جمع می‌شه

function faDigits(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

function pctLabel(v) {
  if (v == null) return "—";
  return `${v.toLocaleString("fa-IR")}٪`;
}

function deltaLabel(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString("fa-IR")} واحد درصد`;
}

// جدول movers فقط می‌گه «کی رشد کرد، کی افت کرد» — سؤال کاربر یک قدم جلوتره:
// «سهمِ ازدست‌رفته‌ی کی رو دقیقاً کی گرفت؟». این تابع بزرگ‌ترین بازنده رو با
// بزرگ‌ترین برنده(ها) جفت می‌کنه تا این «جایگزینی» صریح بیان بشه، نه فقط
// این‌که هر کدوم جدا در جدول دیده بشن. آستانه‌ی ۱ واحد درصد برای فیلتر نویز.
const SUBSTITUTION_MIN_DELTA = 1;

function buildSubstitutionNote(ranked) {
  const losers = ranked
    .filter((r) => r.delta_pct_points <= -SUBSTITUTION_MIN_DELTA)
    .sort((a, b) => a.delta_pct_points - b.delta_pct_points);
  const gainers = ranked
    .filter((r) => r.delta_pct_points >= SUBSTITUTION_MIN_DELTA)
    .sort((a, b) => b.delta_pct_points - a.delta_pct_points);
  if (!losers.length || !gainers.length) return null;

  const topLoser = losers[0];
  const topGainers = gainers.slice(0, 2);
  const gainersText = topGainers
    .map((g) => `${g.country_fa} (${deltaLabel(g.delta_pct_points)})`)
    .join(" و ");

  return `بزرگ‌ترین افت سهم را ${topLoser.country_fa} داشت (${deltaLabel(topLoser.delta_pct_points)})؛ بیشترین بخش این سهمِ ازدست‌رفته به ${gainersText} رسیده است.`;
}

// چه کشورهایی سری جدا بگیرن: بر اساس میانگین سهم در طول کل بازه، بزرگ‌ترین
// MAX_SERIES تا، بقیه جمع می‌شن توی «سایر» — وگرنه با ۱۰-۱۵ تأمین‌کننده‌ی
// کوچیک نمودار غیرقابل‌خوندن می‌شه.
function pickTopSeries(years) {
  const avg = new Map();
  for (const y of years) {
    for (const s of y.suppliers) {
      avg.set(s.country_fa, (avg.get(s.country_fa) || 0) + (s.share_pct || 0));
    }
  }
  return Array.from(avg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SERIES)
    .map(([name]) => name);
}

function buildChartData(years, topNames) {
  return years.map((y) => {
    const row = { year: y.year };
    let otherSum = 0;
    for (const s of y.suppliers) {
      if (topNames.includes(s.country_fa)) {
        row[s.country_fa] = s.share_pct || 0;
      } else {
        otherSum += s.share_pct || 0;
      }
    }
    if (otherSum > 0.05) row["سایر"] = Math.round(otherSum * 10) / 10;
    return row;
  });
}

// فقط بزرگ‌ترین تغییرات (چه رشد چه افت) رو نشون بده؛ کشورهایی که سهمشون کل
// بازه صفر یا نزدیک صفر بوده (مثلاً ۰٫۰ به ۰٫۰) خودشون خبری نیستن و فقط جدول
// رو طولانی و کم‌خوان می‌کنن.
const MIN_DELTA_TO_SHOW = 0.1;
const MAX_MOVERS_PER_SIDE = 5;

function pickSignificantMovers(ranked) {
  const gainers = ranked.filter((r) => r.delta_pct_points >= MIN_DELTA_TO_SHOW).slice(0, MAX_MOVERS_PER_SIDE);
  const losers = ranked
    .filter((r) => r.delta_pct_points <= -MIN_DELTA_TO_SHOW)
    .slice(-MAX_MOVERS_PER_SIDE)
    .reverse();
  return [...gainers, ...losers];
}

function MoversTable({ movers }) {
  if (!movers?.ranked?.length) return null;
  const shown = pickSignificantMovers(movers.ranked);
  if (!shown.length) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-right text-slate-500 border-b border-slate-200">
            <th className="py-2 pe-4">کشور مبدأ</th>
            <th className="py-2 pe-4">سهم {faDigits(movers.first_year)}</th>
            <th className="py-2 pe-4">سهم {faDigits(movers.last_year)}</th>
            <th className="py-2">تغییر سهم</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.country_fa} className="border-b border-slate-100">
              <td className="py-2 pe-4 font-medium">{r.country_fa}</td>
              <td className="py-2 pe-4 font-tabular text-slate-600">{pctLabel(r.share_first)}</td>
              <td className="py-2 pe-4 font-tabular text-slate-600">{pctLabel(r.share_last)}</td>
              <td
                className={`py-2 font-tabular font-bold ${
                  r.delta_pct_points > 0.05
                    ? "text-emerald-700"
                    : r.delta_pct_points < -0.05
                    ? "text-rose-700"
                    : "text-slate-400"
                }`}
              >
                {deltaLabel(r.delta_pct_points)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * data: خروجی getMarketShareHistory(country) یا getGlobalMarketShareHistory()
 *       شکل: { importer_fa, years:[{year, total_usd_k, suppliers:[...]}], movers, note_fa?, mirror_gaps? }
 * title: عنوان بخش (پیش‌فرض بر اساس importer_fa ساخته می‌شه)
 */
export default function MarketShareTrend({ data, title }) {
  if (!data?.years?.length || data.years.length < 2) return null;

  const { years, movers, note_fa, mirror_gaps } = data;
  const topNames = pickTopSeries(years);
  const seriesNames = years.some((y) =>
    y.suppliers.some((s) => !topNames.includes(s.country_fa))
  )
    ? [...topNames, "سایر"]
    : topNames;
  const chartData = buildChartData(years, topNames);
  const firstY = years[0].year;
  const lastY = years[years.length - 1].year;

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
        <h2 className="text-lg font-bold">
          {title || `روند سهم بازار ${data.importer_fa || ""}`}
        </h2>
        <span className="text-xs text-slate-400">
          {faDigits(firstY)}–{faDigits(lastY)} · منبع: WITS
          {data.manual_overrides && Object.keys(data.manual_overrides).length > 0 && " + آمار رسمی کشوری"}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        سهم هر کشور مبدأ از ارزش واردات، سال به سال — نشان می‌دهد سهم چه کسی
        دارد رشد یا افت می‌کند، نه فقط وضعیت امسال.
      </p>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="year" fontSize={12} tickFormatter={faDigits} />
          <YAxis
            fontSize={12}
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            tickFormatter={(v) => `${v}٪`}
            label={{ value: "سهم بازار", angle: -90, position: "insideLeft", fontSize: 11, fill: "#64748b" }}
          />
          <Tooltip
            formatter={(value, name) => [`${Number(value).toLocaleString("fa-IR")}٪`, name]}
            labelFormatter={(year) => `سال ${faDigits(year)}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {seriesNames.map((name, i) => (
            <Area
              key={name}
              type="monotone"
              dataKey={name}
              stackId="share"
              stroke={name === "سایر" ? OTHER_COLOR : SERIES_COLORS[i % SERIES_COLORS.length]}
              fill={name === "سایر" ? OTHER_COLOR : SERIES_COLORS[i % SERIES_COLORS.length]}
              fillOpacity={name === "سایر" ? 0.35 : 0.55}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {movers?.ranked && (
        (() => {
          const note = buildSubstitutionNote(movers.ranked);
          return note ? (
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 mt-4 leading-6">
              {note}
            </p>
          ) : null;
        })()
      )}

      <MoversTable movers={movers} />

      {note_fa && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4 leading-6">
          {note_fa}
        </p>
      )}

      {mirror_gaps && Object.keys(mirror_gaps).length > 0 && (
        <p className="text-[11px] text-slate-400 mt-3 leading-6">
          ⚠️ {Object.entries(mirror_gaps)
            .filter(([, g]) => g.missing_years?.length)
            .map(([name, g]) => `${name} در سال‌های ${g.missing_years.map(faDigits).join("، ")} در این جدول دیده نمی‌شود`)
            .join(" — ")}{" "}
          (یعنی صادراتش صفر شده، نه اینکه گزارش نشده — برای مقصدهایی که در بخش‌های دیگر همین سایت
          پوشش دارند، آمار وارداتی مقصد را ببینید، نه این جدول.)
        </p>
      )}
    </section>
  );
}
