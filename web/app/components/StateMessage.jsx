import Link from "next/link";

/**
 * پیام حالت‌های پایه (۴۰۴، خطا، خالی، بارگذاری، آفلاین) — الگوی طرح بسته‌ی ب (ui/…/state-*.html).
 * action: {label, onClick} یا {label, href}. role=alert فقط برای خطا.
 */
export default function StateMessage({ code, title, text, tone = "info", actions = [], busy = false }) {
  const toneCls = {
    info: "bg-primary-soft text-primary",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
  }[tone];
  return (
    <section
      className="card mx-auto my-10 flex max-w-xl flex-col items-center gap-3 p-8 text-center"
      role={tone === "danger" ? "alert" : "status"}
      aria-busy={busy || undefined}
    >
      <span className={`grid h-14 w-14 place-items-center rounded-full text-lg font-black ${toneCls}`} aria-hidden="true">
        {busy ? <span className="h-6 w-6 animate-spin rounded-full border-2 border-current border-e-transparent" /> : code || "!"}
      </span>
      <h1 className="text-xl font-black">{title}</h1>
      {text && <p className="text-sm leading-7 text-text-muted">{text}</p>}
      {actions.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {actions.map((a, i) =>
            a.href ? (
              <Link key={i} href={a.href} className={`btn hover:no-underline ${a.secondary ? "btn-secondary" : ""}`}>
                {a.label}
              </Link>
            ) : (
              <button key={i} type="button" onClick={a.onClick} className={`btn ${a.secondary ? "btn-secondary" : ""}`}>
                {a.label}
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}
