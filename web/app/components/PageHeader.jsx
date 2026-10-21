import Link from "next/link";

/**
 * سربرگ مشترک همه‌ی صفحات — روی بوم روشن (طرح بسته‌ی الف).
 *
 * چرا مشترک شد: عنوان/زیرعنوان هر صفحه روی همان بوم می‌نشیند (نه داخل کارت
 * سفید). اگر هر صفحه رنگ‌های خودش را می‌نوشت، دیر یا زود یکی‌شان با متن روشن
 * روی زمینه‌ی روشن می‌ماند. این‌جا یک‌بار درست تعریف شده.
 *
 * breadcrumb: آرایه‌ای از {label, href} — آخرین آیتم بدون لینک است.
 * actions:   هر چیزی که سمت چپ سربرگ می‌نشیند (دکمه، جست‌وجو…).
 */
export default function PageHeader({ title, subtitle, breadcrumb, actions, children }) {
  return (
    <header className="mb-7">
      {breadcrumb?.length > 0 && (
        <nav aria-label="مسیر صفحه" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              {item.href ? (
                <Link href={item.href} className="hover:text-primary transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="font-medium text-text">{item.label}</span>
              )}
              {i < breadcrumb.length - 1 && <span aria-hidden="true">‹</span>}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-[28px] font-black text-text leading-[1.5]">{title}</h1>
          {subtitle && (
            <p className="mt-2 max-w-3xl text-sm leading-7 text-text-muted">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {children}
    </header>
  );
}

/** دکمه‌ی اصلی — CTA سمت چپ سربرگ. */
export function HeaderButton({ href, children }) {
  return href ? (
    <Link href={href} className="btn hover:no-underline">
      {children}
    </Link>
  ) : (
    <span className="btn">{children}</span>
  );
}
