import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCompetitors, getCompetitor, COMPETITOR_WATCH_LOG_GETTERS,
  getExhibitions, getNewsAnalysis, getFlatPriceRecords, getTradeMapForCountry,
} from "@/lib/data";
import TurkeyMap from "../../components/TurkeyMap";
import InteractiveMapFrame from "../../components/InteractiveMapFrame";
import ProfileCharts from "../../components/ProfileCharts";
import ProfileSections from "../../components/ProfileSections";
import CompetitorWatchFeed from "../../components/CompetitorWatchFeed";
import ExportTrend from "../../components/ExportTrend";
import SectionNav from "../../components/SectionNav";
import PrintButton from "../../components/PrintButton";
import { latestPricePerSource, formatPrice } from "@/lib/priceFormat";
import { sortExhibitionsUpcomingFirst } from "@/lib/exhibitionDate";
import { sourceDateFa, gregorianFa, jalaliFa } from "@/lib/dateFormat";

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
  danger: "border-s-primary",
  good: "border-s-petrol-400",
  neutral: "border-s-border",
};

export function generateStaticParams() {
  return Object.keys(getCompetitors()).map((id) => ({ id }));
}

function Section({ title, subtitle, children }) {
  return (
    <section data-nav className="card scroll-mt-40 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-text">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
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
  const exhibitions = sortExhibitionsUpcomingFirst(getExhibitions().filter((e) => e.country === c.name));
  const relatedNews = getNewsAnalysis()
    .filter((n) => {
      const hay = `${n.headline_fa || ""} ${n.analysis_fa || ""}`;
      return hay.includes(c.name);
    })
    .slice(0, 4);
  const priceRows = latestPricePerSource(
    getFlatPriceRecords().filter((p) => p.country_or_region === c.name_en && p.value != null)
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <Link href="/competitors" className="text-sm text-text-muted hover:text-primary transition-colors print:hidden">
            ← تحلیل رقبا
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* سربرگ — پرچم کشور رقیب به‌عنوان پس‌زمینه، هم‌شکل با کارت‌های صفحه‌ی کشورها */}
      <section className="bg-petrol-gradient rounded-2xl overflow-hidden relative">
        <div className="relative z-10 p-6">
          <div className="flex items-baseline gap-3 flex-wrap mb-1">
            <h1 className="text-2xl font-black">{c.name}</h1>
            {flagIso2 && (
              <img
                src={`https://flagcdn.com/w160/${flagIso2}.png`}
                alt=""
                className="h-7 w-10 rounded border border-border object-cover"
              />
            )}
          </div>
          <p className="text-primary text-sm font-medium mb-4">{c.rank_note}</p>
          <p className="text-sm leading-7 text-text max-w-3xl">{c.summary}</p>

          {/* تعداد ستون‌ها با تعداد آمار هماهنگ می‌شود؛ وگرنه با ۳ آمار، یک خانه‌ی
              خالی در گرید چهارستونی می‌ماند و کارت‌ها بی‌دلیل کج به نظر می‌رسند. */}
          <div
            className={`grid gap-3 sm:grid-cols-2 mt-5 ${
              headlineStats.length + 1 <= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
            }`}
          >
            {headlineStats.map((s, i) => (
              <div key={i} className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[11px] text-text-muted mb-1">{s.label}</div>
                <div className="font-black text-lg">
                  {s.value} <span className="text-xs font-normal text-text-muted">{s.unit}</span>
                </div>
              </div>
            ))}
            {/* روند چندساله — مهم‌تر از عدد یک سال: می‌گوید رقیب دارد بزرگ می‌شود یا کوچک */}
            <ExportTrend trend={trade?.export_trend} variant="hero" />
          </div>

          {tradeStats.length > 0 && (
            <p className="text-[11px] text-text-muted mt-3">
              ارقام تجاری از ITC Trade Map (جدیدترین سال موجود: ۲۰۲۵)؛ ارقام هزینه و لجستیک از
              گزارش‌های تحلیلی همین پلتفرم با ذکر سالشان.
            </p>
          )}
        </div>
      </section>

      <SectionNav />

      {/* رصد زنده — هر رقیبی که ایجنت اختصاصی روزانه داره (ترکیه، چین) */}
      {hasWatch && (
        <Section
          title={`رصد زنده‌ی ${c.name}`}
          subtitle="خروجی ایجنت اختصاصی روزانه: سایت شرکت‌های رقیب + منابع حمل‌ونقل و اقتصاد صادراتی"
        >
          <CompetitorWatchFeed entries={watchLog} scriptPath={WATCH_SCRIPT_PATHS[c.id]} />
        </Section>
      )}

      {/* نقشه‌ی تعاملی (کارخانه‌ها، بنادر، مرزها و فاصله‌ی جاده‌ای) — جایگزین نقشه‌ی ساده‌ی قدیمی */}
      {c.interactive_map && (
        <Section
          title="نقشه‌ی تعاملی تولیدکنندگان و مسیرهای صادراتی"
          subtitle="روی هر کارخانه کلیک کنید تا فاصله‌ی جاده‌ای آن تا بنادر، مرزها و مراکز مصرف دیده شود"
        >
          <InteractiveMapFrame src={c.interactive_map} title={`نقشه‌ی تعاملی ${c.name}`} />
        </Section>
      )}

      {/* نقشه‌ی ساده‌ی قدیمی — فقط وقتی نقشه‌ی تعاملی نداریم */}
      {c.map && !c.interactive_map && (
        <Section
          title="نقشه‌ی صنعتی و مسیرهای صادراتی"
          subtitle="موقعیت کارخانه‌های جوش شیرین، بنادر خروجی و گذرگاه‌های مرزی صادراتی"
        >
          <TurkeyMap map={c.map} countryId={c.id} />
        </Section>
      )}

      {/* تولیدکنندگان */}
      <Section title="تولیدکنندگان رقیب" subtitle="ظرفیت، فناوری، مالکیت و برنامه‌های توسعه">
        <div className="grid gap-4 lg:grid-cols-3">
          {c.producers.map((p, i) => (
            <div
              key={i}
              className={`card p-4 border-s-4 ${
                p.tech_type === "solution" ? "border-s-primary" : "border-s-petrol-400"
              }`}
            >
              <div className="font-bold text-text">{p.name}</div>
              <div className="text-[11px] text-text-muted mb-2">{p.name_en}</div>

              <dl className="text-xs space-y-1.5">
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">مالکیت</dt>
                  <dd className="font-medium text-end">{p.owner}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">فناوری</dt>
                  <dd className="font-medium text-end">{p.tech}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">ظرفیت جوش شیرین</dt>
                  <dd className="font-bold text-primary-hover text-end">{p.bicarb_capacity}</dd>
                </div>
                {p.total_carbonates && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-muted">کل کربنات‌ها</dt>
                    <dd className="font-medium text-end">{p.total_carbonates}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">محل استقرار</dt>
                  <dd className="font-medium text-end">{p.location}</dd>
                </div>
              </dl>

              {p.notes && <p className="text-xs text-text leading-6 mt-3 pt-3 border-t border-border">{p.notes}</p>}

              {p.future && (
                <p className="text-xs text-primary mt-2">
                  <span className="font-semibold">توسعه: </span>{p.future}
                </p>
              )}

              {p.website && (
                <a
                  href={p.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-xs text-primary hover:underline"
                >
                  {p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} ↗
                </a>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* نمودارهای عمومی پروفایل (از جدول‌های گزارش تحلیلی) */}
      {c.charts && <ProfileCharts charts={c.charts} />}

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

      {/* ساختار هزینه — جدول سالانه اختیاریه (فقط وقتی داده‌ی رسمی دوره‌ای هست، مثل ترکیه/WE Soda) */}
      {c.cost_structure && (
        <Section title="ساختار هزینه‌ی تولید" subtitle={c.cost_structure.note}>
          {c.cost_structure.rows?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-text-muted border-b border-border">
                    <th className="py-2 pe-4">شاخص</th>
                    <th className="py-2 pe-4">۲۰۲۳</th>
                    <th className="py-2 pe-4">۲۰۲۴</th>
                    <th className="py-2">۲۰۲۵</th>
                  </tr>
                </thead>
                <tbody>
                  {c.cost_structure.rows.map((r, i) => (
                    <tr key={i} className="border-b border-border align-top">
                      <td className="py-2 pe-4 font-medium">{r.metric}</td>
                      <td className="py-2 pe-4 font-tabular text-text">{r.y2023}</td>
                      <td className="py-2 pe-4 font-tabular font-bold text-primary-hover">{r.y2024}</td>
                      <td className="py-2 font-tabular text-text">{r.y2025}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {c.cost_structure.synthetic_estimate && (
            <p className="text-xs text-text-muted leading-6 mt-3 bg-canvas border border-border rounded-md p-3">
              {c.cost_structure.synthetic_estimate}
            </p>
          )}
        </Section>
      )}

      {/* منبع اولیه — معدن قلیای طبیعی (فقط برای رقبایی که این بخش را دارند، مثل بویان چین) */}
      {c.resource_base && (
        <Section title={c.resource_base.name} subtitle={c.resource_base.location_label}>
          <p className="text-sm leading-7 text-text mb-4">{c.resource_base.summary}</p>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="rounded-lg overflow-hidden border border-border">
              <iframe
                src={`https://maps.google.com/maps?q=${c.resource_base.lat},${c.resource_base.lon}&z=9&output=embed`}
                title={`نقشه‌ی ${c.resource_base.name}`}
                className="w-full h-72 md:h-80"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="bg-canvas border-t border-border px-3 py-2 text-xs text-text">
                مختصات مرکز محدوده‌ی معدن (تقریبی): {c.resource_base.lat}, {c.resource_base.lon}
              </div>
            </div>

            <div className="space-y-3">
              <dl className="text-xs space-y-1.5 rounded-lg border border-border p-3">
                {c.resource_base.geology.map((g, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <dt className="text-text-muted shrink-0">{g.label}</dt>
                    <dd className="font-medium text-end">{g.value}</dd>
                  </div>
                ))}
              </dl>
              {c.resource_base.operator && (
                <p className="text-xs text-text-muted">
                  <span className="font-semibold text-text">بهره‌بردار: </span>
                  {c.resource_base.operator}
                </p>
              )}
            </div>
          </div>

          {c.resource_base.economics && (
            <div className="grid gap-3 sm:grid-cols-3 mt-4">
              {c.resource_base.economics.map((e, i) => (
                <div key={i} className="rounded-lg border border-border border-s-4 border-s-primary bg-white shadow-sm p-3">
                  <div className="text-xs text-text-muted mb-1">{e.label}</div>
                  <div className="font-bold text-primary-hover text-sm leading-6">{e.value}</div>
                </div>
              ))}
            </div>
          )}

          {c.resource_base.timeline && (
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-text-muted border-b border-border">
                    <th className="py-2 pe-4">تاریخ</th>
                    <th className="py-2">رویداد</th>
                  </tr>
                </thead>
                <tbody>
                  {c.resource_base.timeline.map((t, i) => (
                    <tr key={i} className="border-b border-border align-top">
                      <td className="py-2 pe-4 font-medium whitespace-nowrap">{t.date}</td>
                      <td className="py-2 text-text">{t.event}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {c.resource_base.notes && (
            <p className="text-xs text-text-muted leading-6 mt-4 bg-canvas border border-border rounded-md p-3">
              {c.resource_base.notes}
            </p>
          )}
        </Section>
      )}

      {/* مقاصد صادراتی */}
      {c.export_destinations_2024 && (
        <Section title="مقاصد صادراتی (۲۰۲۴)" subtitle="۱۰ واردکننده‌ی اصلی جوش شیرین از این کشور">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-text-muted border-b border-border">
                  <th className="py-2 pe-4">#</th>
                  <th className="py-2 pe-4">مقصد</th>
                  <th className="py-2 pe-4">ارزش (م. دلار)</th>
                  <th className="py-2 pe-4">حجم (تن)</th>
                  <th className="py-2">توضیح راهبردی</th>
                </tr>
              </thead>
              <tbody>
                {c.export_destinations_2024.map((d) => (
                  <tr key={d.rank} className="border-b border-border align-top">
                    <td className="py-2 pe-4 font-tabular text-text-muted">{d.rank}</td>
                    <td className="py-2 pe-4 font-medium whitespace-nowrap">{d.country}</td>
                    <td className="py-2 pe-4 font-tabular">{d.value_musd}</td>
                    <td className="py-2 pe-4 font-tabular">{d.volume_t.toLocaleString("fa-IR")}</td>
                    <td className="py-2 text-text-muted max-w-sm">{d.note}</td>
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
                <tr className="text-right text-text-muted border-b border-border">
                  <th className="py-2 pe-4">دوره</th>
                  <th className="py-2 pe-4">محدوده‌ی قیمت</th>
                  <th className="py-2">توضیح</th>
                </tr>
              </thead>
              <tbody>
                {c.fob_price_trend.map((t, i) => (
                  <tr key={i} className="border-b border-border align-top">
                    <td className="py-2 pe-4 font-medium whitespace-nowrap">{t.period}</td>
                    <td className="py-2 pe-4 font-tabular font-bold text-primary-hover whitespace-nowrap">{t.range}</td>
                    <td className="py-2 text-text-muted">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* روند سالانه‌ی حجم صادرات — برای رقبایی که داده‌ی چندساله (با کیفیت متفاوت هر سال) دارن */}
      {c.export_volume_trend && (
        <Section title={c.export_volume_trend.title} subtitle={c.export_volume_trend.note}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-text-muted border-b border-border">
                  <th className="py-2 pe-4">سال</th>
                  <th className="py-2 pe-4">وضعیت انتشار داده</th>
                  <th className="py-2 pe-4">حجم صادرات</th>
                  <th className="py-2 pe-4">توضیح / رشد</th>
                  <th className="py-2">منبع</th>
                </tr>
              </thead>
              <tbody>
                {c.export_volume_trend.rows.map((r, i) => (
                  <tr key={i} className="border-b border-border align-top">
                    <td className="py-2 pe-4 font-bold text-text font-tabular whitespace-nowrap">{r.year}</td>
                    <td className="py-2 pe-4 text-text">{r.status}</td>
                    <td className="py-2 pe-4 font-tabular font-medium whitespace-nowrap">{r.volume}</td>
                    <td className="py-2 pe-4 text-text">{r.detail}</td>
                    <td className="py-2 text-text-muted text-xs">{r.source}</td>
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
          <p className="text-sm leading-7 text-text mb-4">{c.iraq_case.body}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {c.iraq_case.price_build_up.map((s, i) => (
              <div key={i} className="rounded-lg border border-border border-s-4 border-s-primary bg-white shadow-sm p-3">
                <div className="text-xs text-text-muted mb-1">{s.step}</div>
                <div className="font-bold text-primary-hover">{s.value}</div>
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
                <tr className="text-right text-text-muted border-b border-border">
                  <th className="py-2 pe-4">مبدأ</th>
                  <th className="py-2 pe-4">مقصد</th>
                  <th className="py-2 pe-4">کامیون دربست</th>
                  <th className="py-2">به ازای هر تن</th>
                </tr>
              </thead>
              <tbody>
                {c.freight_rates.rows.map((r, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2 pe-4 font-medium">{r.origin}</td>
                    <td className="py-2 pe-4">{r.dest}</td>
                    <td className="py-2 pe-4 font-tabular text-text">{r.truck_usd}</td>
                    <td className="py-2 font-tabular font-bold text-primary-hover">{r.per_ton_usd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* بخش‌های تفصیلی پروفایل (متن و جدول‌های گزارش تحلیلی) */}
      {c.sections && <ProfileSections sections={c.sections} />}

      {/* جایگاه رقابتی */}
      {c.competitive_position && (
        <Section title="جایگاه رقابتی">
          <div className="grid gap-4 lg:grid-cols-2">
            {c.competitive_position.map((cp, i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <h3 className="font-bold text-sm text-text mb-2">{cp.vs}</h3>
                <ul className="list-disc pe-4 space-y-2">
                  {cp.points.map((p, j) => (
                    <li key={j} className="text-sm leading-7 text-text">{p}</li>
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
                <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
                  {(i + 1).toLocaleString("fa-IR")}
                </span>
                <span className="text-sm leading-7 text-text">{t}</span>
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
              <div key={i} className="rounded-lg border border-border border-s-4 border-s-primary bg-white shadow-sm p-3">
                <div className="text-xs text-text-muted">{p.product} · {p.price_type}</div>
                <div className="font-bold text-primary-hover">{formatPrice(p)}</div>
                <div className="text-[11px] text-text-muted">{sourceDateFa(p.source_reported_date)}</div>
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
          <Link href="/news" className="inline-block mt-3 text-sm text-primary hover:underline">
            مشاهده‌ی همه‌ی اخبار تحلیلی ←
          </Link>
        </Section>
      )}

      {c.sources && (
        <details className="card p-5">
          <summary className="cursor-pointer text-lg font-bold text-text">منابع گزارش</summary>
          <ol className="mt-4 space-y-2 list-decimal pe-5">
            {c.sources.map((s, i) => (
              <li key={i} className="text-sm leading-7 text-text">{s}</li>
            ))}
          </ol>
        </details>
      )}

      {(c.report_links || (c.report_id ? [{ id: c.report_id, label: `گزارش کامل پروفایل رقابتی ${c.name}` }] : [])).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {(c.report_links || [{ id: c.report_id, label: `گزارش کامل پروفایل رقابتی ${c.name}` }]).map((r) => (
            <div key={r.id}>
              <Link
                href={`/reports/${encodeURIComponent(r.id)}`}
                className="block card p-4 hover:border-primary transition-colors text-sm"
              >
                <span className="font-bold text-text">{r.label}</span>
                <span className="text-text-muted"> ←</span>
              </Link>
              {r.docx && (
                <a
                  href={`/api/reports/download?id=${encodeURIComponent(r.id)}&format=docx`}
                  className="block text-xs text-primary hover:underline mt-1 ps-1"
                >
                  دانلود فایل Word ↓
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {c.source_docs && (
        <p className="text-xs text-text-muted">
          منبع داده‌های ساختاریافته‌ی این صفحه: {c.source_docs.join(" · ")}
        </p>
      )}
    </div>
  );
}
