import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCompetitors, getCompetitor, COMPETITOR_WATCH_LOG_GETTERS,
  getExhibitions, getNewsAnalysis, getFlatPriceRecords, getTradeMapForCountry,
} from "@/lib/data";
import TurkeyMap from "../../components/TurkeyMap";
import CompetitorWatchFeed from "../../components/CompetitorWatchFeed";
import ExportTrend from "../../components/ExportTrend";

// مسیر اسکریپت رصد روزانه‌ی هر رقیب — برای پیام «هنوز اجرا نشده» و برای گیرنده‌ی لاگ.
const WATCH_SCRIPT_PATHS = {
  turkey: "scripts/turkey_watch_bot.py",
  china: "scripts/china_watch_bot.py",
};
import NewsCard from "../../components/NewsCard";
import ExhibitionTable from "../../components/ExhibitionTable";
import {
  ExportDestinationsChart, FobTrendChart, CostComparisonChart,
  CapacityChart, CarbonChart, FreightChart,
} from "../../components/CompetitorCharts";

const TONE = {
  danger: "border-s-copper-500",
  good: "border-s-petrol-400",
  neutral: "border-s-slate-300",
};

export function generateStaticParams() {
  return Object.keys(getCompetitors()).map((id) => ({ id }));
}

function Section({ title, subtitle, children }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-petrol-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function CompetitorPage({ params }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const c = getCompetitor(id);

  if (!c) notFound();

  const isTurkey = c.id === "turkey";
  const trade = getTradeMapForCountry(c.name);
  // کد پرچم از همان منبع صفحه‌ی کشورها (trade_map_2025.json)
  const flagIso2 = trade?.iso2;

  // آمار تجاری سربرگ از داده‌ی ITC ساخته می‌شود، نه از متن دستی competitors.json.
  // دلیل: ارقام دستی روی سال ۲۰۲۴ منجمد مانده بودند و با هر سال جدید باید دستی
  // عوض می‌شدند. حالا با هر بار اجرای ingest_trade_map.py خودکار به‌روز می‌شوند.
  // فقط آمارهایی که در ITC نیستند (هزینه‌ی تولید، زمان حمل) در JSON می‌مانند.
  const ex = trade?.exports_2025;
  const tradeStats = ex
    ? [
        ex.quantity != null && {
          label: "حجم صادرات (۲۰۲۵)",
          value: ex.quantity.toLocaleString("fa-IR"),
          unit: "تن",
        },
        ex.value_usd_k != null && {
          label: "ارزش صادرات (۲۰۲۵)",
          value: (ex.value_usd_k / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 1 }),
          unit: "میلیون دلار",
        },
        ex.share_world_pct != null && {
          label: "سهم بازار جهانی (۲۰۲۵)",
          value: ex.share_world_pct.toLocaleString("fa-IR"),
          unit: "درصد",
        },
        ex.unit_value_usd != null && {
          label: "قیمت متوسط صادراتی (۲۰۲۵)",
          value: ex.unit_value_usd.toLocaleString("fa-IR"),
          unit: "دلار/تن",
        },
      ].filter(Boolean)
    : [];

  const headlineStats = [...tradeStats, ...(c.headline_stats || [])];
  const watchLogGetter = COMPETITOR_WATCH_LOG_GETTERS[c.id];
  const hasWatch = !!watchLogGetter;
  const watchLog = hasWatch ? watchLogGetter() : [];

  // نمایشگاه‌ها و اخبار مرتبط با همین کشور رقیب، از همون بانک‌های موجود سایت
  const exhibitions = getExhibitions().filter((e) => e.country === c.name);
  const relatedNews = getNewsAnalysis()
    .filter((n) => {
      const hay = `${n.headline_fa || ""} ${n.analysis_fa || ""}`;
      return hay.includes(c.name);
    })
    .slice(0, 4);
  const priceRows = getFlatPriceRecords().filter(
    (p) => p.country_or_region === c.name_en && p.value != null
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/competitors" className="text-sm text-slate-500 hover:underline">
          ← تحلیل رقبا
        </Link>
      </div>

      {/* سربرگ — پرچم کشور رقیب به‌عنوان پس‌زمینه، هم‌شکل با کارت‌های صفحه‌ی کشورها */}
      <section
        className="bg-petrol-gradient text-white rounded-xl overflow-hidden relative"
        style={
          flagIso2
            ? {
                backgroundImage: `linear-gradient(to top, rgba(11,32,39,.95), rgba(11,32,39,.78)), url(https://flagcdn.com/w1280/${flagIso2}.png)`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div
          className="pointer-events-none absolute -top-20 -start-20 h-64 w-64 rounded-full opacity-50"
          style={{ background: "radial-gradient(circle, rgba(201,118,46,.4), transparent 70%)" }}
        />
        <div className="relative z-10 p-6">
          <div className="flex items-baseline gap-3 flex-wrap mb-1">
            <h1 className="text-2xl font-black">{c.name}</h1>
            <span className="text-sm text-petrol-200">{c.name_en}</span>
          </div>
          <p className="text-copper-300 text-sm font-medium mb-4">{c.rank_note}</p>
          <p className="text-sm leading-7 text-petrol-50 max-w-3xl">{c.summary}</p>

          {/* تعداد ستون‌ها با تعداد آمار هماهنگ می‌شود؛ وگرنه با ۳ آمار، یک خانه‌ی
              خالی در گرید چهارستونی می‌ماند و کارت‌ها بی‌دلیل کج به نظر می‌رسند. */}
          <div
            className={`grid gap-3 sm:grid-cols-2 mt-5 ${
              headlineStats.length + 1 <= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
            }`}
          >
            {headlineStats.map((s, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                <div className="text-[11px] text-petrol-200 mb-1">{s.label}</div>
                <div className="font-black font-tabular text-lg">
                  {s.value} <span className="text-xs font-normal text-petrol-200">{s.unit}</span>
                </div>
              </div>
            ))}
            {/* روند چندساله — مهم‌تر از عدد یک سال: می‌گوید رقیب دارد بزرگ می‌شود یا کوچک */}
            <ExportTrend trend={trade?.export_trend} variant="hero" />
          </div>

          {tradeStats.length > 0 && (
            <p className="text-[11px] text-petrol-300 mt-3">
              ارقام تجاری از ITC Trade Map (جدیدترین سال موجود: ۲۰۲۵)؛ ارقام هزینه و لجستیک از
              گزارش‌های تحلیلی همین پلتفرم با ذکر سالشان.
            </p>
          )}
        </div>
      </section>

      {/* رصد زنده — هر رقیبی که ایجنت اختصاصی روزانه داره (ترکیه، چین) */}
      {hasWatch && (
        <Section
          title={`رصد زنده‌ی ${c.name}`}
          subtitle="خروجی ایجنت اختصاصی روزانه: سایت شرکت‌های رقیب + منابع حمل‌ونقل و اقتصاد صادراتی"
        >
          <CompetitorWatchFeed entries={watchLog} scriptPath={WATCH_SCRIPT_PATHS[c.id]} />
        </Section>
      )}

      {/* نقشه */}
      {c.map && (
        <Section
          title="نقشه‌ی صنعتی و مسیرهای صادراتی"
          subtitle="موقعیت کارخانه‌های جوش شیرین، بنادر خروجی و گذرگاه‌های مرزی صادراتی"
        >
          <TurkeyMap map={c.map} />
        </Section>
      )}

      {/* تولیدکنندگان */}
      <Section title="تولیدکنندگان رقیب" subtitle="ظرفیت، فناوری، مالکیت و برنامه‌های توسعه">
        <div className="grid gap-4 lg:grid-cols-3">
          {c.producers.map((p, i) => (
            <div
              key={i}
              className={`rounded-xl border border-slate-200 bg-white shadow-sm p-4 border-s-4 ${
                p.tech_type === "solution" ? "border-s-copper-500" : "border-s-petrol-400"
              }`}
            >
              <div className="font-bold text-petrol-900">{p.name}</div>
              <div className="text-[11px] text-slate-400 mb-2">{p.name_en}</div>

              <dl className="text-xs space-y-1.5">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">مالکیت</dt>
                  <dd className="font-medium text-end">{p.owner}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">فناوری</dt>
                  <dd className="font-medium text-end">{p.tech}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">ظرفیت جوش شیرین</dt>
                  <dd className="font-bold text-copper-800 font-tabular text-end">{p.bicarb_capacity}</dd>
                </div>
                {p.total_carbonates && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">کل کربنات‌ها</dt>
                    <dd className="font-medium font-tabular text-end">{p.total_carbonates}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">محل استقرار</dt>
                  <dd className="font-medium text-end">{p.location}</dd>
                </div>
              </dl>

              {p.notes && <p className="text-xs text-slate-600 leading-6 mt-3 pt-3 border-t border-slate-100">{p.notes}</p>}

              {p.future && (
                <p className="text-xs text-copper-700 mt-2">
                  <span className="font-semibold">توسعه: </span>{p.future}
                </p>
              )}

              {p.website && (
                <a
                  href={p.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-xs text-copper-700 hover:underline"
                >
                  {p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} ↗
                </a>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* نمودارها */}
      {isTurkey && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CapacityChart producers={c.producers} />
          <CostComparisonChart />
          <div className="lg:col-span-2">
            <ExportDestinationsChart destinations={c.export_destinations_2024} />
          </div>
          <FobTrendChart trend={c.fob_price_trend} />
          <CarbonChart carbon={c.carbon} />
          <div className="lg:col-span-2">
            <FreightChart freight={c.freight_rates} />
          </div>
        </div>
      )}

      {/* ساختار هزینه */}
      {c.cost_structure && (
        <Section title="ساختار هزینه‌ی تولید" subtitle={c.cost_structure.note}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-4">شاخص</th>
                  <th className="py-2 pe-4">۲۰۲۳</th>
                  <th className="py-2 pe-4">۲۰۲۴</th>
                  <th className="py-2">۲۰۲۵</th>
                </tr>
              </thead>
              <tbody>
                {c.cost_structure.rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="py-2 pe-4 font-medium">{r.metric}</td>
                    <td className="py-2 pe-4 font-tabular text-slate-600">{r.y2023}</td>
                    <td className="py-2 pe-4 font-tabular font-bold text-copper-800">{r.y2024}</td>
                    <td className="py-2 font-tabular text-slate-600">{r.y2025}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 leading-6 mt-3 bg-slate-50 border border-slate-200 rounded-md p-3">
            {c.cost_structure.synthetic_estimate}
          </p>
        </Section>
      )}

      {/* مقاصد صادراتی */}
      {c.export_destinations_2024 && (
        <Section title="مقاصد صادراتی (۲۰۲۴)" subtitle="۱۰ واردکننده‌ی اصلی جوش شیرین از این کشور">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-4">#</th>
                  <th className="py-2 pe-4">مقصد</th>
                  <th className="py-2 pe-4">ارزش (م. دلار)</th>
                  <th className="py-2 pe-4">حجم (تن)</th>
                  <th className="py-2">توضیح راهبردی</th>
                </tr>
              </thead>
              <tbody>
                {c.export_destinations_2024.map((d) => (
                  <tr key={d.rank} className="border-b border-slate-100 align-top">
                    <td className="py-2 pe-4 font-tabular text-slate-400">{d.rank}</td>
                    <td className="py-2 pe-4 font-medium whitespace-nowrap">{d.country}</td>
                    <td className="py-2 pe-4 font-tabular">{d.value_musd}</td>
                    <td className="py-2 pe-4 font-tabular">{d.volume_t.toLocaleString("fa-IR")}</td>
                    <td className="py-2 text-slate-500 max-w-sm">{d.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* قیمت FOB */}
      {c.fob_price_trend && (
        <Section title="روند قیمت FOB صادراتی" subtitle={c.fob_price_caveat}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-4">دوره</th>
                  <th className="py-2 pe-4">محدوده‌ی قیمت</th>
                  <th className="py-2">توضیح</th>
                </tr>
              </thead>
              <tbody>
                {c.fob_price_trend.map((t, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="py-2 pe-4 font-medium whitespace-nowrap">{t.period}</td>
                    <td className="py-2 pe-4 font-tabular font-bold text-copper-800 whitespace-nowrap">{t.range}</td>
                    <td className="py-2 text-slate-500">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* عراق */}
      {c.iraq_case && (
        <Section title={c.iraq_case.title}>
          <p className="text-sm leading-7 text-slate-700 mb-4">{c.iraq_case.body}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {c.iraq_case.price_build_up.map((s, i) => (
              <div key={i} className="rounded-lg border border-slate-200 border-s-4 border-s-copper-500 bg-white shadow-sm p-3">
                <div className="text-xs text-slate-500 mb-1">{s.step}</div>
                <div className="font-bold text-copper-800 font-tabular">{s.value}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* کرایه‌ی حمل */}
      {c.freight_rates && (
        <Section title="کرایه‌ی حمل زمینی" subtitle={c.freight_rates.note}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-4">مبدأ</th>
                  <th className="py-2 pe-4">مقصد</th>
                  <th className="py-2 pe-4">کامیون دربست</th>
                  <th className="py-2">به ازای هر تن</th>
                </tr>
              </thead>
              <tbody>
                {c.freight_rates.rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 pe-4 font-medium">{r.origin}</td>
                    <td className="py-2 pe-4">{r.dest}</td>
                    <td className="py-2 pe-4 font-tabular text-slate-600">{r.truck_usd}</td>
                    <td className="py-2 font-tabular font-bold text-copper-800">{r.per_ton_usd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* جایگاه رقابتی */}
      {c.competitive_position && (
        <Section title="جایگاه رقابتی">
          <div className="grid gap-4 lg:grid-cols-2">
            {c.competitive_position.map((cp, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-4">
                <h3 className="font-bold text-sm text-petrol-900 mb-2">{cp.vs}</h3>
                <ul className="list-disc pe-4 space-y-2">
                  {cp.points.map((p, j) => (
                    <li key={j} className="text-sm leading-7 text-slate-700">{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* جمع‌بندی */}
      {c.strategic_takeaways && (
        <Section title="جمع‌بندی راهبردی برای رقابت">
          <ol className="space-y-3">
            {c.strategic_takeaways.map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-copper-500 text-white text-xs font-bold font-tabular">
                  {i + 1}
                </span>
                <span className="text-sm leading-7 text-slate-700">{t}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* قیمت‌های رصدشده */}
      {priceRows.length > 0 && (
        <Section title="قیمت‌های رصدشده‌ی این کشور" subtitle="از داشبورد قیمت روزانه — همیشه به‌روز">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {priceRows.slice(0, 6).map((p, i) => (
              <div key={i} className="rounded-lg border border-slate-200 border-s-4 border-s-copper-500 bg-white shadow-sm p-3">
                <div className="text-xs text-slate-500">{p.product} · {p.price_type}</div>
                <div className="font-bold text-copper-800 font-tabular">{p.value} {p.currency}/{p.unit}</div>
                <div className="text-[11px] text-slate-400">{p.source_reported_date}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* نمایشگاه‌ها */}
      {exhibitions.length > 0 && (
        <Section title={`نمایشگاه‌های ${c.name}`} subtitle="فرصت‌های حضور و رصد میدانی رقبا">
          <ExhibitionTable exhibitions={exhibitions} />
        </Section>
      )}

      {/* اخبار مرتبط */}
      {relatedNews.length > 0 && (
        <Section title={`اخبار تحلیلی مرتبط با ${c.name}`} subtitle="فیلترشده از آرشیو اخبار تحلیلی روزانه">
          <div>
            {relatedNews.map((n, i) => (
              <NewsCard key={i} entry={n} compact />
            ))}
          </div>
          <Link href="/news" className="inline-block mt-3 text-sm text-copper-700 hover:underline">
            مشاهده‌ی همه‌ی اخبار تحلیلی ←
          </Link>
        </Section>
      )}

      {c.source_docs && (
        <p className="text-xs text-slate-400">
          منبع داده‌های ساختاریافته‌ی این صفحه: {c.source_docs.join(" · ")}
        </p>
      )}
    </div>
  );
}
