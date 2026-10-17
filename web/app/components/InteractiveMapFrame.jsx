"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// نقشه‌ی تعاملی رقیب (صفحه‌ی مستقل HTML در public/competitor-maps) داخل iframe هم‌مبدأ.
// ارتفاع iframe خودکار با محتوای نقشه هماهنگ می‌شه تا اسکرول تو‌در‌تو نداشته باشیم
// (چرخ موس روی خود نقشه زوم می‌کنه و نباید با اسکرول صفحه تداخل کنه).
export default function InteractiveMapFrame({ src, title }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(900);

  const resize = useCallback(() => {
    try {
      const doc = ref.current?.contentDocument;
      if (!doc) return;
      const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
      if (h > 300) setHeight(h);
    } catch {
      // مبدأ متفاوت: همان ارتفاع پیش‌فرض می‌ماند
    }
  }, []);

  useEffect(() => {
    const t = setInterval(resize, 1500); // محتوای نقشه بعد از بارگذاری d3 و تغییر پنل جزئیات عوض می‌شه
    window.addEventListener("resize", resize);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", resize);
    };
  }, [resize]);

  return (
    <div>
      <iframe
        ref={ref}
        src={src}
        title={title}
        onLoad={() => {
          resize();
          setTimeout(resize, 800);
        }}
        className="w-full rounded-lg border border-slate-200 bg-white"
        style={{ height, border: 0 }}
        loading="lazy"
      />
      <div className="mt-2 text-xs text-slate-500">
        نقشه به اینترنت نیاز دارد (کتابخانه‌ی d3 و فونت). برای نمایش تمام‌صفحه{" "}
        <a href={src} target="_blank" rel="noopener noreferrer" className="text-copper-700 hover:underline">
          در تب جدید باز کنید ↗
        </a>
      </div>
    </div>
  );
}
