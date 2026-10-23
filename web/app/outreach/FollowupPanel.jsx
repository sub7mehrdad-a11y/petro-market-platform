"use client";

import { useCallback, useEffect, useState } from "react";
import { jalaliFa } from "@/lib/dateFormat";

const n = (v) => Number(v ?? 0).toLocaleString("fa-IR");
const when = (iso) => (iso ? new Date(iso).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }) : "—");

// پیگیری ایمیل معرفی: ۱) یادآوری به شرکت‌های بی‌پاسخ ۲) فوروارد پاسخ مشتری به همکار بازرگانی.
// فقط نمایش وضعیت؛ تنظیم از env روی سرور (پیش‌فرض هر دو خاموش).
export default function FollowupPanel() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach/followup", { cache: "no-store" });
      if (res.ok) setS(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function pollNow() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/outreach/followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "poll_now" }) });
      const data = await res.json();
      if (!res.ok) setMsg({ ok: false, text: data.error || "ناموفق بود." });
      else if (data.skipped) setMsg({ ok: false, text: { disabled: "فوروارد پاسخ خاموش است.", halted: "ارسال متوقف است.", "no-recipient": "گیرنده‌ی فوروارد تنظیم نشده." }[data.skipped] || `انجام نشد (${data.skipped}).` });
      else setMsg({ ok: true, text: data.baselined ? "خط پایه ثبت شد؛ از این به بعد پاسخ‌های جدید فوروارد می‌شوند." : `${n(data.forwarded)} پاسخ برای همکار فوروارد شد.` });
      load();
    } catch {
      setMsg({ ok: false, text: "خطا در ارتباط با سرور." });
    } finally {
      setBusy(false);
    }
  }

  if (!s) return null;
  const { reminder: r, forward: f, halted } = s;

  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">پیگیری: یادآوری و فوروارد پاسخ مشتری</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold">ایمیل یادآوری</h3>
            <span className={`badge ${r.enabled && !halted ? "badge-success" : "badge-neutral"}`}>{halted ? "متوقف (توقف دستی)" : r.enabled ? "فعال" : "خاموش"}</span>
          </div>
          <p className="mt-2 text-xs leading-6 text-text-muted">
            شرکتی که {n(r.after_days)} روز بعد از ایمیل معرفی پاسخ واقعی نداده و برنگشته، یک‌بار یادآوری می‌گیرد (در همان رشته‌ی ایمیل). حداکثر {n(r.per_day)} در روز، از قدیمی‌ترین؛ ارسال‌های بیش از {n(r.max_age_days)} روز پیش دیگر یادآوری نمی‌گیرند.
            {!r.enabled && " برای روشن‌شدن: OUTREACH_REMINDER_ENABLED=true روی سرور (پس از تأیید متن یادآوری)."}
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-canvas p-2"><dt className="text-text-muted">در صف</dt><dd className="text-lg font-bold">{n(r.counts.queued)}</dd></div>
            <div className="rounded-lg bg-canvas p-2"><dt className="text-text-muted">ارسال‌شده</dt><dd className="text-lg font-bold">{n(r.counts.sent)}</dd></div>
            <div className="rounded-lg bg-canvas p-2"><dt className="text-text-muted">ناموفق</dt><dd className="text-lg font-bold">{n(r.counts.failed)}</dd></div>
          </dl>
          {r.last_run && (
            <p className="mt-3 text-xs text-text-muted">
              آخرین بررسی: {when(r.last_run.at)}
              {r.last_run.error ? <span className="text-danger"> — {r.last_run.error}</span> : <> — {n(r.last_run.queued)} شرکت وارد صف شد</>}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold">فوروارد پاسخ مشتری به همکار</h3>
            <span className={`badge ${f.enabled && !halted && f.recipients_masked.length ? "badge-success" : "badge-neutral"}`}>{halted ? "متوقف (توقف دستی)" : f.enabled ? "فعال" : "خاموش"}</span>
          </div>
          <p className="mt-2 text-xs leading-6 text-text-muted">
            هر {n(f.poll_min)} دقیقه صندوق ورودی خوانده می‌شود؛ پاسخ‌های واقعی به ایمیل‌های ما (نه پاسخ خودکار، نه برگشتی، نه ایمیل بی‌ارتباط) با خلاصه‌ی مشخصات و فایل اصلی برای همکار فرستاده می‌شود و Reply-To روی مشتری است. صندوق فقط خوانده می‌شود.
            {!f.enabled && " برای روشن‌شدن: OUTREACH_FORWARD_ENABLED=true و OUTREACH_FORWARD_TO=<ایمیل سازمانی همکار>."}
          </p>
          <p className="mt-2 text-xs">
            گیرنده: {f.recipients_masked.length ? f.recipients_masked.join("، ") : <span className="text-warning">تنظیم نشده</span>}
            {f.test_redirect && <span className="text-warning"> · حالت تست: به آدرس تست می‌رود</span>}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg bg-canvas p-2"><dt className="text-text-muted">فوروارد‌شده (کل)</dt><dd className="text-lg font-bold">{n(f.forwarded_count)}</dd></div>
            <div className="rounded-lg bg-canvas p-2"><dt className="text-text-muted">آخرین فوروارد</dt><dd className="text-sm font-bold">{when(f.last_forwarded_at)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-text-muted">
            شروع پایش: {f.baseline_at ? jalaliFa(f.baseline_at) : "—"} · آخرین بررسی: {when(f.last_run)}
          </p>
          {f.last_error && <p className="mt-1 text-xs text-danger">⚠ {f.last_error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={pollNow} disabled={busy || halted || !f.enabled} className="btn btn-secondary">
              {busy ? "در حال بررسی..." : "بررسی صندوق ورودی همین الان"}
            </button>
            {msg && <span className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
