import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTradeUnions, getTradeUnion, getCountries, getTradeMapForCountry, getUnionTradeStats, getReportsForUnion,
} from "@/lib/data";
import PageHeader from "../../components/PageHeader";

const IRAN_STATUS_STYLE = {
  fta_full: "bg-emerald-50 text-emerald-800 border-emerald-200",
  member: "bg-emerald-50 text-emerald-800 border-emerald-200",
  founding_member: "bg-emerald-50 text-emerald-800 border-emerald-200",
  observer: "bg-amber-50 text-amber-800 border-amber-200",
  not_member: "bg-slate-50 text-slate-500 border-slate-200",
  sanctioned_no_relation: "bg-slate-50 text-slate-500 border-slate-200",
};

const CET_LABEL = { true: "بله", false: "خیر", null: "نامشخص" };

const REPORT_TYPE_FA = { detailed: "گزارش مفصل", summary: "گزارش مدیریتی (خلاصه)" };

const NON_MEMBER_RELATION_GROUP = [
  { field: "observers", label: "اعضای ناظر" },
  { field: "partner_countries", label: "کشورهای شریک" },
  { field: "associate_countries", label: "اعضای وابسته" },
];

export function generateStaticParams() {
  return Object.keys(getTradeUnions()).map((id) => ({ id }));
}

function Section({ title, subtitle, children }) {
  return (
    <section className="card p-5">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-petrol-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function CountryChip({ name }) {
  const exists = getCountries().includes(name);
  const iso2 = getTradeMapForCountry(name)?.iso2;
  const content = (
    <>
      {iso2 && (
        <img
          src={`https://flagcdn.com/w40/${iso2}.png`}
          alt=""
          className="h-3.5 w-5 rounded-sm object-cover shrink-0"
        />
      )}
      <span className="truncate">{name}</span>
    </>
  );
  if (!exists) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-full px-2.5 py-1 bg-slate-50">
        {content}
      </span>
    );
  }
  return (
    <Link
      href={`/countries/${encodeURIComponent(name)}`}
      className="flex items-center gap-1.5 text-xs text-petrol-800 border border-slate-200 rounded-full px-2.5 py-1 bg-white hover:border-copper-500 hover:text-copper-800 transition-colors"
    >
      {content}
    </Link>
  );
}

function formatUsdK(valueK) {
  if (valueK == null) return "—";
  const usd = valueK * 1000;
  if (usd >= 1_000_000) return `${(usd / 1_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} میلیون دلار`;
  return `${Math.round(usd).toLocaleString("fa-IR")} دلار`;
}

const SOURCE_LABEL = { import_suppliers: "ITC Trade Map", market_share_history: "WITS" };

function MemberTradeRow({ row }) {
  const iso2 = getTradeMapForCountry(row.country)?.iso2;
  const exists = getCountries().includes(row.country);
  const nameCell = (
    <span className="flex items-center gap-1.5">
      {iso2 && <img src={`https://flagcdn.com/w40/${iso2}.png`} alt="" className="h-3.5 w-5 rounded-sm object-cover shrink-0" />}
      <span className="truncate">{row.country}</span>
    </span>
  );

  if (!row.hasData) {
    return (
      <tr className="border-b border-slate-100">
        <td className="py-2 pe-4">
          {exists ? (
            <Link href={`/countries/${encodeURIComponent(row.country)}`} className="hover:text-copper-700">
              {nameCell}
            </Link>
          ) : (
            nameCell
          )}
        </td>
        <td className="py-2 pe-4 text-slate-400" colSpan={3}>
          هنوز تفکیک واردات‌به‌مبدأ برای این کشور تحقیق نشده
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pe-4 font-medium">
        {exists ? (
          <Link href={`/countries/${encodeURIComponent(row.country)}`} className="hover:text-copper-700">
            {nameCell}
          </Link>
        ) : (
          nameCell
        )}
      </td>
      <td className="py-2 pe-4 font-tabular">
        {formatUsdK(row.total_usd_k)}
        {row.total_tons != null && (
          <span className="text-slate-400"> · {row.total_tons.toLocaleString("fa-IR")} تن</span>
        )}
      </td>
      <td className="py-2 pe-4 font-tabular">
        <span className={row.intra_share_pct >= 30 ? "font-bold text-emerald-700" : "text-slate-600"}>
          {row.intra_share_pct != null ? `${row.intra_share_pct.toLocaleString("fa-IR")}٪` : "—"}
        </span>
      </td>
      <td className="py-2 text-slate-500">
        {row.top_external_supplier
          ? `${row.top_external_supplier.country}${
              row.top_external_supplier.share_pct != null
                ? ` (${row.top_external_supplier.share_pct.toLocaleString("fa-IR")}٪)`
                : ""
            }`
          : "—"}
        <span className="text-[10px] text-slate-400"> · {SOURCE_LABEL[row.source]} {row.year}</span>
      </td>
    </tr>
  );
}

export default async function UnionPage({ params }) {
  const { id } = await params;
  const u = getTradeUnion(id);
  if (!u) notFound();
  const stats = getUnionTradeStats(id);
  const reports = getReportsForUnion(id);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "داشبورد", href: "/" },
          { label: "کشورها و اتحادیه‌ها", href: "/unions" },
          { label: "اتحادیه‌ها", href: "/unions" },
          { label: u.short_fa },
        ]}
        title={u.name_fa}
        subtitle={u.name_en}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-1">نوع پیمان</div>
          <div className="font-bold text-petrol-900 text-sm">{u.type_fa}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-1">تعرفهٔ خارجی مشترک (CET)</div>
          <div className="font-bold text-petrol-900 text-sm">{CET_LABEL[String(u.has_cet)]}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-1">وضعیت ایران</div>
          <div
            className={`inline-block text-xs font-medium rounded-full border px-2.5 py-1 mt-0.5 ${
              IRAN_STATUS_STYLE[u.iran_status] || IRAN_STATUS_STYLE.not_member
            }`}
          >
            {u.iran_status_fa}
          </div>
        </div>
      </div>

      <Section title="معرفی">
        <p className="text-sm text-slate-700 leading-7">{u.summary_fa}</p>
      </Section>

      {u.baking_soda_note_fa && (
        <Section title="کاربرد برای صادرات جوش شیرین پارس">
          <p className="text-sm text-copper-900 bg-copper-50 border border-copper-200 rounded-lg p-4 leading-7">
            {u.baking_soda_note_fa}
          </p>
        </Section>
      )}

      {reports.length > 0 && (
        <Section title="گزارش‌های تحلیلی">
          <ul className="grid gap-2 sm:grid-cols-2">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/reports/${r.id}`}
                  className="block border border-slate-200 rounded-lg p-3 hover:border-copper-600 transition"
                >
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {REPORT_TYPE_FA[r.report_type] || "گزارش"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {stats && (
        <Section
          title="حجم تجارت جوش شیرین اتحادیه (کد HS ۲۸۳۶۳۰)"
          subtitle={
            stats.members_with_data > 0
              ? `محاسبه‌شده از روی داده‌ی واقعیِ ${stats.members_with_data.toLocaleString("fa-IR")} عضو از ${stats.members_total.toLocaleString(
                  "fa-IR"
                )} — نه یک رقم دستی؛ با تکمیل تفکیک واردات‌به‌مبدأ هر کشور، این بخش خودکار به‌روز می‌شود.`
              : "هنوز برای هیچ‌کدام از اعضای این اتحادیه تفکیک واردات‌به‌مبدأ تحقیق نشده — با تکمیل تحقیق هر کشور، این بخش خودکار پر می‌شود."
          }
        >
          {stats.total_usd_k ? (
            <div className="grid gap-4 sm:grid-cols-3 mb-5">
              <div className="rounded-lg border border-slate-200 border-s-4 border-s-petrol-400 p-4">
                <div className="text-xs text-slate-500 mb-1">کل واردات شناخته‌شده (اعضای دارای داده)</div>
                <div className="font-bold font-tabular text-petrol-900">{formatUsdK(stats.total_usd_k)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 border-s-4 border-s-copper-500 p-4">
                <div className="text-xs text-slate-500 mb-1">واردات از داخل خودِ اتحادیه</div>
                <div className="font-bold font-tabular text-copper-800">
                  {formatUsdK(stats.intra_usd_k)}
                  {stats.intra_share_pct != null && (
                    <span className="text-sm text-copper-700"> ({stats.intra_share_pct.toLocaleString("fa-IR")}٪)</span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 border-s-4 border-s-slate-300 p-4">
                <div className="text-xs text-slate-500 mb-1">واردات از خارج اتحادیه</div>
                <div className="font-bold font-tabular text-slate-700">
                  {formatUsdK(stats.total_usd_k - (stats.intra_usd_k || 0))}
                  {stats.intra_share_pct != null && (
                    <span className="text-sm text-slate-500"> ({(100 - stats.intra_share_pct).toLocaleString("fa-IR")}٪)</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            stats.members_with_data === 0 && (
              <p className="text-sm text-slate-400 mb-5">هیچ رقمی برای نمایش نیست.</p>
            )
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-4">کشور عضو</th>
                  <th className="py-2 pe-4">کل واردات</th>
                  <th className="py-2 pe-4">سهم درون‌اتحادیه‌ای</th>
                  <th className="py-2">بزرگ‌ترین تأمین‌کننده‌ی خارجی</th>
                </tr>
              </thead>
              <tbody>
                {stats.member_rows.map((row) => (
                  <MemberTradeRow key={row.country} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {NON_MEMBER_RELATION_GROUP.map(({ field, label }) => {
        const list = u[field];
        if (!list?.length) return null;
        return (
          <Section key={field} title={`${label} (${list.length.toLocaleString("fa-IR")})`}>
            <div className="flex flex-wrap gap-2">
              {list.map((name) => (
                <CountryChip key={name} name={name} />
              ))}
            </div>
          </Section>
        );
      })}

      {u.member_note_fa && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-6">
          ⚠️ {u.member_note_fa}
        </p>
      )}
    </div>
  );
}
