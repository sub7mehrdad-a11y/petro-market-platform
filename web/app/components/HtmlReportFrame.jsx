"use client";

import { useRef, useState } from "react";

// گزارش‌های HTML خودبسنده (CSS/JS مستقل خودشون رو دارن) داخل iframe لود
// می‌شن تا استایل‌شون با بقیه‌ی سایت قاطی نشه. بعد از لود، ارتفاع iframe رو
// دقیقاً برابر ارتفاع محتوای داخلش تنظیم می‌کنیم (هم‌مبدأ هست، پس دسترسی به
// contentWindow آزاده) تا اسکرول تو اسکرول نداشته باشیم.
export default function HtmlReportFrame({ src, title }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(600);

  function handleLoad() {
    const doc = iframeRef.current?.contentWindow?.document;
    if (doc?.documentElement) {
      setHeight(doc.documentElement.scrollHeight);
    }
  }

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      onLoad={handleLoad}
      className="w-full border border-slate-200 rounded-lg"
      style={{ height }}
    />
  );
}
