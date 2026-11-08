"use client";

import { useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, ...j };
}
const num = (x) => (typeof x === "number" ? Number(x).toLocaleString("en-US", { maximumFractionDigits: 2 }) : x);
const inp = "mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";
const KIND_FA = { analysis_score: "نمره‌ی تحلیل", data_check: "بررسی عدد", rule_critique: "نقد قاعده", critique: "نقد آزاد" };

function Stars({ value, onChange }) {
  return (
    <div className="mt-1 flex gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className={`h-8 w-8 rounded-lg border text-sm cursor-pointer ${value === n ? "border-primary bg-primary text-white" : "border-border"}`}>{n}</button>
      ))}
    </div>
  );
}

function ItemCard({ it, onDone }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e && e.target ? e.target.value : e }));
  const kind = it.type === "claim" ? "data_check" : it.type === "rule" ? "rule_critique" : "analysis_score";

  async function submit() {
    setBusy(true); setErr("");
    const r = await api("/api/brain/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", ref: it.ref, kind, fields: f }) });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "ثبت نشد"); return; }
    onDone(r.today);
  }
  if (it.gone) return <section className="card p-4 text-xs text-text-muted">این مورد دیگر وجود ندارد.</section>;
  return (
    <section className="card p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
        <span className="rounded-full bg-canvas px-2 py-0.5">{it.selection}</span>
        {it.done && <span className="rounded-full bg-success-soft px-2 py-0.5 text-success">ثبت شد</span>}
      </div>
      <h3 className="text-sm font-bold leading-7 text-text">{it.title}</h3>
      <p className="mt-1 text-sm leading-7 text-text">{it.statement}</p>
      {Object.keys(it.numbers || {}).length > 0 && (
        <div className="mt-2 text-xs text-text-muted" dir="ltr">{Object.entries(it.numbers).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}: ${num(v)}`).join("  ·  ")}</div>
      )}
      {it.cited?.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] leading-5 text-text-muted">
          <li className="font-bold text-text">داده‌هایی که این تحلیل به آن‌ها تکیه کرده:</li>
          {it.cited.map((c) => <li key={c.claim_key} dir="auto">• {c.line}</li>)}
        </ul>
      )}
      {it.done && <p className="mt-3 text-xs text-text-muted">بازخورد شما ثبت است. اگر نظرتان عوض شد دوباره ثبت کنید (نسخه‌ی تازه می‌شود).</p>}

      <div className="mt-3 space-y-3 border-t border-border pt-3">
        {kind === "analysis_score" && (
          <>
            <label className="block text-[11px] text-text-muted">۱) داده‌ها درست است؟
              <select value={f.data_ok || ""} onChange={set("data_ok")} className={inp}><option value="">انتخاب کنید</option><option value="yes">بله</option><option value="no">نه</option><option value="unknown">نمی‌دانم</option></select>
            </label>
            {f.data_ok === "no" && (
              <>
                {it.cited?.length > 0 && <label className="block text-[11px] text-text-muted">کدام عدد؟ (اختیاری)<select value={f.claim_key || ""} onChange={set("claim_key")} className={inp}><option value="">—</option>{it.cited.map((c) => <option key={c.claim_key} value={c.claim_key}>{c.line.slice(0, 90)}</option>)}</select></label>}
                <label className="block text-[11px] text-text-muted">چه چیزی غلط است؟<input value={f.data_note || ""} onChange={set("data_note")} className={inp} /></label>
              </>
            )}
            <div className="text-[11px] text-text-muted">۲) استدلال منطقی است؟ (۱ ضعیف تا ۵ عالی)<Stars value={f.reasoning} onChange={set("reasoning")} /></div>
            <div className="text-[11px] text-text-muted">۳) قابل‌اجراست؟ (۱ تا ۵)<Stars value={f.actionable} onChange={set("actionable")} /></div>
          </>
        )}
        {kind === "data_check" && (
          <>
            <label className="block text-[11px] text-text-muted">این عدد درست است؟
              <select value={f.verdict || ""} onChange={set("verdict")} className={inp}><option value="">انتخاب کنید</option><option value="correct">درست</option><option value="wrong">غلط</option><option value="unknown">نمی‌دانم</option></select>
            </label>
            {f.verdict === "wrong" && (
              <>
                <label className="block text-[11px] text-text-muted">مقدار درست (اگر می‌دانید)<input value={f.believed_value || ""} onChange={set("believed_value")} dir="ltr" className={inp} /></label>
                <label className="block text-[11px] text-text-muted">توضیح یا منبع<input value={f.note || ""} onChange={set("note")} className={inp} /></label>
              </>
            )}
          </>
        )}
        {kind === "rule_critique" && (
          <>
            <label className="block text-[11px] text-text-muted">با این قاعده موافقید؟
              <select value={f.stance || ""} onChange={set("stance")} className={inp}><option value="">انتخاب کنید</option><option value="agree">موافقم</option><option value="disagree">مخالفم</option></select>
            </label>
            {f.stance === "disagree" && <label className="block text-[11px] text-text-muted">دلیل (و شاهد)<input value={f.reason || ""} onChange={set("reason")} className={inp} /></label>}
          </>
        )}
        {err && <div className="text-xs text-danger">{err}</div>}
        <button type="button" disabled={busy} onClick={submit} className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer">{busy ? "…" : it.done ? "به‌روزرسانی بازخورد" : "ثبت بازخورد"}</button>
      </div>
    </section>
  );
}

export default function ReviewClient() {
  const [data, setData] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [error, setError] = useState("");
  const [crit, setCrit] = useState({ ref: "", type: "data", reason: "", evidence: "" });
  const [cmsg, setCmsg] = useState("");

  async function load() {
    const r = await api("/api/brain/review", { cache: "no-store" });
    if (!r.ok) { setError(r.error || "خطا"); return; }
    setError(""); setData(r);
    if (r.me.is_admin) {
      const a = await api("/api/brain/review?admin=1", { cache: "no-store" });
      if (a.ok) setAdmin(a);
    }
  }
  useEffect(() => { load(); }, []);

  async function sendCritique() {
    setCmsg("");
    const r = await api("/api/brain/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", ref: crit.ref, kind: "critique", fields: { type: crit.type, reason: crit.reason, evidence: crit.evidence } }) });
    setCmsg(r.ok ? "نقد ثبت شد." : r.error || "ثبت نشد");
    if (r.ok) { setCrit({ ref: "", type: "data", reason: "", evidence: "" }); load(); }
  }

  const t = data?.today;
  return (
    <div className="space-y-6">
      <PageHeader title="بازبینی روزانه" subtitle="حداکثر ۵ مورد در روز (۳ مورد هدفمند و ۲ تصادفی برای حسابرسی). ارزیابی کور است: نمی‌دانید تحلیل را کدام تحلیل‌گر یا مدل نوشته. نمره‌ی شما برای بهبود شکل خروجی و کشف داده‌ی غلط است؛ جای سنجش با واقعیت را نمی‌گیرد." />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {t && <div className="text-sm text-text-muted">امروز ({t.date}): <b className="text-text">{t.answered} از {t.total}</b> ثبت شده{t.total === 0 ? " — امروز موردی برای شما نیست." : ""}</div>}
      {t?.items.map((it) => <ItemCard key={it.ref} it={it} onDone={(today) => setData((d) => ({ ...d, today }))} />)}

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-bold text-text">نقد آزاد</h2>
        <p className="mb-2 text-[11px] leading-6 text-text-muted">با یک ادعا، قاعده یا روش مخالفید؟ شناسه‌ی مورد (مثلاً <span dir="ltr">claim:…</span> یا <span dir="ltr">rule:…</span>) را بگذارید و دلیل و شاهد را بنویسید.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[11px] text-text-muted">شناسه‌ی مورد<input value={crit.ref} onChange={(e) => setCrit({ ...crit, ref: e.target.value })} dir="ltr" className={inp} /></label>
          <label className="text-[11px] text-text-muted">نوع<select value={crit.type} onChange={(e) => setCrit({ ...crit, type: e.target.value })} className={inp}><option value="data">داده</option><option value="rule">قاعده</option><option value="reasoning">استدلال</option><option value="method">روش</option></select></label>
          <label className="text-[11px] text-text-muted sm:col-span-2">دلیل<input value={crit.reason} onChange={(e) => setCrit({ ...crit, reason: e.target.value })} className={inp} /></label>
          <label className="text-[11px] text-text-muted sm:col-span-2">شاهد (اختیاری)<input value={crit.evidence} onChange={(e) => setCrit({ ...crit, evidence: e.target.value })} className={inp} /></label>
        </div>
        <button type="button" onClick={sendCritique} disabled={!crit.ref || crit.reason.trim().length < 5} className="mt-3 rounded-lg border border-border px-4 py-2 text-xs cursor-pointer disabled:opacity-50">ثبت نقد</button>
        {cmsg && <span className="ms-3 text-xs text-text-muted">{cmsg}</span>}
      </section>

      {admin && (
        <section className="card border-primary p-4">
          <h2 className="mb-2 text-sm font-bold text-text">مدیر: مشارکت و بازخوردها</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-text-muted"><th className="p-1 text-start">نفر</th><th className="p-1 text-start">روز</th><th className="p-1 text-start">ارسال‌شده</th><th className="p-1 text-start">ثبت‌شده</th><th className="p-1 text-start">نرخ ثبت (هدف بیش از ۸۰٪)</th><th className="p-1 text-start">میانگین نمره‌ی استدلال</th><th className="p-1 text-start">نمره‌ی بالا به تحلیل با مهارت منفی</th></tr></thead>
              <tbody>
                {admin.stats.people.map((p) => (
                  <tr key={p.user} className="border-t border-border"><td className="p-1">{p.user}</td><td className="p-1">{p.days}</td><td className="p-1">{p.assigned}</td><td className="p-1">{p.answered}</td><td className="p-1">{p.response_rate === null ? "—" : `${Math.round(p.response_rate * 100)}٪`}</td><td className="p-1">{p.mean_reasoning ?? "—"}</td><td className="p-1">{p.high_rating_on_negative_skill} از {p.scored_targets}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-text-muted">مورد باز در صف بازبینی ناشی از بازخورد انسان: {admin.stats.open_human_items} (در صفحه‌ی «حافظه‌ی مغز»)</p>
          <details className="mt-2 text-[11px] text-text-muted">
            <summary className="cursor-pointer">آخرین بازخوردها ({admin.feedback.length})</summary>
            <ul className="mt-1 space-y-1">{admin.feedback.map((f) => <li key={f.id}><b className="text-text">{f.giver.replace("human:", "")}</b> · {KIND_FA[f.kind] || f.kind} · {f.selection} · <span dir="ltr">{f.target.slice(0, 40)}</span>{f.analyst ? ` · (تحلیل‌گر: ${f.analyst})` : ""} · {JSON.stringify(f.scores)}{f.comment ? ` — ${f.comment}` : ""}</li>)}</ul>
          </details>
        </section>
      )}
    </div>
  );
}
