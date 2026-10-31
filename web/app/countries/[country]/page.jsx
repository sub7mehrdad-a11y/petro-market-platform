import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCountries, getCountrySummary, getCountryProfile, getTradeMapForCountry, getImportSuppliers,
  getIranExports, getIranExportToCountry, getPerCapitaConsumption, getCompetitorForCountry,
  getMarketShareHistory, getUnionsForCountry, getCountryPopulation,
} from "@/lib/data";
import CompaniesEntryBox from "../../components/CompaniesEntryBox";
import { countByGrade } from "@/lib/companyGrades";
import { isValidEmail } from "@/lib/outreachTemplate";
import ExhibitionTable from "../../components/ExhibitionTable";
import WorldRouteMap from "../../components/WorldRouteMap";
import PageHeader from "../../components/PageHeader";
import PrintButton from "../../components/PrintButton";
import InteractiveMapFrame from "../../components/InteractiveMapFrame";
import CountryStatStrip from "../../components/CountryStatStrip";
import CountryEconomicProfile from "../../components/CountryEconomicProfile";
import SupplierBreakdown from "../../components/SupplierBreakdown";
import MarketShareTrend from "../../components/MarketShareTrend";
import ExportTrend from "../../components/ExportTrend";
import IranExportSection from "../../components/IranExportSection";
import { latestPricePerSource, formatPrice, unitFa } from "@/lib/priceFormat";
import { sortExhibitionsUpcomingFirst } from "@/lib/exhibitionDate";
import { sourceDateFa, gregorianFa, jalaliFa } from "@/lib/dateFormat";

const REPORT_TYPE_FA = { detailed: "گزارش مفصل", summary: "گزارش مدیریتی (خلاصه)" };
const TIER_FA = { developed: "میانگین کشورهای توسعه‌یافته", developing: "میانگین در حال توسعه", least_developed: "میانگین کم‌درآمد" };

export function generateStaticParams() {
  return getCountries().map((country) => ({ country }));
}

export default async function CountryPage({ params }) {
  const { country: rawCountry } = await params;
  const country = decodeURIComponent(rawCountry);

  if (!getCountries().includes(country)) {
    notFound();
  }

  const { companies, exhibitions, reports, prices: allPrices } = getCountrySummary(country);
  const prices = latestPricePerSource(allPrices);
  const profile = getCountryProfile(country);
  const trade = getTradeMapForCountry(country);
  const suppliers = getImportSuppliers(country);
  const shareHistory = getMarketShareHistory(country);
  const iranExports = country === "ایران" ? getIranExports() : null;
  const iranExportToHere = country !== "ایران" ? getIranExportToCountry(country) : null;
  const perCapita = getPerCapitaConsumption(country);
  // وقتی گزارش تحلیلی مفصل ما رقم واردات واقعی و دقیق‌تری از آمار آینه‌ی (Mirror)
  // ITC Trade Map داره (مثل روسیه — که از ۲۰۲۲ گزارش‌دهی گمرکی خودش رو متوقف کرده
  // و ITC فقط ۴٬۴۸۹ تن به‌جای واردات واقعی ۲۰٬۴۰۰ تنی رو نشون می‌ده)، همین رقم
  // درست جایگزین آمار ناقص ترید مپ می‌شه. منبع این رقم می‌تونه competitors.json
  // باشه (کشورهای رقیب مثل روسیه/چین/ترکیه) یا country_profiles.json (بقیه‌ی
  // کشورها، مثل ازبکستان) — قاعده‌ی کلی: هر کشوری گزارش تحلیلی مفصل داره که
  // رقم واردات دقیق‌تری از ITC نتیجه گرفته، باید همین‌جا (در یکی از این دو
  // فایل) real_trade_stats بگیره تا آمار صفحه‌اش خودکار به‌روز بشه.
  const realTrade = getCompetitorForCountry(country)?.real_trade_stats || profile?.real_trade_stats || null;
  const econProfile = getCountryPopulation(country);
  // وقتی realTrade داریم، مصرف سرانه‌ی «برآورد جهانی بر پایه‌ی تیر درآمدی»
  // (پایین‌تر، perCapita) نشون داده نمی‌شه — اما این یعنی نباید مصرف سرانه رو
  // کلاً حذف کنیم؛ باید از رقم واقعی خودِ گزارش (imports_tons) تقسیم بر جمعیت
  // واقعی کشور محاسبه بشه، نه برآورد عمومی. نمونه: تاجیکستان با برآورد عمومی
  // ~۴۸ کیلوگرم/نفر (بر پایه‌ی میانگین تیر درآمدی) در برابر رقم واقعی محاسبه‌شده
  // از گزارش که به‌مراتب پایین‌تره.
  const realPerCapitaKg =
    realTrade?.imports_tons != null && econProfile?.population
      ? (realTrade.imports_tons * 1000) / econProfile.population
      : null;
  // کشورهای تولیدکننده‌ای که آمار ITC‌شان صحیح است (مثل هند): تولید/ظرفیت/مصرف ظاهری از گزارش، بدون
  // «اصلاح» واردات. مصرف سرانه از مصرف ظاهری (نه واردات) محاسبه می‌شه.
  const supply = profile?.supply_stats || null;
  // رقم سرانه‌ی خودِ گزارش (per_capita_kg؛ بر پایه‌ی جمعیت همان گزارش) اولویت دارد؛ وگرنه از جمعیت بانک جهانی محاسبه می‌شود.
  const supplyPerCapitaKg =
    supply?.per_capita_kg != null
      ? supply.per_capita_kg
      : supply?.apparent_consumption_tons != null && econProfile?.population
      ? (supply.apparent_consumption_tons * 1000) / econProfile.population
      : null;
  const unions = getUnionsForCountry(country);
  const sortedExhibitions = sortExhibitionsUpcomingFirst(exhibitions);
  const smartReport = reports.find((r) => r.report_type === "summary");

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumb={[
          { label: "داشبورد", href: "/" },
          { label: "کشورها و اتحادیه‌ها", href: "/countries" },
          { label: country },
        ]}
        title={country}
        actions={<PrintButton />}
        subtitle="پرونده‌ی کشور — آمار تجارت جهانی، شرکای تأمین، شرکت‌ها، نمایشگاه‌ها و گزارش‌های مرتبط."
      />

      {/* شناسنامه‌ی کشور — نوار تیره با مهم‌ترین اعداد، طبق طرح مرجع */}
      <CountryStatStrip
        country={country}
        iso2={trade?.iso2}
        stats={[
          iranExportToHere && {
            label: "صادرات ایران به این کشور (۱۴۰۴، ۱۰ ماهه)",
            value: iranExportToHere.tons.toLocaleString("fa-IR"),
            unit: "تن",
          },
          // اگه گزارش تحلیلی مفصل رقم واردات واقعی و دقیق‌تری داره (مثل روسیه)،
          // به‌جای آمار آینه‌ی ناقص ITC همون رو نشون می‌دیم — نه هر دو با هم.
          !realTrade && trade?.imports_2025?.value_usd_k != null && {
            label: "ارزش واردات (۲۰۲۵)",
            value: (trade.imports_2025.value_usd_k / 1000).toLocaleString("fa-IR", {
              maximumFractionDigits: 2,
            }),
            unit: "میلیون دلار",
          },
          !realTrade && trade?.imports_2025?.quantity != null && {
            label: "حجم واردات (۲۰۲۵)",
            value: trade.imports_2025.quantity.toLocaleString("fa-IR"),
            unit: "تن",
          },
          !realTrade && trade?.imports_2025?.unit_value_usd != null && {
            label: "قیمت میانگین واردات",
            value: trade.imports_2025.unit_value_usd.toLocaleString("fa-IR"),
            unit: "دلار/تن",
          },
          realTrade && {
            label: "حجم واردات واقعی (۲۰۲۵، نه رقم ناقص ITC)",
            value: realTrade.imports_tons.toLocaleString("fa-IR"),
            unit: "تن",
          },
          realTrade?.domestic_production_tons != null && {
            label: "تولید داخلی سالانه",
            value: realTrade.domestic_production_tons.toLocaleString("fa-IR"),
            unit: "تن",
          },
          realTrade?.apparent_consumption_min_tons != null && {
            label: "برآورد مصرف ظاهری داخلی",
            value: `${realTrade.apparent_consumption_min_tons.toLocaleString("fa-IR")}–${realTrade.apparent_consumption_max_tons.toLocaleString("fa-IR")}`,
            unit: "تن/سال",
          },
          supply?.capacity_tons != null && {
            label: "ظرفیت نصب‌شده‌ی تولید",
            value: supply.capacity_tons.toLocaleString("fa-IR"),
            unit: "تن/سال",
          },
          supply?.production_tons != null && {
            label: `تولید داخلی (${supply.production_period})`,
            value: supply.production_tons.toLocaleString("fa-IR"),
            unit: "تن",
          },
          supply?.apparent_consumption_tons != null && {
            label: "مصرف ظاهری داخلی (محاسباتی)",
            value: supply.apparent_consumption_tons.toLocaleString("fa-IR"),
            unit: "تن/سال",
          },
          supplyPerCapitaKg != null && {
            label: "مصرف سرانه (بر پایه‌ی گزارش)",
            value: supplyPerCapitaKg.toLocaleString("fa-IR", { maximumFractionDigits: 3 }),
            unit: "کیلوگرم/نفر",
          },
          trade?.export_trend?.cagr_pct != null && {
            label: `رشد سالانه‌ی صادرات (${String(trade.export_trend.first_year).replace(
              /\d/g,
              (d) => "۰۱۲۳۴۵۶۷۸۹"[d]
            )}–${String(trade.export_trend.last_year).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d])})`,
            value: `${trade.export_trend.cagr_pct > 0 ? "+" : ""}${trade.export_trend.cagr_pct.toLocaleString("fa-IR")}٪`,
          },
          companies.length > 0 && {
            label: "شرکت‌های شناسایی‌شده",
            value: companies.length.toLocaleString("fa-IR"),
            unit: "شرکت",
          },
          // برآورد سرانه‌ی جهانی یک حدس عمومی بر پایه‌ی جمعیت/سرانه‌ی متوسط جهانیه؛
          // وقتی گزارش تحلیلی مفصل رقم واقعی بازار رو داره (realTrade)، این تخمین
          // عمومی می‌تونه به‌شدت متفاوت و گمراه‌کننده باشه (مثلاً برای ازبکستان
          // ۴۸,۱۶۹ تن تخمین سرانه در برابر ۱۳,۰۰۰ تن واقعی گزارش) — پس هروقت رقم
          // واقعی داریم، این تخمین عمومی اصلاً نشون داده نمی‌شه.
          !realTrade && !supply && perCapita?.estimated_tons != null && {
            label: perCapita.is_population_based
              ? `برآورد بازار مصرف (${TIER_FA[perCapita.tier] || "بر پایه‌ی جمعیت"})`
              : "برآورد بازار مصرف سالانه",
            value: perCapita.estimated_tons.toLocaleString("fa-IR"),
            unit: "تن/سال",
          },
          !realTrade && !supply && perCapita && {
            label: `مصرف سرانه${perCapita.is_population_based ? ` (${TIER_FA[perCapita.tier] || "میانگین جهانی"})` : perCapita.is_estimated ? " (برآوردی)" : ""}`,
            value: perCapita.kg_per_capita.toLocaleString("fa-IR"),
            unit: "کیلوگرم/نفر",
          },
          // وقتی رقم واقعی داریم، به‌جای برآورد عمومی بالا، مصرف سرانه از خودِ
          // رقم گزارش (imports_tons) تقسیم بر جمعیت واقعی کشور محاسبه می‌شه —
          // نه یک میانگین تیر درآمدی حدسی.
          realTrade && realPerCapitaKg != null && {
            label: "مصرف سرانه (بر پایه‌ی گزارش)",
            value: realPerCapitaKg.toLocaleString("fa-IR", { maximumFractionDigits: 3 }),
            unit: "کیلوگرم/نفر",
          },
          exhibitions.length > 0 && {
            label: "نمایشگاه‌های مرتبط",
            value: exhibitions.length.toLocaleString("fa-IR"),
            unit: "رویداد",
          },
        ].filter(Boolean)}
      />

      {supply?.note && (
        <p className="text-xs text-text-muted leading-6 -mt-4">{supply.note}</p>
      )}

      <CountryEconomicProfile profile={econProfile} />

      {unions.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-1">عضویت در پیمان‌های تجاری چندجانبه</h2>
          <p className="text-xs text-text-muted mb-4">
            اتحادیه‌ها/پیمان‌هایی که {country} در آن‌ها عضو، ناظر یا شریک است — برای تعرفهٔ ترجیحی
            احتمالی و شناخت رقبای منطقه‌ای، جزئیات هر پیمان را ببینید.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {unions.map((u) => (
              <Link
                key={u.id}
                href={`/unions/${u.id}`}
                className="block border border-border rounded-lg p-3 hover:border-primary transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-text">{u.name_fa}</span>
                  <span className="text-[10px] text-text-muted shrink-0">{u.short_fa}</span>
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {u.type_fa} ·{" "}
                  {u.relation === "member"
                    ? "عضو"
                    : u.relation === "observer"
                    ? "عضو ناظر"
                    : u.relation === "partner"
                    ? "کشور شریک"
                    : "عضو وابسته"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {iranExports && <IranExportSection data={iranExports} />}

      {suppliers && <SupplierBreakdown data={suppliers} />}

      {shareHistory && <MarketShareTrend data={shareHistory} />}

      {trade && (trade.exports_2025 || trade.imports_2025) && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-1">آمار تجارت جهانی محصول (۲۰۲۵)</h2>
          <p className="text-xs text-text-muted mb-4">
            {realTrade
              ? "منبع صادرات: ITC Trade Map (رتبه‌بندی کلی جهانی، نه لزوماً رابطه‌ی تجاری با ایران) — منبع واردات: گزارش تحلیلی مفصل (اصلاح‌شده، جایگزین آمار ناقص ITC)."
              : "منبع: ITC Trade Map — رتبه‌بندی کلی جهانی این کشور، نه لزوماً رابطه‌ی تجاری با ایران."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {trade.exports_2025 && (
              <div className="rounded-lg border border-border border-s-4 border-s-primary p-4">
                <div className="text-xs font-bold text-primary-hover mb-2">صادرات</div>
                <dl className="text-sm space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-muted">ارزش کل</dt>
                    <dd className="font-medium">
                      {(trade.exports_2025.value_usd_k * 1000).toLocaleString("fa-IR")} دلار
                    </dd>
                  </div>
                  {trade.exports_2025.quantity != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-text-muted">حجم</dt>
                      <dd className="font-medium">
                        {trade.exports_2025.quantity.toLocaleString("fa-IR")} {unitFa(trade.exports_2025.quantity_unit)}
                      </dd>
                    </div>
                  )}
                  {trade.exports_2025.unit_value_usd != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-text-muted">قیمت میانگین</dt>
                      <dd className="font-bold text-primary-hover">
                        {trade.exports_2025.unit_value_usd.toLocaleString("fa-IR")} دلار/تن
                      </dd>
                    </div>
                  )}
                  {trade.exports_2025.share_world_pct != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-text-muted">سهم از صادرات جهانی</dt>
                      <dd className="font-medium">
                        {trade.exports_2025.share_world_pct.toLocaleString("fa-IR")}٪
                      </dd>
                    </div>
                  )}
                  {trade.exports_2025.growth_value_1y_pct != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-text-muted">رشد ارزش (۱ ساله)</dt>
                      <dd className="font-medium">
                        {trade.exports_2025.growth_value_1y_pct > 0 ? "+" : ""}
                        {trade.exports_2025.growth_value_1y_pct.toLocaleString("fa-IR")}٪
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
            {trade.imports_2025 && (
              <div className="rounded-lg border border-border border-s-4 border-s-petrol-400 p-4">
                <div className="text-xs font-bold text-text mb-2">
                  واردات
                  {realTrade && (
                    <span className="font-normal text-warning"> — اصلاح‌شده طبق گزارش تحلیلی</span>
                  )}
                </div>
                {realTrade ? (
                  // به‌جای آمار آینه‌ی (Mirror) ناقص ITC، مستقیم رقم واقعی گزارش
                  // تحلیلی مفصل رو نشون می‌دیم — نه اینکه عدد غلط رو نگه داریم و
                  // فقط کنارش هشدار بدیم. ارزش کل/قیمت میانگین/تعرفه‌ی ITC عمداً
                  // حذف شدن چون بر پایه‌ی همون حجم غلط محاسبه شده بودن و دیگه با
                  // حجم اصلاح‌شده هم‌خونی ندارن.
                  <div className="text-sm">
                    <div className="flex justify-between gap-2 mb-2">
                      <dt className="text-text-muted">حجم واقعی</dt>
                      <dd className="font-bold text-text">
                        {realTrade.imports_tons.toLocaleString("fa-IR")} تن
                      </dd>
                    </div>
                    {realTrade.imports_note && (
                      <p className="text-xs text-text-muted leading-6 pt-2 border-t border-border">
                        {realTrade.imports_note}
                      </p>
                    )}
                  </div>
                ) : (
                  <dl className="text-sm space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-text-muted">ارزش کل</dt>
                      <dd className="font-medium">
                        {(trade.imports_2025.value_usd_k * 1000).toLocaleString("fa-IR")} دلار
                      </dd>
                    </div>
                    {trade.imports_2025.quantity != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-text-muted">حجم</dt>
                        <dd className="font-medium">
                          {trade.imports_2025.quantity.toLocaleString("fa-IR")} {unitFa(trade.imports_2025.quantity_unit)}
                        </dd>
                      </div>
                    )}
                    {trade.imports_2025.unit_value_usd != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-text-muted">قیمت میانگین</dt>
                        <dd className="font-bold text-text">
                          {trade.imports_2025.unit_value_usd.toLocaleString("fa-IR")} دلار/تن
                        </dd>
                      </div>
                    )}
                    {profile?.tariff_note ? (
                      <div>
                        <dt className="text-text-muted">تعرفه‌ی گمرکی (طبق گزارش)</dt>
                        <dd className="text-xs leading-6 text-text mt-1">{profile.tariff_note}</dd>
                      </div>
                    ) : (
                      trade.imports_2025.avg_tariff_pct != null && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-text-muted">تعرفه‌ی گمرکی میانگین</dt>
                          <dd className="font-medium">
                            {trade.imports_2025.avg_tariff_pct.toLocaleString("fa-IR")}٪
                          </dd>
                        </div>
                      )
                    )}
                    {trade.imports_2025.growth_value_1y_pct != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-text-muted">رشد ارزش (۱ ساله)</dt>
                        <dd className="font-medium">
                          {trade.imports_2025.growth_value_1y_pct > 0 ? "+" : ""}
                          {trade.imports_2025.growth_value_1y_pct.toLocaleString("fa-IR")}٪
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            )}
          </div>

          {/* روند چندساله‌ی صادرات — یک عدد سالانه مهم‌تر از عدد یک سال است:
              نشان می‌دهد این مبدأ دارد سهم می‌گیرد یا از دست می‌دهد. */}
          {trade.export_trend?.cagr_pct != null && (
            <div className="mt-4 pt-4 border-t border-border">
              <ExportTrend trend={trade.export_trend} />
              <p className="text-[11px] text-text-muted mt-2">
                میانگین رشد سالانه‌ی مرکب ارزش صادرات بین {String(trade.export_trend.first_year).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d])} و{" "}
                {String(trade.export_trend.last_year).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d])} (ارقام هزار دلار، منبع ITC).
              </p>
            </div>
          )}
        </section>
      )}

      {profile?.port && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-3">نقشه‌ی مسیر و اطلاعات بازار</h2>
          <WorldRouteMap destPort={profile.port} destCountry={profile.country} distances={profile.distances_km || {}} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
            {profile.total_import_volume?.value != null && (
              <div className="border border-border border-s-4 border-s-primary rounded-lg p-3 bg-white shadow-sm">
                <div className="text-xs text-text-muted mb-1">کل واردات ({profile.total_import_volume.period})</div>
                <div className="font-bold text-primary-hover">
                  {profile.total_import_volume.value.toLocaleString("fa-IR")} {profile.total_import_volume.unit}
                </div>
              </div>
            )}
            {profile.top_trade_partners?.map((p, i) => (
              <div key={i} className="border border-border border-s-4 border-s-primary rounded-lg p-3 bg-white shadow-sm">
                <div className="text-xs text-text-muted mb-1">شریک تجاری #{i + 1}</div>
                <div className="font-bold">{p.country}</div>
                <div className="text-xs text-text-muted mt-1">{p.note}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {profile?.interactive_map && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-1">نقشهٔ تعاملی مسیرها</h2>
          <p className="text-xs text-text-muted mb-4">{profile.interactive_map.title}</p>
          <InteractiveMapFrame src={profile.interactive_map.src} title={profile.interactive_map.title} />
        </section>
      )}

      {smartReport && (
        <div>
          <Link
            href={`/reports/${smartReport.id}`}
            className="inline-block bg-primary text-white text-sm font-medium rounded-lg px-4 py-2.5 shadow-sm hover:bg-primary-hover hover:shadow-md transition-all"
          >
            مشاهده‌ی گزارش هوشمند کامل ({country}) ←
          </Link>
        </div>
      )}

      {reports.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-3">گزارش‌ها</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/reports/${r.id}`}
                  className="block border border-border rounded-lg p-3 hover:border-primary transition"
                >
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-text-muted mt-1">
                    {REPORT_TYPE_FA[r.report_type] || "گزارش"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prices.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-3">قیمت‌ها</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-text-muted border-b border-border">
                  <th className="py-2 pe-4">محصول</th>
                  <th className="py-2 pe-4">نوع قیمت</th>
                  <th className="py-2 pe-4">مقدار</th>
                  <th className="py-2 pe-4">تاریخ منبع</th>
                  <th className="py-2">منبع</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2 pe-4">{p.product}</td>
                    <td className="py-2 pe-4">{p.price_type}</td>
                    <td className="py-2 pe-4">
                      {formatPrice(p)}
                    </td>
                    <td className="py-2 pe-4 text-text-muted">{sourceDateFa(p.source_reported_date)}</td>
                    <td className="py-2">
                      {p.source_url ? (
                        <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {p.source_name}
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* فهرست کامل شرکت‌ها طولانی است؛ به‌جایش یک باکس خلاصه + ورود به صفحه‌ی شرکت‌های همین کشور */}
      {companies.length > 0 ? (
        <CompaniesEntryBox
          country={country}
          total={companies.length}
          withEmail={companies.filter((c) => isValidEmail(c.email)).length}
          gradeCounts={countByGrade(companies)}
        />
      ) : (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-1">شرکت‌ها</h2>
          <p className="text-sm text-text-muted">هنوز شرکتی برای این کشور ثبت نشده است.</p>
        </section>
      )}

      <section className="card p-5">
        <h2 className="text-lg font-bold mb-3">نمایشگاه‌ها ({sortedExhibitions.length}) — نزدیک‌ترین نمایشگاه آینده اول</h2>
        <ExhibitionTable exhibitions={sortedExhibitions} />
      </section>
    </div>
  );
}
