"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * وضعیت ایمیل شرکت‌های یک کشور از /api/outreach/company-status.
 * state: "loading" | "ready" | "unavailable" — «unavailable» یعنی کاربر نقش بازرگانی ندارد (۴۰۳) یا رابط ایمیل خاموش است (۴۰۴)
 * یا خطای شبکه؛ در هر سه حالت بخش ایمیل صفحه به‌کلی پنهان می‌شود (صفحه بدون آن هم کامل است).
 */
export default function useCompanyEmailStatus(country) {
  const [state, setState] = useState("loading");
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/outreach/company-status?country=${encodeURIComponent(country)}`, { cache: "no-store" });
      if (!res.ok) {
        setState("unavailable");
        return;
      }
      setData(await res.json());
      setState("ready");
    } catch {
      setState("unavailable");
    }
  }, [country]);

  useEffect(() => {
    load();
  }, [load]);

  return { state, data, reload: load };
}
