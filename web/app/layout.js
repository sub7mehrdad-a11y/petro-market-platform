import localFont from "next/font/local";
import "./globals.css";
import AppShell from "./components/Sidebar";

// فونت‌ها self-host‌اند (از بسته‌ی طراحی، لایسنس OFL کنار فایل‌ها): بدون وابستگی به Google Fonts در
// build/اجرا، پس روی لیارا و محیط آفلاین هم یکسان کار می‌کنند.
const vazirmatn = localFont({
  variable: "--font-vazirmatn",
  display: "swap",
  src: [
    { path: "./fonts/Vazirmatn-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Vazirmatn-500.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Vazirmatn-600.ttf", weight: "600", style: "normal" },
    { path: "./fonts/Vazirmatn-700.ttf", weight: "700", style: "normal" },
    { path: "./fonts/Vazirmatn-800.ttf", weight: "800", style: "normal" },
    { path: "./fonts/Vazirmatn-900.ttf", weight: "900", style: "normal" },
  ],
});

// ارقام داخل جدول‌ها (tnum) — طبق طرح فقط در جدول.
const firaCode = localFont({
  variable: "--font-fira-code",
  display: "swap",
  src: [{ path: "./fonts/FiraCode-400.ttf", weight: "400 500", style: "normal" }],
});

export const metadata = {
  title: "تحقیق و توسعه سپهران شیمی",
  description: "مخزن پژوهش، داشبورد قیمت، و تحلیل روزانه‌ی بازار جوش شیرین و محصولات پتروشیمی سپهران شیمی",
};

export default function RootLayout({ children }) {
  return (
    <html dir="rtl" lang="fa" className={`${vazirmatn.variable} ${firaCode.variable} h-full antialiased`}>
      {/*
        چیدمان: سایدبار ثابت سمت راست + ستون محتوا.
        در موبایل سایدبار به نوار بالا تبدیل می‌شود (منطقش داخل خود Sidebar).

        نقش/یوزرنیم کاربر عمداً این‌جا (سرور) خونده نمی‌شه — چون خوندن کوکی
        توی layout کل سایت رو از prerender استاتیک خارج می‌کرد (هر صفحه‌ی
        کشور/رقیب/گزارش که از قبل SSG بود، dynamic می‌شد). به‌جاش Sidebar
        خودش نقش رو از /api/auth/me می‌خونه (نگاه کن web/app/components/Sidebar.jsx).
      */}
      <body className="min-h-full font-[family-name:var(--font-vazirmatn)] bg-canvas text-text">
        <AppShell
          footer={
            <footer className="mx-auto mt-6 w-full max-w-6xl border-t border-border px-4 py-5 text-xs leading-[1.85] text-text-muted lg:px-8">
              سپهران شیمی — داده‌ها روزی یک‌بار از منابع عمومی وب به‌صورت خودکار به‌روزرسانی می‌شن؛ هر عدد به منبع خودش لینک شده.
            </footer>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
