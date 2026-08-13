function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function UpdateItem({ item, badge }) {
  return (
    <li className="border-s-2 border-s-copper-200 ps-3 py-1.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        {badge && (
          <span className="inline-block rounded-full bg-copper-50 text-copper-800 px-2 py-0.5 text-[10px] font-bold">
            {badge}
          </span>
        )}
        <span className="font-semibold text-sm leading-6">{item.headline}</span>
      </div>
      <p className="text-sm text-slate-600 leading-7 mt-0.5">{item.summary}</p>
      {item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-copper-700 hover:underline"
        >
          {hostOf(item.source_url)} ↗
        </a>
      )}
    </li>
  );
}

export default function TurkeyWatchFeed({ entries }) {
  if (!entries || entries.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        هنوز اجرای رصدی ثبت نشده. اسکریپت <code className="text-xs">scripts/turkey_watch_bot.py</code> را اجرا کنید.
      </p>
    );
  }

  const latest = entries[0];
  const older = entries.slice(1, 6);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-block w-2 h-2 rounded-full bg-copper-500 animate-pulse" />
        <span className="text-sm font-bold text-petrol-900">{latest.headline_fa}</span>
        <span className="text-xs text-slate-400">· {latest.date}</span>
      </div>

      {latest.company_updates?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 mb-2">اطلاعیه‌های شرکت‌های رقیب</h4>
          <ul className="space-y-3">
            {latest.company_updates.map((u, i) => (
              <UpdateItem key={i} item={u} badge={u.company} />
            ))}
          </ul>
        </div>
      )}

      {latest.logistics_updates?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 mb-2">حمل‌ونقل، کرایه‌ی بار و لجستیک</h4>
          <ul className="space-y-3">
            {latest.logistics_updates.map((u, i) => (
              <UpdateItem key={i} item={u} />
            ))}
          </ul>
        </div>
      )}

      {latest.market_note && (
        <div className="rounded-lg bg-petrol-50 border border-petrol-100 p-4">
          <h4 className="text-xs font-bold text-petrol-800 mb-1.5">معنی این‌ها برای ما</h4>
          <p className="text-sm leading-7 text-slate-700">{latest.market_note}</p>
        </div>
      )}

      {latest.sources?.length > 0 && (
        <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1 pt-1">
          <span>منابع رصدشده:</span>
          {latest.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-copper-700 hover:underline">
              {s.name}
            </a>
          ))}
        </div>
      )}

      {older.length > 0 && (
        <details className="pt-2 border-t border-slate-100">
          <summary className="cursor-pointer text-sm text-slate-500">
            رصدهای قبلی ({older.length})
          </summary>
          <div className="mt-3 space-y-3">
            {older.map((e, i) => (
              <div key={i} className="text-sm">
                <span className="text-xs text-slate-400">{e.date}</span>
                <p className="font-semibold leading-6">{e.headline_fa}</p>
                <p className="text-slate-600 leading-7 text-sm">{e.market_note}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
