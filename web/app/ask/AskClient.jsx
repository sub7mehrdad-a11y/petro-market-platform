"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const TYPE_STYLE = {
  report: "bg-copper-50 text-copper-800",
  competitor: "bg-petrol-100 text-petrol-800",
  company: "bg-slate-100 text-slate-700",
  exhibition: "bg-slate-100 text-slate-700",
  news: "bg-amber-50 text-amber-800",
  turkeywatch: "bg-petrol-100 text-petrol-800",
  price: "bg-emerald-50 text-emerald-800",
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
      ? <mark key={i} className="bg-copper-100 text-copper-900 rounded px-0.5">{p}</mark>
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
      <div>
        <h1 className="text-xl font-bold">جست‌وجو و پرسش از پلتفرم</h1>
        <p className="text-sm text-slate-500 mt-1">
          همه‌ی محتوای سایت (گزارش‌ها، شرکت‌ها، نمایشگاه‌ها، اخبار تحلیلی، تحلیل رقبا و قیمت‌ها)
          یکجا جست‌وجو می‌شود. نتایج فوری بدون نیاز به اینترنت کار می‌کنند؛ برای «پاسخ هوشمند»
          سؤالتان به هوش مصنوعی داده می‌شود که فقط از همین محتوا جواب بسازد.
        </p>
      </div>

      <form onSubmit={handleAsk} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="مثلاً: هزینه تولید ترکیه چقدر است؟"
            className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-copper-500 focus:border-copper-500"
          />
          <button
            type="submit"
            disabled={asking || !query.trim()}
            className="bg-copper-700 text-white text-sm font-medium rounded-lg px-5 py-2.5 shadow-sm hover:bg-copper-800 hover:shadow-md transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {asking ? "در حال پاسخ..." : "پاسخ هوشمند"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-xs text-slate-400 self-center">نمونه:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuery(ex)}
              className="text-xs border border-slate-200 rounded-full px-3 py-1 hover:border-copper-500 hover:text-copper-700 cursor-pointer"
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {askError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 leading-7">
          {askError}
        </div>
      )}

      {answer && (
        <section className="bg-white border border-copper-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block w-2 h-2 rounded-full bg-copper-500" />
            <h2 className="text-sm font-bold text-petrol-900">پاسخ هوشمند</h2>
          </div>
          <p className="text-sm leading-8 whitespace-pre-line text-slate-800">{answer.answer}</p>

          {answer.sources?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-500 mb-2">منابع استفاده‌شده در پاسخ</div>
              <ul className="space-y-1.5">
                {answer.sources.map((s) => (
                  <li key={s.n} className="text-xs">
                    <span className="font-tabular text-copper-700 font-bold">[{s.n}]</span>{" "}
                    <Link href={s.url} className="text-copper-700 hover:underline">{s.title}</Link>{" "}
                    <span className="text-slate-400">· {s.typeLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-bold text-petrol-900 mb-3">
          {query ? `نتایج جست‌وجو (${results.length})` : "برای شروع، چیزی بنویسید"}
        </h2>

        {query && results.length === 0 && (
          <p className="text-sm text-slate-500">چیزی پیدا نشد. عبارت دیگری را امتحان کنید.</p>
        )}

        <ul className="divide-y divide-slate-100">
          {results.map((r) => (
            <li key={r.id} className="py-3 first:pt-0">
              <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${TYPE_STYLE[r.type] || "bg-slate-100 text-slate-700"}`}>
                  {r.typeLabel}
                </span>
                <Link href={r.url} className="font-semibold text-sm text-copper-800 hover:underline">
                  {highlight(r.title, tokens)}
                </Link>
              </div>
              {r.subtitle && <div className="text-xs text-slate-500 mb-1">{r.subtitle}</div>}
              <p className="text-sm text-slate-600 leading-7">
                {highlight(snippet(r.body, tokens), tokens)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
