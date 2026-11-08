"use client";

import { useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, ...j };
}

const inp = "mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";

export default function MemoryClient() {
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState({ subject: "", metric: "", known_at: "" });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [rules, setRules] = useState(null);
  const [queue, setQueue] = useState(null);

  async function loadCounts() {
    const r = await api("/api/brain/memory", { cache: "no-store" });
    if (!r.ok) { setError(r.error || "خطا"); return; }
    setError(""); setCounts(r.counts);
  }
  async function loadRules() {
    const r = await api("/api/brain/memory?rules=1", { cache: "no-store" });
    if (r.ok) setRules(r.rules);
  }
  async function loadQueue() {
    const r = await api("/api/brain/queue", { cache: "no-store" });
    if (r.ok) setQueue(r);
  }
  async function decide(id, decision, claimKey) {
    const note = decision === "dismiss" || decision === "reject" ? prompt("یادداشت (اختیاری):") || "" : "";
    if (!confirm("تصمیم ثبت می‌شود (ردیف تازه؛ چیزی پاک نمی‌شود). ادامه؟")) return;
    setBusy(true);
    const r = await api("/api/brain/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve", id, decision, claim_key: claimKey, note }) });
    setBusy(false);
    if (!r.ok) { setError(r.error || "انجام نشد"); return; }
    setError(""); setQueue(r); loadCounts();
  }
  useEffect(() => { loadCounts(); loadRules(); loadQueue(); }, []);

  async function ask() {
    setBusy(true);
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v.trim()) p.set(k, v.trim());
    const r = await api(`/api/brain/memory?${p}`, { cache: "no-store" });
    setBusy(false);
    if (!r.ok) { setError(r.error || "خطا"); return; }
    setError(""); setRes(r.rows ? r : null);
  }

  async function migrate() {
    setBusy(true); setMsg("");
    const r = await api("/api/brain/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "migrate" }) });
    setBusy(false);
    setMsg(r.ok ? `ادعای تازه ${r.stats.claims_new}، تغییریافته ${r.stats.claims_changed}، بدون تغییر ${r.stats.claims_unchanged}` : r.error || "انجام نشد");
    loadCounts(); loadRules(); loadQueue();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="حافظه‌ی مغز" subtitle="هر ادعا دو خط زمانی دارد: «کی در جهان درست بود» و «کی سیستم باورش داشت». می‌توانید بپرسید: در تاریخ فلان، سیستم درباره‌ی فلان چه باور داشت؟" />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      {counts && (
        <section className="card p-4 text-xs leading-7">
          <div className="mb-1 font-bold text-text">شمارش مخزن‌ها (کل / باز)</div>
          <div className="flex flex-wrap gap-x-4 text-text-muted">
            {Object.entries(counts).map(([k, v]) => <span key={k}>{k}: <b className="text-text" dir="ltr">{v.total} / {v.open}</b></span>)}
          </div>
        </section>
      )}

      {queue && (
        <section className="card p-4">
          <div className="mb-2 text-sm font-bold text-text">
            صف بازبینی: {queue.counts.open} مورد باز
            {queue.counts.overdue > 0 && <span className="ms-2 text-danger">({queue.counts.overdue} مورد بیش از ۱۴ روز بی‌تصمیم)</span>}
          </div>
          {queue.open.length === 0 && <p className="text-xs text-text-muted">مورد بازی نیست.</p>}
          <ul className="space-y-3">
            {queue.open.map((q) => (
              <li key={q.id} className={`rounded-lg border p-3 text-xs leading-6 ${q.overdue ? "border-danger" : "border-border"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-text">{q.subject}</b>
                  <span className="text-text-muted">{q.kind === "sanity" ? "ادعای مشکوک" : "تناقض"} · {q.period || "—"} · {q.age_days} روز پیش</span>
                  {q.spread && <span className="text-text-muted" dir="ltr">×{q.spread}</span>}
                </div>
                <p className="text-text-muted">{q.label}</p>
                <ul className="mt-1 space-y-1">
                  {q.members.map((m) => (
                    <li key={m.claim_key} className="flex flex-wrap items-center gap-2">
                      <span dir="ltr" className="text-text">{typeof m.value === "number" ? m.value.toLocaleString("en-US") : m.value} {m.unit || ""}</span>
                      <span className="text-text-muted" dir="ltr">{m.source} · {m.metric}</span>
                      <button type="button" disabled={busy} onClick={() => decide(q.id, "accept", m.claim_key)} className="rounded border border-border px-2 py-0.5 cursor-pointer disabled:opacity-50">{q.kind === "sanity" ? "درست است" : "این مقدار درست است"}</button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.kind === "contradiction" && <button type="button" disabled={busy} onClick={() => decide(q.id, "both_valid")} className="rounded border border-border px-2 py-0.5 cursor-pointer disabled:opacity-50">هر دو درست (تعریف متفاوت)</button>}
                  {q.kind === "sanity" && <button type="button" disabled={busy} onClick={() => decide(q.id, "reject")} className="rounded border border-border px-2 py-0.5 cursor-pointer disabled:opacity-50">رد (غلط است)</button>}
                  <button type="button" disabled={busy} onClick={() => decide(q.id, "dismiss")} className="rounded border border-border px-2 py-0.5 cursor-pointer disabled:opacity-50">نادیده</button>
                </div>
              </li>
            ))}
          </ul>
          {queue.resolved.length > 0 && (
            <details className="mt-3 text-[11px] text-text-muted">
              <summary className="cursor-pointer">تصمیم‌های اخیر ({queue.resolved.length})</summary>
              <ul className="mt-1 space-y-0.5">{queue.resolved.map((r) => <li key={r.id}>{r.subject} ({r.period}) — {r.resolution?.decision} · {r.resolution?.by} · {String(r.resolution?.at).slice(0, 10)}</li>)}</ul>
            </details>
          )}
        </section>
      )}

      {rules && (
        <section className="card p-4">
          <div className="mb-2 text-sm font-bold text-text">قاعده‌ها (همه «پیشنهادی» = فقط برچسب، بدون اثر روی امتیاز)</div>
          <ul className="space-y-3">
            {rules.map((r) => (
              <li key={r.key} className="rounded-lg border border-border p-3 text-xs leading-6">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-text">{r.label}</b>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-text-muted">{r.status || "ثبت نشده"}</span>
                  <span className="text-text-muted" dir="ltr">{r.key}</span>
                  {r.level === "claim"
                    ? <span className="text-text-muted">ادعای برچسب‌خورده: <b className="text-text">{r.flagged}</b></span>
                    : <span className={r.result?.violations?.length ? "text-danger" : "text-text-muted"}>{r.result?.statement || "هنوز بررسی نشده"}</span>}
                </div>
                <p className="mt-1 text-text-muted">{r.text}</p>
                {r.level === "output" && r.result?.violations?.map((v, i) => <div key={i} className="text-danger">⚠ {v.item}: {v.problem}</div>)}
                {r.samples.length > 0 && <div className="mt-1 text-text-muted" dir="ltr">{r.samples.map((x) => `${x.subject} · ${x.metric} · ${x.period || ""}`).join("  |  ")}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-[11px] text-text-muted">موضوع (کشور/سری)<input value={q.subject} onChange={(e) => setQ({ ...q, subject: e.target.value })} className={inp} placeholder="عراق" /></label>
          <label className="text-[11px] text-text-muted">سنجه (پیشوند مجاز)<input value={q.metric} onChange={(e) => setQ({ ...q, metric: e.target.value })} dir="ltr" className={inp} placeholder="total_import_volume" /></label>
          <label className="text-[11px] text-text-muted">باور سیستم در تاریخ (خالی = اکنون)<input value={q.known_at} onChange={(e) => setQ({ ...q, known_at: e.target.value })} dir="ltr" className={inp} placeholder="2026-10-15" /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || (!q.subject.trim() && !q.metric.trim() && !q.known_at.trim())} onClick={ask} className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer">بپرس</button>
          <button type="button" disabled={busy} onClick={migrate} className="rounded-lg border border-border px-4 py-2 text-xs cursor-pointer disabled:opacity-50">اجرای فوری انتقال و پشتیبان</button>
          {msg && <span className="text-xs text-text-muted">{msg}</span>}
        </div>
      </section>

      {res && (
        <section className="card p-4">
          <div className="mb-2 text-xs text-text-muted">{res.count} ردیف (باور در: {res.known_at})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-text-muted"><th className="p-1 text-start">موضوع</th><th className="p-1 text-start">سنجه</th><th className="p-1 text-start">دوره</th><th className="p-1 text-start">مقدار</th><th className="p-1 text-start">ثبت</th><th className="p-1 text-start">بسته‌شدن</th></tr></thead>
              <tbody>
                {res.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="p-1">{r.subject}</td>
                    <td className="p-1" dir="ltr">{r.metric}{r.qualifiers && Object.keys(r.qualifiers).length ? ` ${JSON.stringify(r.qualifiers)}` : ""}</td>
                    <td className="p-1" dir="ltr">{r.period || "—"}</td>
                    <td className="p-1" dir="ltr">{typeof r.value === "string" ? r.value.slice(0, 120) : r.value} {r.unit || ""}</td>
                    <td className="p-1" dir="ltr">{r.recorded_from?.slice(0, 10)}</td>
                    <td className="p-1" dir="ltr">{r.recorded_to?.slice(0, 10) || "—"}{r.change_reason ? ` (${r.change_reason.slice(0, 60)})` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
