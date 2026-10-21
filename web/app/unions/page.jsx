import Link from "next/link";
import { getTradeUnions, getUnionTradeStats } from "@/lib/data";
import PageHeader from "../components/PageHeader";

// وضعیت ایران در هر اتحادیه — یک برچسب کوتاه رنگی، برای اسکن سریع چشمی فهرست.
const IRAN_STATUS_STYLE = {
  fta_full: "bg-success-soft text-success border-success",
  member: "bg-success-soft text-success border-success",
  founding_member: "bg-success-soft text-success border-success",
  observer: "bg-warning-soft text-warning border-warning",
  not_member: "bg-canvas text-text-muted border-border",
  sanctioned_no_relation: "bg-canvas text-text-muted border-border",
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
    return <p className="text-[10px] text-text-muted border-t border-border pt-2">داده‌ی تجاری تفکیک‌شده هنوز ثبت نشده</p>;
  }
  return (
    <p className="text-[10px] text-text-muted border-t border-border pt-2">
      داده‌ی تجاری: {stats.members_with_data.toLocaleString("fa-IR")} از {stats.members_total.toLocaleString("fa-IR")} عضو
      {stats.intra_share_pct != null && (
        <>
          {" "}· <span className="font-medium text-primary">{stats.intra_share_pct.toLocaleString("fa-IR")}٪</span> تجارت درون‌اتحادیه‌ای
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
            className="text-sm text-text hover:text-text border border-primary hover:border-primary rounded-full px-4 py-2 transition-colors"
          >
            مشاهده‌ی کشورها ←
          </Link>
        }
      />

      <p className="text-xs text-text-muted -mt-2 leading-6 max-w-3xl">
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
              <h2 className="font-bold text-text text-sm leading-6">{u.name_fa}</h2>
              <span className="text-[10px] text-text-muted shrink-0">{u.short_fa}</span>
            </div>
            <p className="text-xs text-text-muted mb-3">{u.type_fa}</p>
            <p className="text-xs text-text leading-6 line-clamp-2 mb-3">{u.summary_fa}</p>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <span className="text-[11px] text-text-muted">
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
