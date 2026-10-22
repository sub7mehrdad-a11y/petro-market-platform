"use client";

/**
 * صفحه‌بندی ساده برای بانک‌های بزرگ (شرکت‌ها، نمایشگاه‌ها).
 * page از صفر شروع می‌شود؛ هر تغییر فیلتر باید page را صفر کند (کار والد).
 */
export default function Pagination({ page, pageSize, total, onChange, label = "رکورد" }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const fa = (n) => n.toLocaleString("fa-IR");

  return (
    <nav aria-label="صفحه‌بندی" className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={page <= 0}
          onClick={() => onChange(page - 1)}
        >
          قبلی
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={page >= pages - 1}
          onClick={() => onChange(page + 1)}
        >
          بعدی
        </button>
      </div>
      <p className="text-xs text-text-muted" aria-live="polite">
        {fa(from)}–{fa(to)} از {fa(total)} {label} · صفحه‌ی {fa(page + 1)} از {fa(pages)}
      </p>
    </nav>
  );
}
