import Link from "next/link";
import { getTradeUnions, getUnionTradeStats } from "@/lib/data";
import PageHeader from "../components/PageHeader";

// وضعیت ایران در هر اتحادیه — یک برچسب کوتاه رنگی، برای اسکن سریع چشمی فهرست.
const IRAN_STATUS_STYLE = {
  fta_full: "bg-emerald-50 text-emerald-800 border-emerald-200",
  member: "bg-emerald-50 text-emerald-800 border-emerald-200",
  founding_member: "bg-emerald-50 text-emerald-800 border-emerald-200",
  observer: "bg-amber-50 text-amber-800 border-amber-200",
  not_member: "bg-slate-50 text-slate-500 border-slate-200",
  sanctioned_no_relation: "bg-slate-50 text-slate-500 border-slate-200",
};

const IRAN_STATUS_LABEL = {
  fta_full: "تجارت آزاد با ایران",
  member: "ایران عضو است",
  founding_member: "ایران عضو مؤسس",
  observer: "ایران عضو ناظر",
  not_member: "ایران عضو نیست",
  sanctioned_no_relation: "بدون رابطه (تحریم)",
};

function memberCount(u) {
  return (u.members || []).length;
}

// خلاصه‌ی یک‌خطی «چند درصد داده داریم و سهم تجارت درون‌اتحادیه‌ای چقدره» —
// از getUnionTradeStats که خودش از روی داده‌ی کشورهای تحقیق‌شده محاسبه می‌شه،
// نه یک رقم ذخیره‌شده.
function TradeCoverageBadge({ unionId }) {
  const stats = getUnionTradeStats(unionId);
  if (!stats || stats.members_with_data === 0) {
    return <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-2">داده‌ی تجاری تفکیک‌شده هنوز ثبت نشده</p>;
  }
  return (
    <p className="text-[10px] text-slate-500 border-t border-slate-100 pt-2">
      داده‌ی تجاری: {stats.members_with_data.toLocaleString("fa-IR")} از {stats.members_total.toLocaleString("fa-IR")} عضو
      {stats.intra_share_pct != null && (
        <>
          {" "}· <span className="font-medium text-copper-700">{stats.intra_share_pct.toLocaleString("fa-IR")}٪</span> تجارت درون‌اتحادیه‌ای
        </>
      )}
    </p>
  );
}

export default function UnionsPage() {
  const unions = Object.values(getTradeUnions()).sort((a, b) => memberCount(b) - memberCount(a));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "داشبورد", href: "/" }, { label: "کشورها و اتحادیه‌ها", href: "/countries" }, { label: "اتحادیه‌ها" }]}
        title={`اتحادیه‌ها و پیمان‌های تجاری (${unions.length.toLocaleString("fa-IR")})`}
        subtitle="نقشهٔ مرجع مهم‌ترین اتحادیه‌ها، ائتلاف‌ها و مناطق تجارت آزاد جهان — کدام کشورها عضوند، وضعیت ایران در هر کدام، و کاربرد آن برای صادرات جوش شیرین پارس."
        actions={
          <Link
            href="/countries"
            className="text-sm text-petrol-100 hover:text-white border border-white/15 hover:border-white/30 rounded-full px-4 py-2 transition-colors"
          >
            مشاهده‌ی کشورها ←
          </Link>
        }
      />

      <p className="text-xs text-petrol-300 -mt-2 leading-6 max-w-3xl">
        برگرفته از پژوهش «اتحادیه‌ها و پیمان‌های چندجانبه اقتصادی جهان» (شهریور ۱۴۰۵). ارقام تعرفه‌ای این
        صفحه میانگین‌های عمومی/نمونه‌اند، نه تعرفهٔ دقیق کد HS ۲۸۳۶۳۰ در هر کشور — پیش از هر تصمیم تجاری،
        رقم دقیق را از Trade Map (ITC)، Market Access Map یا گمرک کشور مقصد استعلام بگیرید.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {unions.map((u) => (
          <Link
            key={u.id}
            href={`/unions/${u.id}`}
            className="group block card card-hover overflow-hidden p-4"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h2 className="font-bold text-petrol-900 text-sm leading-6">{u.name_fa}</h2>
              <span className="text-[10px] text-slate-400 shrink-0">{u.short_fa}</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">{u.type_fa}</p>
            <p className="text-xs text-slate-600 leading-6 line-clamp-2 mb-3">{u.summary_fa}</p>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <span className="text-[11px] text-slate-500">
                {memberCount(u).toLocaleString("fa-IR")} کشور عضو
              </span>
              <span
                className={`text-[10px] font-medium rounded-full border px-2 py-0.5 ${
                  IRAN_STATUS_STYLE[u.iran_status] || IRAN_STATUS_STYLE.not_member
                }`}
              >
                {IRAN_STATUS_LABEL[u.iran_status] || "نامشخص"}
              </span>
            </div>
            <TradeCoverageBadge unionId={u.id} />
          </Link>
        ))}
      </div>
    </div>
  );
}
