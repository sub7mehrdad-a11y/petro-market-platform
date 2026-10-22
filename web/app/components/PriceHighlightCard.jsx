import { sourceDateFa, gregorianFa, jalaliFa } from "@/lib/dateFormat";
const PRICE_TYPE_FA = { domestic: "داخلی", FOB: "FOB", CIF: "CIF" };

export default function PriceHighlightCard({ label, record, isStale }) {
  const hasValue = record && record.value != null;

  return (
    <div
      className={`border border-border rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow border-s-4 ${
        hasValue ? (isStale ? "border-s-primary" : "border-s-primary") : "border-s-border"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-muted">{label}</span>
        {record && (
          <span className="inline-block rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-text">
            {PRICE_TYPE_FA[record.price_type] || record.price_type}
          </span>
        )}
      </div>
      {hasValue ? (
        <>
          <div className="text-xl font-bold text-text">
            {record.value} <span className="text-sm font-normal text-text-muted">{record.currency}/{record.unit}</span>
          </div>
          <div className="text-xs text-text-muted mt-1">
            {record.source_url ? (
              <a href={record.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                {record.source_name}
              </a>
            ) : record.source_name}
            {record.source_reported_date && <> · {sourceDateFa(record.source_reported_date)}</>}
          </div>
          {isStale && (
            <div className="text-[11px] text-primary mt-1.5 bg-primary-soft rounded px-1.5 py-0.5 inline-block">
              امروز داده‌ی جدید در دسترس نبود — آخرین قیمت واقعی (تاریخ جمع‌آوری: {record.batch_date})
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-text-muted">داده‌ای در دسترس نیست</div>
      )}
    </div>
  );
}
