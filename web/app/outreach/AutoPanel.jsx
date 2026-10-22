"use client";

import { useCallback, useEffect, useState } from "react";

const WEEKDAY_FA = { Saturday: "شنبه", Sunday: "یکشنبه", Monday: "دوشنبه", Tuesday: "سه‌شنبه", Wednesday: "چهارشنبه", Thursday: "پنج‌شنبه", Friday: "جمعه" };
const n = (v) => Number(v ?? 0).toLocaleString("fa-IR");
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }) : "—");

// وضعیت ارسال خودکار روزانه + گزارش هفتگی (فقط نمایش؛ تنظیم از env روی سرور و data/outreach_auto.json).
export default function AutoPanel({ halted = false }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach/auto", { cache: "no-store" });
      if (res.ok) setS(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function sendReportNow() {
    if (!confirm("گزارش کامل (اکسل + HTML) همین الان برای ایمیل مسئول گزارش فرستاده بشه؟ ساخت گزارش تا حدود ۲ دقیقه طول می‌کشه.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/outreach/auto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send_report" }) });
      const data = await res.json();
      setMsg(res.ok ? { ok: true, text: `گزارش برای ${data.to} ارسال شد.` } : { ok: false, text: data.error || "ارسال ناموفق بود." });
      load();
    } catch {
      setMsg({ ok: false, text: "خطا در ارتباط با سرور." });
    } finally {
      setBusy(false);
    }
  }

  if (!s) return null;
  const active = s.auto_enabled && s.sending_enabled && !s.ready_problem && !halted;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold">ارسال خودکار روزانه و گزارش هفتگی</h2>
          <p className="text-xs text-text-muted mt-0.5">
            هر روز ساعت {n(s.send_hour_tehran)} (به وقت تهران) {n(s.per_day)} شرکت از کشورهای زیر — از هر کشور به‌نوبت — وارد صف می‌شه و با فاصله‌ی ۱ دقیقه ارسال می‌شه.
          </p>
        </div>
        <span className={`text-xs font-semibold rounded-full px-3 py-1 ${active ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
          {halted ? "متوقف (توقف دستی)" : active ? "فعال" : "غیرفعال"}
        </span>
      </div>

      <p className={`text-sm mb-2 ${s.disk?.ok ? "text-success" : "text-danger"}`}>
        {s.disk?.ok ? "✓" : "⚠"} دیسک دائم: {s.disk?.text}
      </p>
      {!s.auto_enabled && <p className="text-sm text-warning mb-2">ارسال خودکار خاموشه — برای روشن‌شدن متغیر OUTREACH_AUTO_ENABLED=true روی سرور لازمه.</p>}
      {s.auto_enabled && s.ready_problem && <p className="text-sm text-danger mb-2">⚠ {s.ready_problem}</p>}
      {s.test_redirect && <p className="text-sm text-warning mb-2">حالت تست: همه‌ی ایمیل‌ها فقط به آدرس تست می‌رن.</p>}
      {s.last_error && !s.ready_problem && <p className="text-sm text-danger mb-2">آخرین خطا: {s.last_error}</p>}

      <div className="grid gap-3 sm:grid-cols-3 mb-3">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-text-muted">باقی‌مانده برای ارسال خودکار</div>
          <div className="text-xl font-bold text-text">{n(s.remaining_total)} شرکت</div>
          <div className="text-xs text-text-muted">حدود {n(s.days_left)} روز</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-text-muted">آخرین دسته‌ی روزانه</div>
          {s.last_daily ? (
            <>
              <div className="text-sm font-semibold">{n(s.last_daily.queued)} شرکت وارد صف شد</div>
              <div className="text-xs text-text-muted">{fmtTime(s.last_daily.at)}</div>
            </>
          ) : (
            <div className="text-sm text-text-muted">هنوز اجرا نشده</div>
          )}
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-text-muted">گزارش هفتگی ({WEEKDAY_FA[s.report.weekday] || s.report.weekday}، ساعت {n(s.report.hour_tehran)})</div>
          {s.report.enabled ? (
            <>
              <div className="text-sm font-semibold">به {s.report.to_masked}</div>
              <div className="text-xs text-text-muted">آخرین ارسال: {s.report.last ? fmtTime(s.report.last.at) : "—"}</div>
              {s.report.last_error && <div className="text-xs text-danger mt-0.5">خطا: {s.report.last_error}</div>}
            </>
          ) : (
            <div className="text-sm text-warning">گیرنده تنظیم نشده (OUTREACH_REPORT_TO)</div>
          )}
        </div>
      </div>

      <details className="text-xs text-text mb-3">
        <summary className="cursor-pointer">باقی‌مانده به تفکیک کشور</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {s.countries.map((c) => (
            <span key={c} className={`rounded-md border px-2 py-1 ${s.priority_countries?.includes(c) ? "bg-primary-soft border-border" : "bg-canvas border-border"}`}>
              {c}{s.priority_countries?.includes(c) ? " (اولویت)" : ""}: {n(s.remaining_by_country[c])}
            </span>
          ))}
        </div>
        {s.paused_countries?.length > 0 && (
          <p className="mt-2">فعلاً ارسال نمی‌شه: {s.paused_countries.join("، ")}</p>
        )}
      </details>

      {s.report.enabled && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={sendReportNow} disabled={busy || halted} className="btn btn-secondary">
            {busy ? "در حال ساخت و ارسال گزارش..." : "ارسال گزارش همین الان"}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
        </div>
      )}
    </section>
  );
}
