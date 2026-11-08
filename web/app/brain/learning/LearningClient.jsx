"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "../../components/PageHeader";

const ROLE = { stat: "تحلیل‌گر آماری", event: "تحلیل‌گر رویدادمحور" };
const STATUS_CLS = { فعال: "text-success", آزمایشی: "text-warning", پیشنهادی: "text-text-muted", بایگانی: "text-text-muted" };

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, ...j };
}
const post = (body) => api("/api/brain/learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function LearningClient() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState({});

  async function load() {
    const r = await api("/api/brain/learning", { cache: "no-store" });
    if (!r.ok) { setError(r.error || "خطا"); return; }
    setError(""); setData(r);
  }
  useEffect(() => { load(); }, []);

  async function run(action, extra = {}) {
    setBusy(true); setMsg("");
    const r = await post({ action, ...extra });
    setBusy(false);
    setMsg(r.ok ? (action === "run_cycle" ? `چرخه اجرا شد (${r.monthly}؛ تصمیم‌های اجراشده: ${(r.applied || []).length})` : action === "propose_revision" ? `نتیجه: ${r.status}${r.blocked_reason ? ` — ${r.blocked_reason}` : ""}` : "ثبت شد") : r.error || "انجام نشد");
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="یادگیری مغز" subtitle="نسخه‌های روش هر تحلیل‌گر، آزمایش‌های فعال و تثبیت ماهانه. هیچ تغییری خودکار نیست: هر پیشنهاد در صف بازبینی منتظر تأیید مدیر می‌ماند." />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {msg && <div className="rounded-lg border border-border px-3 py-2 text-sm">{msg}</div>}

      {data && (
        <>
          <section className="card p-5 space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy} onClick={() => run("run_cycle")} className="rounded border border-border px-3 py-1 cursor-pointer disabled:opacity-50">اجرای چرخه‌ی یادگیری</button>
              <span className="text-text-muted text-xs">آخرین چرخه‌ی ماهانه: {data.state?.last_monthly || "—"}</span>
              <Link href="/brain/memory" className="text-xs underline">صف بازبینی ({data.open_items.length} پیشنهاد باز)</Link>
            </div>
            {data.open_items.length > 0 && (
              <ul className="space-y-1 text-xs text-text-muted">
                {data.open_items.map((q) => <li key={q.id}>• {q.label}</li>)}
              </ul>
            )}
          </section>

          <section className="card p-5 space-y-4">
            <h2 className="font-bold">روش‌ها (حلقه‌ی ۳)</h2>
            {data.methods.map((m) => (
              <div key={m.role} className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <b>{ROLE[m.role]}</b>
                  <span className="text-xs text-text-muted">{m.state.needs ? "شرط بازبینی برقرار است" : m.state.blocked_reason}</span>
                  <button type="button" disabled={busy || !m.state.needs} onClick={() => run("propose_revision", { role: m.role })} className="rounded border border-border px-2 py-0.5 text-xs cursor-pointer disabled:opacity-50">پیشنهاد نسخه‌ی تازه</button>
                </div>
                <ul className="space-y-1 text-xs">
                  {m.versions.map((v) => (
                    <li key={v.version} className="flex flex-wrap gap-2">
                      <b dir="ltr">{v.version}</b>
                      <span className={STATUS_CLS[v.status] || ""}>{v.status}</span>
                      {v.backtest && <span className="text-text-muted">آزمون روی سابقه: {v.backtest.n} پیش‌بینی، بهبود {(v.backtest.mean_improvement * 100).toFixed(1)}٪ {v.backtest.passes ? "(قبول)" : "(رد)"}</span>}
                      {v.reason && <span className="text-text-muted">{v.reason}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="card p-5 space-y-3 text-sm">
            <h2 className="font-bold">آزمایش فعال</h2>
            <p className="text-xs text-text-muted">سهم ظرفیت آزمایش: {Math.round(data.experiments.quota.share * 100)}٪ (حدود {data.experiments.quota.quota} از {data.experiments.quota.capacity} ایمیل در ماه). این صفحه ایمیلی نمی‌فرستد؛ نتیجه‌ی آزمایش را خودتان ثبت می‌کنید.</p>
            {data.experiments.experiments.length === 0 && <p className="text-xs text-text-muted">هنوز آزمایشی تأیید نشده است.</p>}
            <ul className="space-y-3">
              {data.experiments.experiments.map((e) => (
                <li key={e.key} className="rounded-lg border border-border p-3 text-xs leading-6">
                  <div className="flex flex-wrap gap-2"><b>{e.title}</b><span className={STATUS_CLS[e.status] || ""}>{e.status}</span></div>
                  <div className="text-text-muted">پیش‌بینی پیش از اجرا: نرخ پاسخ {e.prior.point}٪ (بازه‌ی {e.prior.lo} تا {e.prior.hi})</div>
                  {e.verdict && <div>{e.verdict}</div>}
                  {e.status === "فعال" && (
                    <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(ev) => { ev.preventDefault(); const r = res[e.key] || {}; run("experiment_result", { key: e.key, sent: Number(r.sent), replied: Number(r.replied) }); }}>
                      <input dir="ltr" inputMode="numeric" placeholder="ارسال" className="w-20 rounded border border-border px-2 py-0.5" value={res[e.key]?.sent || ""} onChange={(ev) => setRes({ ...res, [e.key]: { ...res[e.key], sent: ev.target.value } })} />
                      <input dir="ltr" inputMode="numeric" placeholder="پاسخ" className="w-20 rounded border border-border px-2 py-0.5" value={res[e.key]?.replied || ""} onChange={(ev) => setRes({ ...res, [e.key]: { ...res[e.key], replied: ev.target.value } })} />
                      <button type="submit" disabled={busy} className="rounded border border-border px-2 py-0.5 cursor-pointer disabled:opacity-50">ثبت نتیجه</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
