import { Vazirmatn, Fira_Code } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";

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
      {/*
        چیدمان: سایدبار ثابت سمت راست + ستون محتوا.
        در موبایل سایدبار به نوار بالا تبدیل می‌شود (منطقش داخل خود Sidebar).
      */}
      <body className="min-h-full font-[family-name:var(--font-vazirmatn)] bg-petrol-900 text-slate-900">
        <div className="min-h-screen flex flex-col lg:flex-row">
          <Sidebar />

          <div className="flex-1 min-w-0 flex flex-col">
            <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
              {children}
            </main>
            <footer className="border-t border-white/10 text-center text-xs text-petrol-400 py-5 px-4">
              سپهران شیمی — داده‌ها روزی یک‌بار از منابع عمومی وب به‌صورت خودکار به‌روزرسانی می‌شن؛ هر عدد به منبع خودش لینک شده.
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
