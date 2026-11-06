import Link from "next/link";
import { getBrainBriefing, getBrainScores, getBrainRadar } from "@/lib/brain";
import { gregorianFa } from "@/lib/dateFormat";

const STANCE_STYLE = {
  "تمرکز": "bg-success-soft text-success",
  "ادامه": "bg-primary-soft text-primary-hover",
  "آزمایشی": "bg-warning-soft text-warning",
};
const TIER_STYLE = {
  A: "bg-success-soft text-success",
  B: "bg-primary-soft text-primary-hover",
  C: "bg-canvas text-text-muted",
};

// برچسب‌هایی که اعتماد به عدد یک کشور را محدود می‌کنند (همان‌ها که build_brain.py می‌زند)
const FLAG_FA = {
  unit_value_suspect: "ارزش واحد مشکوک (نیاز به تأیید)",
  shares_from_text: "سهم تأمین‌کنندگان از متن پرونده",
  distance_estimated: "فاصله برآوردی هوایی",
  dual_role: "بازار و رقیب هم‌زمان",
  from_competitor_doc: "پرونده از سند رقیب",
};

function Bullets({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3">
      <div className={`mb-1 text-[11px] font-bold ${tone || "text-text-muted"}`}>{title}</div>
      <ul className="space-y-1">
        {items.map((t, i) => (
          <li key={i} className="flex gap-1.5 text-sm leading-7 text-text">
            <span className="shrink-0 text-primary">◂</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CountryLink({ name }) {
  return (
    <Link href={`/countries/${name}`} className="font-bold text-primary-hover hover:underline">
      {name}
    </Link>
  );
}

// بخش بالای صفحه‌ی «مغز پلتفرم»: توصیه‌ی هفته (ساخته‌ی هوش مصنوعی از کل داده‌ها) + رتبه‌بندی شفاف کشورها (محاسبه با کد).
export default function BrainPanel() {
  const briefing = getBrainBriefing();
  const scores = getBrainScores();
  const radar = getBrainRadar();
  const scoreOf = Object.fromEntries((scores?.countries || []).map((c) => [c.country, c]));

  return (
    <div className="space-y-6">
      {briefing ? (
        <section className="card border-primary p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-text">
              <span className="inline-block h-2 w-2 rounded-full bg-primary" />
              توصیه‌ی هفته‌ی مغز پلتفرم
            </h2>
            <span className="text-[11px] text-text-muted">
              {gregorianFa(briefing.generated_at?.slice(0, 10))} · تحلیل هوش مصنوعی از روی همه‌ی داده‌های پلتفرم
            </span>
          </div>
          <p className="text-base font-bold leading-8 text-text">{briefing.headline}</p>
          <p className="mt-1 text-sm leading-8 text-text">{briefing.summary}</p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {briefing.priorities.map((p, i) => {
              const s = scoreOf[p.country];
              return (
                <article key={p.country} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-text-muted">{i + 1}.</span>
                    <CountryLink name={p.country} />
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STANCE_STYLE[p.stance] || "bg-canvas text-text"}`}>{p.stance}</span>
                    {s && <span className="text-[11px] text-text-muted">امتیاز {s.score} · رتبه {s.rank}</span>}
                  </div>
                  <Bullets title="چرا" items={p.why} />
                  <Bullets title="با چه شرایطی" items={p.conditions} />
                  <Bullets title="ریسک‌ها" items={p.risks} tone="text-warning" />
                  <Bullets title="قدم بعدی" items={p.next_steps} tone="text-primary-hover" />
                </article>
              );
            })}
          </div>

          {briefing.pause_or_deprioritize?.length > 0 && (
            <Bullets
              title="فعلاً مکث / اولویت پایین"
              tone="text-warning"
              items={briefing.pause_or_deprioritize.map((p) => `${p.country}: ${p.reason}`)}
            />
          )}
          {briefing.radar_picks?.length > 0 && (
            <Bullets
              title="رادار: کشورهای جدید ارزش تحقیق"
              items={briefing.radar_picks.map((p) => `${p.country}: ${p.reason}${p.research_needed ? ` — تحقیق لازم: ${p.research_needed}` : ""}`)}
            />
          )}
          {briefing.market_signals?.length > 0 && <Bullets title="سیگنال‌های بازار این هفته" items={briefing.market_signals} />}
          {briefing.data_gaps?.length > 0 && <Bullets title="خلأهای داده" items={briefing.data_gaps} tone="text-text-muted" />}
        </section>
      ) : (
        <section className="card p-5 text-sm leading-8 text-text-muted">
          توصیه‌ی هفته هنوز ساخته نشده است. با تنظیم کلید اختصاصی مغز (<code>GEMINI_API_KEY_BRAIN</code>) ربات روزانه آن را
          می‌سازد؛ رتبه‌بندی شفاف کشورها پایین همین‌جا آماده است.
        </section>
      )}

      {scores?.countries?.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-bold text-text">رتبه‌بندی کشورهای هدف</h2>
          <p className="mb-3 text-xs leading-6 text-text-muted">
            امتیاز ۰ تا ۱۰۰ با فرمول شفاف از داده‌های ثبت‌شده محاسبه می‌شود (اندازه‌ی بازار ۲۸٪، حاشیه‌ی قیمت واردات ۱۴٪، رقابت ترکیه/چین ۱۴٪،
            نزدیکی به ایران ۱۴٪، رشد ۱۰٪، تعرفه و توافق تجاری ۱۰٪، بانک شرکت‌ها ۱۰٪). وزن‌ها در <code>data/brain/scoring_config.json</code>
            قابل تغییرند. آخرین محاسبه: {gregorianFa(scores.generated_at?.slice(0, 10))}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted">
                  <th className="px-2 py-2 text-start">#</th>
                  <th className="px-2 py-2 text-start">کشور</th>
                  <th className="px-2 py-2 text-start">امتیاز</th>
                  <th className="px-2 py-2 text-start">رده</th>
                  <th className="px-2 py-2 text-start">نقاط قوت</th>
                  <th className="px-2 py-2 text-start">نقاط ضعف</th>
                </tr>
              </thead>
              <tbody>
                {scores.countries.map((c) => (
                  <tr key={c.country} className="border-b border-border last:border-0 align-top">
                    <td className="px-2 py-2 text-text-muted">{c.rank}</td>
                    <td className="px-2 py-2">
                      <CountryLink name={c.country} />
                      {c.flags?.length > 0 && (
                        <div className="mt-0.5 text-[10px] leading-4 text-warning">⚠ {c.flags.map((f) => FLAG_FA[f] || f).join("، ")}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 font-semibold text-text" dir="ltr" style={{ textAlign: "start" }}>{c.score}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TIER_STYLE[c.tier]}`}>{c.tier}</span>
                    </td>
                    <td className="px-2 py-2 text-xs leading-6 text-text">{c.strengths.join("، ") || "—"}</td>
                    <td className="px-2 py-2 text-xs leading-6 text-text-muted">{c.weaknesses.join("، ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {radar?.candidates?.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-bold text-primary-hover">
                رادار: کشورهای بدون پرونده‌ی تحقیقاتی که از روی آمار Trade Map ارزش بررسی دارند
              </summary>
              <ul className="mt-2 space-y-1 text-xs leading-6 text-text">
                {radar.candidates.map((r, i) => (
                  <li key={r.country}>
                    {i + 1}. <span className="font-semibold">{r.country}</span> — امتیاز اولیه {r.score}؛ واردات {Math.round(r.import_tons).toLocaleString("en-US")} تن
                    {r.unit_value_usd ? `، ارزش واحد ${Math.round(r.unit_value_usd)} دلار/تن` : ""}
                    {r.growth_5y_pct != null ? `، رشد ۵ساله ${r.growth_5y_pct}٪` : ""}
                    {r.companies_in_bank ? `، ${r.companies_in_bank} شرکت در بانک` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
