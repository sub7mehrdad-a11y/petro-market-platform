"use client";

import { useEffect, useState } from "react";
import { parseExhibitionStartDate, daysUntil } from "@/lib/exhibitionDate";

// این صفحات استاتیک ساخته می‌شن (build زمان X)، ولی بازدید ممکنه روزها بعد
// باشه — پس محاسبه‌ی «چند روز مونده» باید بعد از mount توی مرورگر انجام بشه
// (با تاریخ واقعی لحظه‌ی بازدید)، نه موقع render سرور. وگرنه بین HTML سرور
// و هیدریشن کلاینت ناهم‌خوانی پیش میاد. قبل از mount چیزی رندر نمی‌کنیم تا
// خروجی اولیه‌ی کلاینت دقیقاً با HTML سرور یکی باشه.
export default function ExhibitionCountdownBadge({ dateStr }) {
  const [days, setDays] = useState(null);

  useEffect(() => {
    setDays(daysUntil(parseExhibitionStartDate(dateStr)));
  }, [dateStr]);

  if (days == null) return null;
  if (days < 0) {
    return <span className="text-[10px] text-text-muted">برگزار شده</span>;
  }
  if (days <= 60) {
    return (
      <span className="inline-block rounded-full bg-primary-soft text-primary-hover px-2 py-0.5 text-[10px] font-bold">
        به‌زودی · {days.toLocaleString("fa-IR")} روز مانده
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">{days.toLocaleString("fa-IR")} روز مانده</span>;
}
