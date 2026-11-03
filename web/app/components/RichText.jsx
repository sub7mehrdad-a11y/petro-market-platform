import { Fragment } from "react";

// نمایش سبک مارک‌داونِ خروجی مدل (بدون وابستگی): تیتر (#)، **پررنگ**، *مورب*، فهرست (- / * / ۱.)، جدول (|…|) و خط جداکننده.
// هر چیز دیگر متن ساده می‌ماند؛ هیچ HTML خامی تفسیر نمی‌شود (React متن را escape می‌کند).

function inline(text, keyBase) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(
      tok.startsWith("**")
        ? <strong key={`${keyBase}-${i++}`} className="font-bold">{tok.slice(2, -2)}</strong>
        : <em key={`${keyBase}-${i++}`}>{tok.slice(1, -1)}</em>
    );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export default function RichText({ text, className = "" }) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (isTableRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ t: "table", head, rows });
      continue;
    }
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (h) { blocks.push({ t: "h", text: h[2].replace(/\*\*/g, "") }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ t: "hr" }); i++; continue; }

    const li = line.match(/^(\s*)([-*•]|\d+[.)]|[۰-۹]+[.)])\s+(.*)$/);
    if (li) {
      const ordered = /^(\d|[۰-۹])/.test(li[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*•]|\d+[.)]|[۰-۹]+[.)])\s+(.*)$/);
        if (!m) break;
        items.push({ indent: m[1].length >= 2, text: m[3] });
        i++;
      }
      blocks.push({ t: "list", ordered, items });
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !isTableRow(lines[i]) && !/^\s*(#{1,6}\s|[-*•]\s|\d+[.)]\s)/.test(lines[i])) para.push(lines[i++]);
    blocks.push({ t: "p", text: para.join(" ") });
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((b, k) => {
        if (b.t === "h") return <h4 key={k} className="pt-1 text-sm font-bold text-text">{b.text}</h4>;
        if (b.t === "hr") return <hr key={k} className="border-border" />;
        if (b.t === "p") return <p key={k} className="text-sm leading-8 text-text">{inline(b.text, `p${k}`)}</p>;
        if (b.t === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={k} className={`space-y-1 ps-5 text-sm leading-8 text-text ${b.ordered ? "list-decimal" : "list-disc"}`}>
              {b.items.map((it, j) => <li key={j} className={it.indent ? "ms-4" : ""}>{inline(it.text, `l${k}-${j}`)}</li>)}
            </Tag>
          );
        }
        return (
          <div key={k} className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  {b.head.map((c, j) => <th key={j} className="px-2 py-1.5 text-start font-semibold">{inline(c, `th${k}-${j}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j} className="border-b border-border last:border-0">
                    {r.map((c, n) => <td key={n} className="px-2 py-1.5 text-text">{inline(c, `td${k}-${j}-${n}`)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
