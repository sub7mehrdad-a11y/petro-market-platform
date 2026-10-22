"use client";

import { useEffect, useRef, useState } from "react";

// گزارش‌های HTML خودبسنده (CSS/JS مستقل خودشون رو دارن) داخل iframe لود
// می‌شن تا استایل‌شون با بقیه‌ی سایت قاطی نشه. بعد از لود، ارتفاع iframe رو
// دقیقاً برابر ارتفاع محتوای داخلش تنظیم می‌کنیم (هم‌مبدأ هست، پس دسترسی به
// contentWindow آزاده) تا اسکرول تو اسکرول نداشته باشیم.
// ارتفاع فقط یک‌بار موقع لود کافی نیست: نمودارها، فونت وب و iframe‌های تو‌در‌توی داخل گزارش
// (مثل نقشه‌ی تعاملی هند) بعد از لود قد می‌کشن؛ پس تغییر اندازه‌ی محتوا دنبال می‌شه.
export default function HtmlReportFrame({ src, title }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(600);
  const cleanup = useRef(null);

  function measure() {
    const doc = iframeRef.current?.contentWindow?.document;
    if (!doc?.documentElement) return;
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
    if (h > 0) setHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  }

  function handleLoad() {
    cleanup.current?.();
    measure();
    const doc = iframeRef.current?.contentWindow?.document;
    let ro = null;
    if (doc?.body && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(doc.body);
    }
    const timer = setInterval(measure, 2000);
    cleanup.current = () => {
      ro?.disconnect();
      clearInterval(timer);
    };
  }

  // اگه iframe قبل از hydrate شدن React لود شده باشه، onLoad هیچ‌وقت صدا زده نمی‌شه و ارتفاع روی
  // مقدار پیش‌فرض می‌مونه؛ پس بعد از mount هم یک‌بار (در صورت آماده‌بودن سند) اندازه‌گیری رو شروع می‌کنیم.
  useEffect(() => {
    const doc = iframeRef.current?.contentWindow?.document;
    if (doc && doc.readyState === "complete" && !cleanup.current) handleLoad();
    return () => cleanup.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      onLoad={handleLoad}
      className="w-full border border-border rounded-lg"
      style={{ height }}
    />
  );
}
