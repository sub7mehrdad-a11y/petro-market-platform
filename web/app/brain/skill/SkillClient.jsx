"use client";

import { useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";

const pct = (x) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(1)}٪`);
const num = (x, d = 2) => (x === null || x === undefined ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d }));
const who = (f) => (f.startsWith("brain:") ? `مغز فعلی (${f.slice(6)})` : f.startsWith("machine:judge") ? "داور" : f.startsWith("machine:stat") ? `تحلیل‌گر آماری (${f.split(":").slice(2).join(":")})` : f.startsWith("machine:event") ? `تحلیل‌گر رویدادمحور (${f.split(":").slice(2).join(":")})` : f.replace("human:", ""));

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, ...j };
}

function Skill({ v }) {
  if (v === null || v === undefined) return <span className="text-text-muted">—</span>;
  return <b className={v > 0 ? "text-success" : "text-danger"} dir="ltr">{v > 0 ? "+" : ""}{num(v, 3)}</b>;
}

export default function SkillClient() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [rep, setRep] = useState(null);

  async function load() {
    const r = await api("/api/brain/skill", { cache: "no-store" });
    if (!r.ok) { setError(r.error || "خطا"); return; }
    setError(""); setData(r);
  }
  useEffect(() => { load(); api("/api/brain/reputation", { cache: "no-store" }).then((r) => { if (r.ok) setRep(r); }); }, []);

  async function autopsyNow() {
    setBusy(true); setMsg("");
    const r = await api("/api/brain/skill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "autopsy_now" }) });
    setBusy(false);
    setMsg(r.ok ? `کالبدشکافی تازه ${r.new}، موجود ${r.unchanged}، به صف بازبینی ${r.queued}` : r.error || "انجام نشد");
    load();
  }

  async function scoreNow() {
    setBusy(true); setMsg("");
    const r = await api("/api/brain/skill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score_now" }) });
    setBusy(false);
    setMsg(r.ok ? `نمره‌ی تازه ${r.written}، تغییریافته ${r.changed}، بدون تغییر ${r.unchanged}، بدون داوری ${r.unresolved.length}` : r.error || "انجام نشد");
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="مهارت‌سنجی" subtitle="مهارت = ۱ − (خطای پیش‌بین ÷ خطای خط مبنا). خط مبنا: «قیمت ماه بعد برابر آخرین مقدار شناخته‌شده در لحظه‌ی ثبت است». مهارت مثبت یعنی از این حدس ساده بهتر بودید. نمره‌ی هر نسخه به‌اندازه‌ی مدتی که معتبر بوده وزن دارد." />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      {data && data.summary.length === 0 && (
        <section className="card p-5 text-sm leading-7 text-text-muted">
          هنوز پیش‌بینی‌ای سنجیده نشده است. نمره وقتی ثبت می‌شود که مقدار واقعی ماه هدف از منبعش برسد (برای فوب چین حدود ۳۵ تا ۶۰ روز بعد از پایان ماه). پیش‌بینی‌های در انتظار پایین دیده می‌شوند.
        </section>
      )}

      {data?.summary.map((s) => (
        <section key={s.forecaster} className="card p-5">
          <h2 className="text-sm font-bold text-text">{who(s.forecaster)}{data.me.is_admin ? "" : " (شما)"}</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div><div className="text-text-muted">پرسش سنجیده‌شده</div><b className="text-text">{s.n_questions}</b></div>
            <div><div className="text-text-muted">مهارت میانگین (در برابر خط مبنا)</div><Skill v={s.mean_skill} />{s.n_with_baseline < s.n_questions && <span className="text-text-muted"> ({s.n_with_baseline} از {s.n_questions} خط مبنا داشت)</span>}</div>
            <div><div className="text-text-muted">خوش‌سنجی (داخل بازه‌ی ۸۰٪؛ هدف ۷۰ تا ۹۰٪)</div><b className="text-text">{pct(s.coverage)}</b></div>
            <div><div className="text-text-muted">خطای نسبی میانگین</div><b className="text-text">{pct(s.mean_abs_rel_err)}</b></div>
            <div><div className="text-text-muted">غافلگیری میانگین</div><b className="text-text">{num(s.mean_surprise, 3)}</b></div>
            <div><div className="text-text-muted">تعداد به‌روزرسانی‌ها</div><b className="text-text">{s.revisions}</b></div>
            <div><div className="text-text-muted">گام میانگین / بیشینه</div><b className="text-text">{pct(s.mean_step)} / {pct(s.max_step)}</b></div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-text-muted"><th className="p-1 text-start">دور</th><th className="p-1 text-start">پرسش</th><th className="p-1 text-start">پیش‌بینی نهایی</th><th className="p-1 text-start">مقدار واقعی</th><th className="p-1 text-start">خطا</th><th className="p-1 text-start">مهارت</th><th className="p-1 text-start">غافلگیری</th></tr></thead>
              <tbody>
                {s.questions.map((q) => (
                  <tr key={q.question_id} className="border-t border-border">
                    <td className="p-1" dir="ltr">{q.round_id}</td>
                    <td className="p-1" dir="ltr">{q.question_id.split(":")[1]}</td>
                    <td className="p-1" dir="ltr">{num(q.final_forecast.point, 1)} ({num(q.final_forecast.lo, 0)}–{num(q.final_forecast.hi, 0)})</td>
                    <td className="p-1" dir="ltr">{num(q.outcome, 1)}</td>
                    <td className="p-1" dir="ltr">{pct(q.abs_rel_err)}</td>
                    <td className="p-1"><Skill v={q.skill} /></td>
                    <td className="p-1" dir="ltr">{num(q.surprise, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {data?.pending.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-bold text-text">در انتظار سنجش</h2>
          <ul className="space-y-1 text-xs leading-6">
            {data.pending.map((p, i) => (
              <li key={i} className="text-text-muted"><b className="text-text">{who(p.forecaster)}</b> · {p.text} — سررسید {p.resolves_at}: <span className={p.status.startsWith("بدون داوری") ? "text-warning" : ""}>{p.status}</span></li>
            ))}
          </ul>
        </section>
      )}

      {rep && rep.rows.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-bold text-text">اعتبار{rep.me.is_admin ? " (همه؛ دید مدیر)" : " شما"}</h2>
          <p className="mb-2 text-[11px] leading-6 text-text-muted">اعتبار فقط از مقایسه با واقعیت ساخته می‌شود (نه موافقت با مغز و نه جایگاه). وزن = (n×دقت + {rep.rule.k}×میانگین گروه) ÷ (n + {rep.rule.k}) با کهنگی (نیمه‌عمر {Math.round(rep.rule.half_life_days / 30)} ماه)؛ تا نتیجه‌ها کم است وزن به میانگین گروه نزدیک می‌ماند.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-text-muted"><th className="p-1 text-start">پیش‌بین / منبع / روش</th><th className="p-1 text-start">نوع</th><th className="p-1 text-start">موضوع</th><th className="p-1 text-start">نتیجه‌ها</th><th className="p-1 text-start">دقت</th><th className="p-1 text-start">میانگین گروه</th><th className="p-1 text-start">وزن</th></tr></thead>
              <tbody>
                {rep.rows.map((r) => (
                  <tr key={`${r.entity}|${r.topic}`} className="border-t border-border"><td className="p-1" dir="ltr">{r.entity}</td><td className="p-1">{{ forecaster: "پیش‌بین", method: "روش", source: "منبع", reviewer: "بازبین" }[r.entity_type] || r.entity_type}</td><td className="p-1" dir="ltr">{r.topic}</td><td className="p-1">{r.n_resolved}</td><td className="p-1">{Math.round(r.score * 100)}٪</td><td className="p-1">{Math.round(r.group_mean * 100)}٪</td><td className="p-1"><b>{Math.round(r.weight * 100)}٪</b></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data?.autopsies && data.autopsies.list.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-bold text-text">کالبدشکافی خطاها (حلقه‌ی ۲؛ به ترتیب غافلگیری)</h2>
          <p className="mb-2 text-[11px] leading-6 text-text-muted">فقط خطای سنجیده‌شده در برابر واقعیت؛ علت را کد با نشانه‌های قطعی تعیین می‌کند و مدل فقط روایت/پیشنهاد می‌دهد. هیچ قاعده‌ای خودکار عوض نمی‌شود.{data.autopsies.coverage.map((c) => ` · ${c.month}: ${c.done} از ${c.selected} (${Math.round(c.coverage * 100)}٪)`).join("")}</p>
          <ul className="space-y-2 text-xs leading-6">
            {data.autopsies.list.map((a) => (
              <li key={a.key} className="rounded-lg border border-border p-2">
                <b className="text-text">{a.category_fa || "غافلگیری معکوس"}</b> · <span dir="ltr">{a.forecaster}</span> · {a.month}{a.surprise_rank ? ` · رتبه‌ی غافلگیری ${a.surprise_rank}` : ""}{a.disputed ? " · ⚠ مدل دسته‌ی دیگری پیشنهاد کرد" : ""}
                <p className="text-text-muted">{a.statement}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data?.me.is_admin && (
        <section className="card border-primary p-4">
          <h2 className="mb-2 text-sm font-bold text-text">مدیر</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={scoreNow} className="rounded-lg border border-border px-4 py-2 text-xs cursor-pointer disabled:opacity-50">سنجش همین الان</button>
            <button type="button" disabled={busy} onClick={autopsyNow} className="rounded-lg border border-border px-4 py-2 text-xs cursor-pointer disabled:opacity-50">کالبدشکافی خطاها همین الان</button>
          </div>
          {msg && <p className="mt-2 text-xs text-text-muted">{msg}</p>}
        </section>
      )}
    </div>
  );
}
