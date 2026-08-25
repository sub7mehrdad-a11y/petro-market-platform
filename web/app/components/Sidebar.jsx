"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * ناوبری اصلی — سایدبار سمت راست (چون کل سایت RTL است).
 *
 * چرا از منوی افقی به سایدبار رفتیم: ده آیتم در یک نوار افقی، در نمایشگر کوچک
 * به چند سطر می‌شکست و ترتیب بصری‌اش به هم می‌ریخت، و جایی هم برای «کدام صفحه
 * باز است» نداشت. سایدبار هم گروه‌بندی موضوعی می‌دهد، هم حالت فعال، هم جا برای
 * آیتم‌های بعدی (روسیه و…) بدون شلوغ‌شدن.
 *
 * زیر breakpoint لارج، سایدبار به یک نوار بالا + کشوی بازشونده تبدیل می‌شود.
 */

const NAV_GROUPS = [
  {
    items: [{ href: "/", label: "داشبورد", icon: IconDashboard }],
  },
  {
    title: "بازار",
    items: [
      { href: "/countries", label: "کشورها", icon: IconGlobe },
      { href: "/competitors", label: "تحلیل رقبا", icon: IconTarget },
      { href: "/transit", label: "تحلیل ترانزیت", icon: IconTruck },
    ],
  },
  {
    title: "محتوا",
    items: [
      { href: "/reports", label: "گزارش‌های هوشمند", icon: IconSpark },
      { href: "/archive", label: "آرشیو گزارش‌ها", icon: IconArchive },
      { href: "/news", label: "اخبار تحلیلی", icon: IconNews },
    ],
  },
  {
    title: "بانک اطلاعات",
    items: [
      { href: "/companies", label: "شرکت‌ها", icon: IconBuilding },
      { href: "/exhibitions", label: "نمایشگاه‌ها", icon: IconCalendar },
    ],
  },
];

const ASK_ITEM = { href: "/ask", label: "جست‌وجو و پرسش", icon: IconSearch };

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, onNavigate }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-petrol-500/60 text-white font-semibold"
          : "text-petrol-100 hover:bg-white/5 hover:text-white"
      }`}
    >
      {/* نوار مسی لبه‌ی راست برای آیتم فعال — همان نشانگر طرح */}
      {active && (
        <span className="absolute -end-4 top-1/2 -translate-y-1/2 h-6 w-1 rounded-s bg-copper-400" />
      )}
      <Icon className={active ? "text-copper-300" : "text-petrol-300"} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Brand({ compact = false }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 min-w-0">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-copper-400 to-copper-600 font-black text-petrol-900 text-sm shrink-0">
        سص
      </span>
      <span className="leading-tight min-w-0">
        <span className="block font-black text-[15px] tracking-tight text-white truncate">
          تحقیق و توسعه سپهران شیمی
        </span>
        {!compact && (
          <span className="block text-[11px] text-petrol-300">هوش تجاری بازار جوش شیرین</span>
        )}
      </span>
    </Link>
  );
}

function NavContent({ pathname, onNavigate }) {
  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {group.title && (
            <div className="px-3 pb-1 text-[10px] font-bold tracking-wide text-petrol-400 uppercase">
              {group.title}
            </div>
          )}
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      ))}

      <div className="pt-1 mt-1 border-t border-white/10">
        <NavLink item={ASK_ITEM} pathname={pathname} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* دسکتاپ — ستون ثابت سمت راست */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-petrol-700 relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-20 -start-20 h-56 w-56 rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, rgba(201,118,46,.35), transparent 70%)" }}
        />
        {/* sticky تا با اسکرول صفحات بلند (کشورها، شرکت‌ها) منو از دست نرود */}
        <div className="relative z-10 sticky top-0 flex flex-col gap-6 p-4 max-h-screen overflow-y-auto">
          <Brand />
          <NavContent pathname={pathname} />
        </div>
      </aside>

      {/* موبایل/تبلت — نوار بالا و کشوی بازشونده */}
      <div className="lg:hidden bg-petrol-700 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Brand compact />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="منوی ناوبری"
            className="rounded-lg p-2 text-petrol-100 hover:bg-white/10 transition-colors"
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
        </div>
        {open && (
          <div className="px-4 pb-4 border-t border-white/10 pt-3">
            <NavContent pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- آیکون‌ها
   inline SVG و بدون کتابخانه — ده آیکون ساده ارزش یک وابستگی جدید را ندارد. */

function svgProps(className) {
  return {
    className: `h-4 w-4 shrink-0 ${className || ""}`,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
}

function IconDashboard({ className }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function IconGlobe({ className }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </svg>
  );
}

function IconTarget({ className }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

function IconTruck({ className }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M2 7h11v9H2zM13 10h4l4 3.5V16h-8z" />
      <circle cx="6" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </svg>
  );
}

function IconSpark({ className }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  );
}

function IconArchive({ className }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function IconNews({ className }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="5" width="14" height="15" rx="1.5" />
      <path d="M17 9h3a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2h-1M6 9h8M6 13h8M6 17h5" />
    </svg>
  );
}

function IconBuilding({ className }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="4" y="3" width="10" height="18" rx="1" />
      <path d="M14 9h5a1 1 0 0 1 1 1v11M7 7h4M7 11h4M7 15h4M17 13h1M17 17h1" />
    </svg>
  );
}

function IconCalendar({ className }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function IconSearch({ className }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg {...svgProps()} className="h-5 w-5">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg {...svgProps()} className="h-5 w-5">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
