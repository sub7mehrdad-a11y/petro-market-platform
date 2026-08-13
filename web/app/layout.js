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
      <body className="min-h-full flex flex-col font-[family-name:var(--font-vazirmatn)] bg-petrol-50/40 text-slate-900">
        <header className="bg-petrol-gradient text-white relative overflow-hidden">
          <div
            className="pointer-events-none absolute -top-16 -start-16 h-56 w-56 rounded-full opacity-40"
            style={{ background: "radial-gradient(circle, rgba(201,118,46,.35), transparent 70%)" }}
          />
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 relative z-10">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-copper-400 to-copper-600 font-black text-petrol-900 text-sm shrink-0">
                سص
              </span>
              <span className="leading-tight">
                <span className="block font-black text-[15px] tracking-tight">تحقیق و توسعه سپهران شیمی</span>
                <span className="block text-[11px] text-petrol-200">هوش تجاری بازار جوش شیرین</span>
              </span>
            </Link>
            <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-petrol-100">
              <Link href="/" className="hover:text-copper-300 transition-colors">داشبورد</Link>
              <Link href="/competitors" className="hover:text-copper-300 transition-colors">تحلیل رقبا</Link>
              <Link href="/countries" className="hover:text-copper-300 transition-colors">کشورها</Link>
              <Link href="/reports" className="hover:text-copper-300 transition-colors">گزارش‌های هوشمند</Link>
              <Link href="/archive" className="hover:text-copper-300 transition-colors">آرشیو گزارش‌ها</Link>
              <Link href="/companies" className="hover:text-copper-300 transition-colors">شرکت‌ها</Link>
              <Link href="/exhibitions" className="hover:text-copper-300 transition-colors">نمایشگاه‌ها</Link>
              <Link href="/news" className="hover:text-copper-300 transition-colors">اخبار تحلیلی</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        <footer className="border-t border-petrol-100 bg-white text-center text-xs text-slate-400 py-4">
          سپهران شیمی — داده‌ها روزی یک‌بار از منابع عمومی وب به‌صورت خودکار به‌روزرسانی می‌شن؛ هر عدد به منبع خودش لینک شده.
        </footer>
      </body>
    </html>
  );
}
