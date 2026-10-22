"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";

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
  "هزینه تولید ترکیه چقدر است؟",
  "بزرگ‌ترین واردکنندگان جوش شیرین از ترکیه",
  "شرکت‌های خوراکی برزیل",
  "نمایشگاه‌های ترکیه",
  "چرا ترکیه در عراق برنده است؟",
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

export default function AskClient({ index }) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState(null);
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
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const data = await res.json();
      if (!res.ok) setAskError(data.error || "خطایی رخ داد.");
      else setAnswer(data);
    } catch (err) {
      setAskError(`ارتباط با سرور برقرار نشد: ${err.message}`);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="جست‌وجو و پرسش از پلتفرم"
        subtitle="همه‌ی محتوای سایت (گزارش‌ها، شرکت‌ها، نمایشگاه‌ها، اخبار تحلیلی، تحلیل رقبا و قیمت‌ها) یکجا جست‌وجو می‌شود. نتایج فوری بدون نیاز به اینترنت کار می‌کنند؛ برای «پاسخ هوشمند» سؤالتان به هوش مصنوعی داده می‌شود که فقط از همین محتوا جواب بسازد."
      />

      <form onSubmit={handleAsk} className="card p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="مثلاً: هزینه تولید ترکیه چقدر است؟"
            className="flex-1 border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          />
          <button
            type="submit"
            disabled={asking || !query.trim()}
            className="bg-primary text-white text-sm font-medium rounded-lg px-5 py-2.5 shadow-sm hover:bg-primary-hover hover:shadow-md transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {asking ? "در حال پاسخ..." : "پاسخ هوشمند"}
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

      {answer && (
        <section className="card border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            <h2 className="text-sm font-bold text-text">پاسخ هوشمند</h2>
          </div>
          <p className="text-sm leading-8 whitespace-pre-line text-text">{answer.answer}</p>

          {answer.sources?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-xs font-bold text-text-muted mb-2">منابع استفاده‌شده در پاسخ</div>
              <ul className="space-y-1.5">
                {answer.sources.map((s) => (
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
      )}

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
