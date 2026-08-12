function Block({ block }) {
  if (block.type === "heading") {
    const Tag = block.level <= 1 ? "h2" : "h3";
    const cls = block.level <= 1 ? "text-xl font-bold mt-6 mb-2" : "text-lg font-semibold mt-4 mb-2";
    return <Tag className={cls}>{block.text}</Tag>;
  }
  if (block.type === "list_item") {
    return <li className="leading-7">{block.text}</li>;
  }
  if (block.type === "table") {
    return (
      <div className="overflow-x-auto my-3">
        <table className="w-full text-sm border border-slate-200">
          <thead>
            <tr className="bg-slate-50">
              {block.headers.map((h, i) => (
                <th key={i} className="py-1.5 px-3 text-right border-b border-slate-200">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
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
  return <p className="leading-7">{block.text}</p>;
}

export default function DetailedReportView({ blocks }) {
  // list_item‌های پشت‌سرهم رو توی یک <ul> بگیر تا بولت درست نمایش داده بشه
  const grouped = [];
  for (const b of blocks) {
    const last = grouped[grouped.length - 1];
    if (b.type === "list_item" && last?.type === "list_group") {
      last.items.push(b);
    } else if (b.type === "list_item") {
      grouped.push({ type: "list_group", items: [b] });
    } else {
      grouped.push(b);
    }
  }

  return (
    <article className="max-w-none">
      {grouped.map((b, i) =>
        b.type === "list_group" ? (
          <ul key={i} className="list-disc pr-5 space-y-1 my-2">
            {b.items.map((item, j) => (
              <Block key={j} block={item} />
            ))}
          </ul>
        ) : (
          <Block key={i} block={b} />
        )
      )}
    </article>
  );
}
