import Link from "next/link";

/**
 * سربرگ مشترک همه‌ی صفحات — روی بوم تیره.
 *
 * چرا مشترک شد: بوم صفحه از روشن به تیره رفت، و عنوان/زیرعنوان هر صفحه روی همان
 * بوم می‌نشیند (نه داخل کارت سفید). اگر هر صفحه رنگ‌های خودش را می‌نوشت، دیر یا
 * زود یکی‌شان با متن تیره روی زمینه‌ی تیره می‌ماند. این‌جا یک‌بار درست تعریف شده.
 *
 * breadcrumb: آرایه‌ای از {label, href} — آخرین آیتم بدون لینک است.
 * actions:   هر چیزی که سمت چپ سربرگ می‌نشیند (دکمه، جست‌وجو…).
 */
export default function PageHeader({ title, subtitle, breadcrumb, actions, children }) {
  return (
    <header className="border-b border-white/10 pb-5 mb-6">
      {breadcrumb?.length > 0 && (
        <nav className="text-xs text-petrol-300 mb-2 flex items-center gap-1.5 flex-wrap">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {item.href ? (
                <Link href={item.href} className="hover:text-copper-300 transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span className="text-petrol-200">{item.label}</span>
              )}
              {i < breadcrumb.length - 1 && <span className="text-petrol-400">/</span>}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-white leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-petrol-200 mt-1.5 leading-7 max-w-3xl">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {children}
    </header>
  );
}

/** دکمه‌ی اصلی مسی — همان CTA سمت چپ سربرگ در طرح. */
export function HeaderButton({ href, children }) {
  const className =
    "inline-flex items-center gap-2 rounded-full bg-copper-500 hover:bg-copper-600 " +
    "text-white text-sm font-semibold px-5 py-2.5 transition-colors";
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}
