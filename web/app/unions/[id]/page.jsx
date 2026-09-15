import Link from "next/link";
import { notFound } from "next/navigation";
import { getTradeUnions, getTradeUnion, getCountries, getTradeMapForCountry } from "@/lib/data";
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

const RELATION_GROUP = [
  { field: "members", label: "کشورهای عضو" },
  { field: "observers", label: "اعضای ناظر" },
  { field: "partner_countries", label: "کشورهای شریک" },
  { field: "associate_countries", label: "اعضای وابسته" },
];

export function generateStaticParams() {
  return Object.keys(getTradeUnions()).map((id) => ({ id }));
}

function Section({ title, children }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold text-petrol-900 mb-3">{title}</h2>
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

export default async function UnionPage({ params }) {
  const { id } = await params;
  const u = getTradeUnion(id);
  if (!u) notFound();

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

      {RELATION_GROUP.map(({ field, label }) => {
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
