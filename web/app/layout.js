import { Vazirmatn, Fira_Code } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
});

// برای ارقام قیمت/آمار — فونت monospace با figure عددی ثابت، حس «دقیق و تحلیلی»
// مناسب داشبورد به داده‌ها می‌ده (طبق توصیه‌ی سیستم طراحی برای محصولات دیتا-محور).
const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
});

export const metadata = {
  title: "تحقیق و توسعه سپهران شیمی",
  description: "مخزن پژوهش، داشبورد قیمت، و تحلیل روزانه‌ی بازار جوش شیرین و محصولات پتروشیمی سپهران شیمی",
};

export default function RootLayout({ children }) {
  return (
    <html dir="rtl" lang="fa" className={`${vazirmatn.variable} ${firaCode.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-vazirmatn)] bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-slate-900 text-white">
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 font-bold text-sm shrink-0">
                سص
              </span>
              <span className="leading-tight">
                <span className="block font-bold text-[15px]">تحقیق و توسعه سپهران شیمی</span>
                <span className="block text-[11px] text-slate-400">هوش تجاری بازار جوش شیرین</span>
              </span>
            </Link>
            <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-300">
              <Link href="/" className="hover:text-white transition-colors">داشبورد</Link>
              <Link href="/countries" className="hover:text-white transition-colors">کشورها</Link>
              <Link href="/reports" className="hover:text-white transition-colors">گزارش‌های هوشمند</Link>
              <Link href="/archive" className="hover:text-white transition-colors">آرشیو گزارش‌ها</Link>
              <Link href="/companies" className="hover:text-white transition-colors">شرکت‌ها</Link>
              <Link href="/exhibitions" className="hover:text-white transition-colors">نمایشگاه‌ها</Link>
              <Link href="/news" className="hover:text-white transition-colors">اخبار تحلیلی</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white text-center text-xs text-slate-400 py-4">
          سپهران شیمی — داده‌ها روزی یک‌بار از منابع عمومی وب به‌صورت خودکار به‌روزرسانی می‌شن؛ هر عدد به منبع خودش لینک شده.
        </footer>
      </body>
    </html>
  );
}
