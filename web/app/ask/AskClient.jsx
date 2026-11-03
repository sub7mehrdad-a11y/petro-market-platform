"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import RichText from "../components/RichText";

const TYPE_STYLE = {
  report: "bg-primary-soft text-primary-hover",
  competitor: "bg-primary-soft text-text",
  company: "bg-canvas text-text",
  exhibition: "bg-canvas text-text",
  news: "bg-warning-soft text-warning",
  turkeywatch: "bg-primary-soft text-text",
  price: "bg-success-soft text-success",
};

const EXAMPLES = [
  "با توجه به شرایط الان روی کدام کشورها و با چه شرایطی کار کنیم؟",
  "چرا عراق اولویت دارد و برای ورود به آن چه قیمتی بدهیم؟",
  "کدام کشور جدید ارزش تحقیق دارد؟",
  "برای ازبکستان چه گریدی و با چه مسیری پیشنهاد می‌کنی؟",
  "ترکیه کجا قابل‌شکست است؟",
];

function highlight(text, tokens) {
  if (!tokens.length) return text;
  const pattern = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = String(text).split(pattern);
  return parts.map((p, i) =>
    pattern.test(p) && tokens.some((t) => p.toLowerCase().includes(t.toLowerCase()))
      ? <mark key={i} className="bg-primary-soft text-primary-hover rounded px-0.5">{p}</mark>
      : <span key={i}>{p}</span>
  );
}

/** همان نرمال‌سازی سمت سرور، تا نتایج فوری با نتایج پاسخ هوشمند هم‌خوان باشد. */
function normalizeFa(str) {
  if (!str) return "";
  return String(str)
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[‌‏‎]/g, " ").replace(/[ً-ْ]/g, "")
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[،؛؟.,;:!?()[\]«»"'\-–—]/g, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

function snippet(body, tokens, len = 240) {
  if (!body) return "";
  const norm = normalizeFa(body);
  let idx = -1;
  for (const t of tokens) {
    const i = norm.indexOf(t);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) return body.slice(0, len) + (body.length > len ? "…" : "");
  const start = Math.max(0, idx - 60);
  return (start > 0 ? "…" : "") + body.slice(start, start + len) + (body.length > start + len ? "…" : "");
}

export default function AskClient({ index, brainPanel }) {
  const [query, setQuery] = useState("");
  // گفت‌وگو: هر نوبت {q, a} — برای سؤال‌های پیگیری، آخرین نوبت‌ها به مغز فرستاده می‌شود.
  const [turns, setTurns] = useState([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");

  const tokens = useMemo(
    () => normalizeFa(query).split(" ").filter((t) => t.length > 1),
    [query]
  );

  const results = useMemo(() => {
    const q = normalizeFa(query);
    if (!q) return [];
    return index
      .map((it) => {
        const titleNorm = normalizeFa(it.title);
        let score = 0;
        if (titleNorm.includes(q)) score += 40;
        if (it._norm.includes(q)) score += 30;
        for (const t of tokens) {
          if (titleNorm.includes(t)) score += 8;
          score += Math.min(it._norm.split(t).length - 1, 5) * 2;
        }
        return { it, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((r) => r.it);
  }, [index, query, tokens]);

  async function handleAsk(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setAsking(true);
    setAskError("");
    try {
      const history = turns
        .slice(0, 3)
        .reverse()
        .flatMap((t) => [
          { role: "user", text: t.q },
          { role: "model", text: t.a.answer },
        ]);
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, history }),
      });
      const data = await res.json();
      if (!res.ok) setAskError(data.error || "خطایی رخ داد.");
      else {
        setTurns((prev) => [{ q: query, a: data }, ...prev]);
        setQuery("");
      }
    } catch (err) {
      setAskError(`ارتباط با سرور برقرار نشد: ${err.message}`);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="مغز پلتفرم"
        subtitle="همه‌ی داده‌های پلتفرم (قیمت‌ها، رقبا، پرونده‌ی کشورها، شرکت‌ها، نمایشگاه‌ها، اخبار و حمل) یک‌جا خوانده، رتبه‌بندی و جمع‌بندی می‌شود. هر سؤالی بپرسید (مثلاً «الان روی کدام کشورها و با چه شرایطی کار کنیم؟») تا تحلیل و توصیه‌ی عملی بگیرید؛ جست‌وجوی کلیدواژه‌ای هم پایین همین صفحه است."
      />

      {brainPanel}

      <form onSubmit={handleAsk} className="card p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="مثلاً: با توجه به شرایط الان روی کدام کشورها کار کنیم؟"
            className="flex-1 border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          />
          <button
            type="submit"
            disabled={asking || !query.trim()}
            className="bg-primary text-white text-sm font-medium rounded-lg px-5 py-2.5 shadow-sm hover:bg-primary-hover hover:shadow-md transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {asking ? "مغز در حال تحلیل..." : "بپرس از مغز"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-xs text-text-muted self-center">نمونه:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuery(ex)}
              className="text-xs border border-border rounded-full px-3 py-1 hover:border-primary hover:text-primary cursor-pointer"
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {askError && (
        <div className="bg-warning-soft border border-warning rounded-lg p-4 text-sm text-warning leading-7">
          {askError}
        </div>
      )}

      {turns.map((t, ti) => (
        <section key={turns.length - ti} className="card border-border p-5">
          <div className="mb-3 rounded-lg bg-canvas px-3 py-2 text-sm font-semibold text-text">{t.q}</div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            <h2 className="text-sm font-bold text-text">{t.a.mode === "brain" ? "پاسخ مغز پلتفرم" : "پاسخ هوشمند (ساده)"}</h2>
            {t.a.mode === "basic" && t.a.brain_unavailable && (
              <span className="text-[11px] text-warning">مغز الان در دسترس نبود؛ پاسخ ساده داده شد</span>
            )}
          </div>
          <RichText text={t.a.answer} />

          {t.a.ungrounded_numbers?.length > 0 && (
            <p className="mt-3 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-xs leading-6 text-warning">
              ⚠ این عددها در داده‌های پلتفرم پیدا نشدند و برآورد/محاسبه‌ی مدل‌اند؛ پیش از تصمیم تأیید شوند:{" "}
              <span dir="ltr" className="font-semibold">{t.a.ungrounded_numbers.slice(0, 14).join("، ")}</span>
            </p>
          )}

          {t.a.sources?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-xs font-bold text-text-muted mb-2">قطعه‌های مرتبط استفاده‌شده در پاسخ</div>
              <ul className="space-y-1.5">
                {t.a.sources.map((s) => (
                  <li key={s.n} className="text-xs">
                    <span className="text-primary font-bold">[{s.n}]</span>{" "}
                    <Link href={s.url} className="text-primary hover:underline">{s.title}</Link>{" "}
                    <span className="text-text-muted">· {s.typeLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      <section className="card p-5">
        <h2 className="text-sm font-bold text-text mb-3">
          {query ? `نتایج جست‌وجو (${results.length})` : "برای شروع، چیزی بنویسید"}
        </h2>

        {query && results.length === 0 && (
          <p className="text-sm text-text-muted">چیزی پیدا نشد. عبارت دیگری را امتحان کنید.</p>
        )}

        <ul className="divide-y divide-border">
          {results.map((r) => (
            <li key={r.id} className="py-3 first:pt-0">
              <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${TYPE_STYLE[r.type] || "bg-canvas text-text"}`}>
                  {r.typeLabel}
                </span>
                <Link href={r.url} className="font-semibold text-sm text-primary-hover hover:underline">
                  {highlight(r.title, tokens)}
                </Link>
              </div>
              {r.subtitle && <div className="text-xs text-text-muted mb-1">{r.subtitle}</div>}
              <p className="text-sm text-text leading-7">
                {highlight(snippet(r.body, tokens), tokens)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
