// بخش‌های عمومی پروفایل رقیب (فیلد `sections` در competitors.json) — متن و جدول‌های گزارش تحلیلی همان
// رقیب، عیناً. هر بخش: { title, blocks: [ {t:"h"|"p"|"ul"|"table", ...} ] }.

const NOT_FOUND = "یافت نشد";

function toneClass(text) {
  if (/^(بسیار پایین|پایین)/.test(text)) return "bg-emerald-50 text-emerald-700 font-bold";
  if (/^متوسط/.test(text)) return "bg-amber-50 text-amber-700 font-bold";
  if (/^زیاد/.test(text)) return "bg-rose-50 text-rose-700 font-bold";
  return "";
}

function isNumeric(text) {
  return /[۰-۹]/.test(text) && text.length <= 28 && !/[A-Za-z؀-ۿ]{6,}/.test(text.replace(/تا|حدود|تن|دلار|هزار|میلیون|درصد/g, ""));
}

function Table({ block }) {
  return (
    <div className="overflow-x-auto mb-4 rounded-lg border border-slate-200">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="bg-slate-50 text-right text-slate-600 border-b border-slate-200">
            {block.columns.map((c, i) => (
              <th key={i} className="py-2 px-3 font-semibold align-bottom">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r, ri) => {
            const bold = block.bold_first_prefix && r[0].startsWith(block.bold_first_prefix);
            return (
              <tr key={ri} className={`border-b border-slate-100 last:border-0 align-top ${bold ? "bg-slate-50 font-bold" : ""}`}>
                {r.map((cell, ci) => {
                  const tone = block.tone_col === ci ? toneClass(cell) : "";
                  const cls =
                    ci === 0 ? "font-medium text-petrol-900"
                    : cell === NOT_FOUND ? "text-slate-400 italic"
                    : isNumeric(cell) ? "font-tabular text-slate-700"
                    : "text-slate-600";
                  return (
                    <td key={ci} className={`py-2 px-3 leading-7 ${cls} ${tone}`}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ProfileSections({ sections }) {
  return (
    <>
      {sections.map((s, si) => (
        <section key={si} className="card p-5">
          <h2 className="text-lg font-bold text-petrol-900 mb-4">{s.title}</h2>
          {s.blocks.map((b, bi) => {
            if (b.t === "h") return <h3 key={bi} className="font-bold text-sm text-petrol-800 mt-5 mb-2">{b.text}</h3>;
            if (b.t === "p") return <p key={bi} className="text-sm leading-7 text-slate-700 mb-3">{b.text}</p>;
            if (b.t === "ul")
              return (
                <ul key={bi} className="list-disc pe-4 space-y-2 mb-3">
                  {b.items.map((it, ii) => (
                    <li key={ii} className="text-sm leading-7 text-slate-700">{it}</li>
                  ))}
                </ul>
              );
            if (b.t === "table") return <Table key={bi} block={b} />;
            return null;
          })}
        </section>
      ))}
    </>
  );
}
