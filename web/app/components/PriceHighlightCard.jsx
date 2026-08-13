const PRICE_TYPE_FA = { domestic: "داخلی", FOB: "FOB", CIF: "CIF" };

export default function PriceHighlightCard({ label, record }) {
  const hasValue = record && record.value != null;

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-slate-500">{label}</span>
        {record && (
          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {PRICE_TYPE_FA[record.price_type] || record.price_type}
          </span>
        )}
      </div>
      {hasValue ? (
        <>
          <div className="text-xl font-bold text-slate-900 font-tabular">
            {record.value} <span className="text-sm font-normal text-slate-500">{record.currency}/{record.unit}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {record.source_url ? (
              <a href={record.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-sky-700">
                {record.source_name}
              </a>
            ) : record.source_name}
            {record.source_reported_date && <> · {record.source_reported_date}</>}
          </div>
        </>
      ) : (
        <div className="text-sm text-slate-400">داده‌ای در دسترس نیست</div>
      )}
    </div>
  );
}
