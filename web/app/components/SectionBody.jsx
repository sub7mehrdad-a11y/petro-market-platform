// متن بخش‌های گزارش گاهی یک جدول ساده‌ست که در استخراج به‌صورت خط‌های
// "ستون۱ | ستون۲ | ..." اومده (چون منبع اصلی جدول Word بوده)؛ این کامپوننت
// اون حالت رو به یک جدول واقعی تبدیل می‌کنه، وگرنه به‌صورت پاراگراف نرمال.
export default function SectionBody({ text }) {
  const lines = text.split("\n").filter((l) => l.trim());
  const pipeLines = lines.filter((l) => l.includes("|"));

  if (pipeLines.length >= 2 && pipeLines.length / lines.length > 0.5) {
    const rows = pipeLines.map((l) => l.split("|").map((c) => c.trim()));
    const [header, ...body] = rows;
    return (
      <div className="overflow-x-auto my-2">
        <table className="w-full text-sm border border-slate-200">
          <thead>
            <tr className="bg-slate-50">
              {header.map((h, i) => (
                <th key={i} className="py-1.5 px-3 text-right border-b border-slate-200">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, i) => (
              <tr key={i} className="border-b border-slate-100">
                {row.map((c, j) => (
                  <td key={j} className="py-1.5 px-3">{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-2 leading-7 text-sm">
      {lines.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}
