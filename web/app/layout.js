import { Vazirmatn } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
});

export const metadata = {
  title: "پلتفرم تحقیق و توسعه‌ی بازار",
  description: "مخزن پژوهش، داشبورد قیمت، و تحلیل روزانه‌ی بازار جوش شیرین و محصولات پتروشیمی",
};

export default function RootLayout({ children }) {
  return (
    <html dir="rtl" lang="fa" className={`${vazirmatn.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-vazirmatn)] bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg">
              تحقیق و توسعه‌ی بازار
            </Link>
            <nav className="flex gap-6 text-sm">
              <Link href="/" className="hover:text-emerald-700">داشبورد</Link>
              <Link href="/countries" className="hover:text-emerald-700">کشورها</Link>
              <Link href="/reports" className="hover:text-emerald-700">گزارش‌های بازار</Link>
              <Link href="/companies" className="hover:text-emerald-700">شرکت‌ها</Link>
              <Link href="/exhibitions" className="hover:text-emerald-700">نمایشگاه‌ها</Link>
              <Link href="/news" className="hover:text-emerald-700">اخبار تحلیلی</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        <footer className="border-t border-slate-200 text-center text-xs text-slate-400 py-4">
          داده‌ها روزی یک‌بار از منابع عمومی وب به‌صورت خودکار به‌روزرسانی می‌شن — هر عدد به منبع خودش لینک شده.
        </footer>
      </body>
    </html>
  );
}
