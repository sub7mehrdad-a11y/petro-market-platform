"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/**
 * پوسته‌ی برنامه — سایدبار سمت راست + نوار بالایی + کشوی موبایل (طرح بسته‌ی الف/ب:
 * ui/sepehran-package-b/shell.html).
 *
 * - دسکتاپ (≥۱۰۲۴): سایدبار ۲۴۸ پیکسل، قابل جمع‌شدن به ۸۰ پیکسل (وضعیت در localStorage؛
 *   اگر در دسترس نبود هم صفحه درست کار می‌کند).
 * - موبایل/تبلت: نوار بالایی با دکمه‌ی منو؛ منو کشو است، Escape می‌بندد و فوکوس به دکمه برمی‌گردد.
 * - نقش/یوزرنیم عمداً پراپ سروری نیست (توضیح در layout.js) — از /api/auth/me خوانده می‌شود
 *   تا صفحات کشور/رقیب/گزارش استاتیک بمانند.
 * - نمایش «ابزارهای بازرگانی» فقط برای نقش commercial و وقتی outreachEnabled است؛ حفاظت
 *   واقعی مسیر در proxy.js است و این فقط پنهان‌کردن لینک.
 */

const ROLE_LABELS = { viewer: "مشاهده‌گر", commercial: "بازرگانی" };

function buildNavGroups(showOutreach, role) {
  return [
    { items: [{ href: "/", label: "داشبورد", icon: IconDashboard }] },
    {
      title: "تحلیل بازار",
      items: [
        { href: "/countries", label: "کشورها و اتحادیه‌ها", icon: IconGlobe, extraActivePrefixes: ["/unions"] },
        { href: "/competitors", label: "تحلیل رقبا", icon: IconCompetitors },
        { href: "/transit", label: "تحلیل ترانزیت", icon: IconTransit },
      ],
    },
    {
      title: "محتوا",
      items: [
        { href: "/reports", label: "گزارش‌های هوشمند", icon: IconReport },
        { href: "/archive", label: "آرشیو گزارش‌ها", icon: IconArchive },
        { href: "/news", label: "اخبار تحلیلی", icon: IconNews },
      ],
    },
    {
      title: "بانک اطلاعات",
      items: [
        { href: "/companies", label: "شرکت‌ها", icon: IconBuilding },
        { href: "/exhibitions", label: "نمایشگاه‌ها", icon: IconExhibition },
      ],
    },
    { items: [{ href: "/ask", label: "جست‌وجو و پرسش", icon: IconSearch }] },
    ...(showOutreach && role === "commercial"
      ? [{ title: "ابزارهای بازرگانی", items: [{ href: "/outreach", label: "ایمیل معرفی", icon: IconMail }] }]
      : []),
  ];
}

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, onNavigate, collapsed }) {
  // «کشورها و اتحادیه‌ها» باید موقع مرور /unions هم فعال دیده شود (دو مسیر پشت یک آیتم).
  const active =
    isActive(pathname, item.href) || (item.extraActivePrefixes || []).some((p) => isActive(pathname, p));
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      className={`relative my-0.5 flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition-colors ${
        collapsed ? "justify-center px-2.5" : ""
      } ${
        active
          ? "bg-primary-soft font-bold text-primary"
          : "font-medium text-text-muted hover:bg-surface-soft hover:text-primary"
      }`}
    >
      {active && <span className="absolute inset-y-[13px] start-0 w-[3px] rounded bg-primary" />}
      <Icon />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function Brand({ collapsed }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3 text-text hover:no-underline">
      <img
        src="/logo.png"
        width={52}
        height={52}
        alt="آرم رسمی شرکت"
        className="h-[52px] w-[52px] shrink-0 rounded-lg bg-white object-contain"
      />
      {!collapsed && (
        <span className="min-w-0 leading-[1.7]">
          <strong className="block text-sm font-black">
            تحقیق و توسعه
            <br />
            سپهران شیمی
          </strong>
          <small className="block text-[11px] text-text-muted">هوش تجاری بازار جوش شیرین</small>
        </span>
      )}
    </Link>
  );
}

function SidebarFoot({ username, role, collapsed }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="mt-auto border-t border-border pt-4">
      <div className={`flex items-center gap-2.5 rounded-xl bg-canvas p-3 ${collapsed ? "justify-center bg-transparent p-0" : ""}`}>
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          <IconUser />
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 text-xs">
            <strong className="block truncate">{username || "حساب سازمانی"}</strong>
            <small className="text-text-muted">{ROLE_LABELS[role] || ""}</small>
          </span>
        )}
      </div>
      {!collapsed && (
        <button
          type="button"
          onClick={handleLogout}
          disabled={loading}
          className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-text-muted transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-50"
        >
          <IconLogout />
          خروج
        </button>
      )}
    </div>
  );
}

export default function AppShell({ children, footer }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [session, setSession] = useState(null);
  const menuBtn = useRef(null);

  useEffect(() => {
    try {
      if (localStorage.getItem("sidebar-collapsed") === "1") setCollapsed(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (pathname === "/login") return;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSession(data))
      .catch(() => setSession(null));
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtn.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      try {
        localStorage.setItem("sidebar-collapsed", v ? "0" : "1");
      } catch {}
      return !v;
    });
  }

  // صفحه‌ی ورود باید تنها و بدون ناوبری باشد (لینک بخش‌ها را قبل از احراز نشان نمی‌دهیم).
  if (pathname === "/login") return <>{children}</>;

  const groups = buildNavGroups(session?.outreachEnabled === true, session?.role);
  const sidebarInner = (isCollapsed, onNavigate) => (
    <>
      <Brand collapsed={isCollapsed} />
      <nav aria-label="ناوبری اصلی" className="flex flex-col">
        {groups.map((group, gi) => (
          <div key={gi} className="mb-5 last:mb-0">
            {group.title && !isCollapsed && (
              <div className="px-3 pb-2 text-[11px] font-bold text-text-muted">{group.title}</div>
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} collapsed={isCollapsed} />
            ))}
          </div>
        ))}
      </nav>
      <SidebarFoot username={session?.username} role={session?.role} collapsed={isCollapsed} />
    </>
  );

  return (
    <div className={`min-h-screen ${collapsed ? "lg:ps-20" : "lg:ps-[248px]"} transition-[padding] duration-200`}>
      <a
        href="#main"
        className="fixed start-4 top-2 z-[100] -translate-y-[150%] rounded-xl border-2 border-focus bg-white px-5 py-3 focus:translate-y-0"
      >
        رفتن به محتوای اصلی
      </a>

      {/* دسکتاپ — ستون ثابت */}
      <aside
        className={`fixed inset-y-0 start-0 z-40 hidden flex-col gap-[22px] overflow-y-auto border-e border-border bg-white px-4 pb-4 pt-6 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-20 px-3" : "w-[248px]"
        }`}
      >
        {sidebarInner(collapsed, undefined)}
      </aside>

      {/* موبایل/تبلت — کشو */}
      {open && (
        <>
          <button
            type="button"
            aria-label="بستن منو"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[35] cursor-default border-0 bg-[rgba(38,59,80,.28)] lg:hidden"
          />
          <aside
            id="mobile-menu"
            className="fixed inset-y-0 start-0 z-40 flex w-[min(88vw,300px)] flex-col gap-[22px] overflow-y-auto border-e border-border bg-white px-4 pb-4 pt-5 lg:hidden"
          >
            <button
              type="button"
              aria-label="بستن منو"
              onClick={() => {
                setOpen(false);
                menuBtn.current?.focus();
              }}
              className="grid h-11 w-11 place-items-center self-end rounded-xl text-text-muted hover:bg-primary-soft hover:text-primary"
            >
              <IconClose />
            </button>
            {sidebarInner(false, () => setOpen(false))}
          </aside>
        </>
      )}

      {/* نوار بالایی */}
      <div className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-4 border-b border-border bg-white/[0.97] px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3 text-[13px] text-text-muted">
          <button
            type="button"
            ref={menuBtn}
            onClick={() => setOpen(true)}
            aria-label="بازکردن منو"
            aria-controls="mobile-menu"
            aria-expanded={open}
            className="grid h-11 w-11 place-items-center rounded-xl hover:bg-primary-soft hover:text-primary lg:hidden"
          >
            <IconMenu />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "بازکردن منو" : "جمع‌کردن منو"}
            aria-expanded={!collapsed}
            className="hidden h-11 w-11 place-items-center rounded-xl hover:bg-primary-soft hover:text-primary lg:grid"
          >
            <IconMenu />
          </button>
          <span className="hidden sm:inline">تحقیق و توسعه سپهران شیمی</span>
          <img src="/logo.png" width={36} height={36} alt="آرم رسمی شرکت" className="h-9 w-9 rounded-lg bg-white object-contain lg:hidden" />
        </div>
        <Link
          href="/ask"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-text-muted hover:no-underline"
        >
          <IconSearch />
          <span>جست‌وجو و پرسش</span>
        </Link>
      </div>

      <div className="flex min-w-0 flex-col">
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
        {footer}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- آیکون‌ها
   inline SVG (هم‌شکل با طرح) و بدون کتابخانه. */

function svgProps(className) {
  return {
    className: `h-5 w-5 shrink-0 ${className || ""}`,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
}

const iconColor = "text-primary";

function IconDashboard() {
  return (
    <svg {...svgProps(iconColor)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconGlobe() {
  return (
    <svg {...svgProps(iconColor)}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M5 6.5h14M5 17.5h14" />
    </svg>
  );
}
function IconCompetitors() {
  return (
    <svg {...svgProps(iconColor)}>
      <path d="M4 20V11h4v9m2 0V4h4v16m2 0V8h4v12M2 20h20" />
    </svg>
  );
}
function IconTransit() {
  return (
    <svg {...svgProps(iconColor)}>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M7 6h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h4" />
    </svg>
  );
}
function IconReport() {
  return (
    <svg {...svgProps(iconColor)}>
      <path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h8" />
    </svg>
  );
}
function IconArchive() {
  return (
    <svg {...svgProps(iconColor)}>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v13h14V8M9 12h6" />
    </svg>
  );
}
function IconNews() {
  return (
    <svg {...svgProps(iconColor)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h5v5H7zM15 8h3M15 12h3M7 16h11" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg {...svgProps(iconColor)}>
      <path d="M4 21V7h10v14M14 11h6v10M2 21h20M7 10h4M7 14h4M7 18h4M17 14v1M17 18v1" />
    </svg>
  );
}
function IconExhibition() {
  return (
    <svg {...svgProps(iconColor)}>
      <path d="M3 9l3-5h12l3 5v3H3zM5 12v8h14v-8M10 20v-5h4v5M8 4l-1 8M16 4l1 8" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg {...svgProps("h-[18px] w-[18px] text-text-muted")}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </svg>
  );
}
function IconMail() {
  return (
    <svg {...svgProps(iconColor)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg {...svgProps("")}>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-3a8 8 0 0 1 16 0v3" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg {...svgProps("")}>
      <path d="M10 3h10v18H10M3 12h12m-8-4-4 4 4 4" />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg {...svgProps("h-6 w-6")}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg {...svgProps("h-6 w-6")}>
      <path d="m5 5 14 14M19 5 5 19" />
    </svg>
  );
}
