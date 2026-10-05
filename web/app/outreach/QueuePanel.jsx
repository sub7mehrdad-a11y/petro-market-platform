"use client";

import { useCallback, useEffect, useState } from "react";

const STATUS_FA = { sent: "ارسال شد", failed: "ناموفق", cancelled: "لغو", queued: "در صف" };
const STATUS_STYLE = {
  sent: "text-emerald-700 bg-emerald-50",
  failed: "text-rose-700 bg-rose-50",
  cancelled: "text-slate-500 bg-slate-100",
  queued: "text-amber-700 bg-amber-50",
};

function timeLeft(iso) {
  if (!iso) return null;
  const sec = Math.round((Date.parse(iso) - Date.now()) / 1000);
  if (sec <= 0) return "همین الان";
  if (sec < 90) return `${sec.toLocaleString("fa-IR")} ثانیه‌ی دیگر`;
  return `${Math.round(sec / 60).toLocaleString("fa-IR")} دقیقه‌ی دیگر`;
}

// پنل زنده‌ی صف ارسال: چندتا مونده، چندتا فرستاده شده، ارسال بعدی کی، توقف/ادامه/لغو.
export default function QueuePanel({ refreshKey }) {
  const [q, setQ] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach/queue", { cache: "no-store" });
      if (res.ok) setQ(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  async function act(action) {
    if (action === "cancel_all" && !confirm("همه‌ی ایمیل‌های در صف لغو بشن؟ (فرستاده‌شده‌ها دست‌نخورده می‌مونن)")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/outreach/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) setQ(await res.json());
    } finally {
      setBusy(false);
    }
  }

  if (!q) return null;
  const { counts } = q;
  const total = counts.queued + counts.sent + counts.failed + counts.cancelled;
  if (total === 0) return null;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold">صف ارسال</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ایمیل‌ها یکی‌یکی و با فاصله‌ی حدود {q.interval_sec.toLocaleString("fa-IR")} ثانیه فرستاده می‌شن (سقف روزانه:{" "}
            {q.daily_limit.toLocaleString("fa-IR")} ایمیل؛ ۲۴ ساعت اخیر: {q.sent_last_24h.toLocaleString("fa-IR")}).
          </p>
        </div>
        <div className="flex gap-2">
          {q.paused ? (
            <button type="button" disabled={busy} onClick={() => act("resume")} className="bg-copper-700 text-white text-sm rounded-lg px-3 py-1.5 disabled:opacity-40">
              ادامه‌ی ارسال
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => act("pause")} className="border border-slate-300 text-slate-700 text-sm rounded-lg px-3 py-1.5 disabled:opacity-40">
              توقف موقت
            </button>
          )}
          {counts.queued > 0 && (
            <button type="button" disabled={busy} onClick={() => act("cancel_all")} className="border border-rose-300 text-rose-700 text-sm rounded-lg px-3 py-1.5 disabled:opacity-40">
              لغو صف
            </button>
          )}
          {counts.failed > 0 && (
            <button type="button" disabled={busy} onClick={() => act("retry_failed")} className="border border-slate-300 text-slate-700 text-sm rounded-lg px-3 py-1.5 disabled:opacity-40">
              تلاش دوباره‌ی ناموفق‌ها
            </button>
          )}
        </div>
      </div>

      {!q.sending_enabled && <p className="text-sm text-rose-700 mb-2">ارسال واقعی روی سرور غیرفعال است (OUTREACH_SENDING_ENABLED).</p>}
      {q.test_redirect && <p className="text-sm text-amber-700 mb-2">حالت تست فعال است: همه‌ی ایمیل‌ها فقط به آدرس تست می‌رن، نه شرکت‌ها.</p>}
      {q.paused && <p className="text-sm text-amber-700 mb-2">صف متوقف شده — تا «ادامه‌ی ارسال» نزنی چیزی نمی‌ره.</p>}

      <div className="grid gap-3 sm:grid-cols-4 mb-3">
        {[
          ["در صف", counts.queued, "text-amber-700"],
          ["ارسال‌شده", counts.sent, "text-emerald-700"],
          ["ناموفق", counts.failed, "text-rose-700"],
          ["لغو", counts.cancelled, "text-slate-500"],
        ].map(([label, n, cls]) => (
          <div key={label} className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-xl font-bold font-tabular ${cls}`}>{n.toLocaleString("fa-IR")}</div>
          </div>
        ))}
      </div>

      {counts.queued > 0 && !q.paused && q.next_send_at && (
        <p className="text-xs text-slate-500 mb-2">ارسال بعدی: {timeLeft(q.next_send_at)} · تقریباً {Math.ceil((counts.queued * q.interval_sec) / 60).toLocaleString("fa-IR")} دقیقه تا تمام‌شدن صف</p>
      )}

      {q.recent.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {q.recent.map((r) => (
            <li key={r.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="truncate max-w-[60%]">{r.name || r.email}</span>
              <span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_STYLE[r.status]}`} title={r.error || undefined}>
                {STATUS_FA[r.status]}{r.test ? " (تست)" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
