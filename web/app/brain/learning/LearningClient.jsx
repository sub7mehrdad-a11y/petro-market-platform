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

          <BacktestSection />
        </>
      )}
    </div>
  );
}

const pct = (x) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(0)}٪`);
const n2 = (x, d = 2) => (x === null || x === undefined ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d }));

// آزمون بازپخش کشورها (۱۰-ب): مغز با پنهان‌کردن کشور هدف، کمیت‌های آن را پیش‌بینی می‌کند و با نتیجه‌ی پژوهش خودمان سنجیده می‌شود.
function BacktestSection() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState([]);
  const load = useCallback(async () => {
    const r = await api("/api/brain/backtest", { cache: "no-store" });
    if (!r.ok) { setErr(r.error || "خطا"); return; }
    setErr(""); setD(r);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function runOne(country) {
    setBusy(country);
    const r = await api("/api/brain/backtest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", country }) });
    setLog((l) => [...l, r.ok ? `${country}: ${r.scored} از ${r.total} هدف سنجیده شد` : `${country}: ${r.error || "ناموفق"}`]);
    setBusy("");
  }
  async function runAll() {
    setLog([]);
    for (const c of d.countries) await runOne(c);
    await load();
  }
  const s = d?.summary;
  return (
    <section className="card p-5 space-y-3 text-sm">
      <h2 className="font-bold">آزمون بازپخش کشورها</h2>
      <p className="text-xs text-text-muted leading-6">مغز بدون دیدن هیچ‌چیز از خودِ کشور هدف (فقط شاخص‌های عمومی و کشورهای دیگرِ پژوهش‌شده) چند کمیت را پیش‌بینی می‌کند و با نتیجه‌ی پژوهش همان کشور سنجیده می‌شود. خط مبنا: میانه‌ی کشورهای دیگر. نتیجه جدا از نمره‌ی زنده است. «مقدار واقعی» برآورد پژوهش خودمان است، نه آمار بیرونی.</p>
      {err && <div className="text-danger text-xs">{err}</div>}
      {d && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!!busy || !d.has_key} onClick={runAll} className="rounded border border-border px-3 py-1 cursor-pointer disabled:opacity-50">{busy ? `در حال اجرا: ${busy}…` : "اجرای همه‌ی کشورها"}</button>
            {!d.has_key && <span className="text-xs text-danger">کلید مغز تنظیم نشده</span>}
            {s?.overall?.n > 0 && <span className="text-xs text-text-muted">{s.overall.n} هدف سنجیده؛ مهارت میانگین {n2(s.overall.mean_skill)}؛ بهتر از خط مبنا در {s.overall.beats_baseline_pct ?? "—"}٪؛ پوشش بازه‌ی ۸۰٪: {pct(s.overall.coverage)} (هدف ≈ ۸۰٪)</span>}
          </div>
          {log.length > 0 && <ul className="text-xs text-text-muted">{log.map((l, i) => <li key={i}>• {l}</li>)}</ul>}
          {s?.by_target?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border text-text-muted">{["هدف", "n", "مهارت", "بهتر از مبنا", "پوشش بازه", "خطای نسبی"].map((h) => <th key={h} className="px-2 py-1 text-start font-medium">{h}</th>)}</tr></thead>
                <tbody>{s.by_target.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0"><td className="px-2 py-1">{t.label}</td><td className="px-2 py-1">{t.n}</td><td className={`px-2 py-1 ${t.mean_skill > 0 ? "text-success" : "text-danger"}`}>{n2(t.mean_skill)}</td><td className="px-2 py-1">{t.beats_baseline_pct ?? "—"}٪</td><td className="px-2 py-1">{pct(t.coverage)}</td><td className="px-2 py-1">{pct(t.mean_abs_rel_err)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <SelfLearning d={d} reload={load} />
          <div className="flex flex-wrap gap-2 text-xs">
            {d.countries.map((c) => {
              const row = s?.by_country?.find((x) => x.country === c);
              return <button key={c} type="button" disabled={!!busy || !d.has_key} onClick={async () => { await runOne(c); await load(); }} className="rounded-full border border-border px-3 py-1 cursor-pointer disabled:opacity-50">{c}{row ? ` · مهارت ${n2(row.mean_skill)}` : ""}</button>;
            })}
          </div>
        </>
      )}
    </section>
  );
}

// یادگیری خودکار پیش‌بین کشور: کالبدشکافی چندزاویه ← قاعده‌ی کلی ← نسخه‌ی تازه ← سنجش روی کشورهای دیده‌نشده ← فعال یا بایگانی؛ بدون تأیید انسان.
function SelfLearning({ d, reload }) {
  const L = d.learning;
  const st = L?.status || {};
  useEffect(() => {
    if (!st.running) return undefined;
    const t = setInterval(reload, 6000);
    return () => clearInterval(t);
  }, [st.running, reload]);
  async function start() {
    const r = await api("/api/brain/backtest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "learn_start" }) });
    if (!r.ok) alert(r.error || "شروع نشد");
    reload();
  }
  const active = L?.methods?.find((m) => m.status === "فعال");
  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <b className="text-sm">یادگیری خودکار از اشتباه</b>
        <button type="button" disabled={st.running || !d.has_key} onClick={start} className="rounded border border-border px-3 py-1 text-xs cursor-pointer disabled:opacity-50">{st.running ? "در حال یادگیری…" : "شروع یادگیری خودکار"}</button>
        {active && <span className="text-xs text-text-muted">روش فعال: {active.version} ({active.rules.length} قاعده)</span>}
      </div>
      <p className="text-xs leading-6 text-text-muted">مغز خطاهای بزرگ را از چند زاویه می‌پرسد (اطلاعات اولیه، قاعده، روش، عامل ویژه‌ی کشور، کالیبراسیون)، قاعده‌ی استدلال کلی می‌نویسد (نه «۲۰٪ پایین‌تر بگیر»، نه نام کشور)، نسخه‌ی تازه‌ی روش را روی کشورهایی که از خطایشان درس نگرفته می‌سنجد و فقط اگر بهتر بود فعالش می‌کند؛ وگرنه بایگانی. نیازی به تأیید شما نیست.</p>
      {st.error && <div className="text-xs text-danger">{st.error}</div>}
      {st.summary && <p className="text-xs">آخرین اجرا: {st.summary.promoted} نسخه فعال شد؛ خطای نسبی کل {st.summary.initial?.mean_abs_rel_err != null ? `${Math.round(st.summary.initial.mean_abs_rel_err * 100)}٪` : "—"} ← {st.summary.final?.mean_abs_rel_err != null ? `${Math.round(st.summary.final.mean_abs_rel_err * 100)}٪` : "—"} (روی همه‌ی کشورها؛ خوش‌بینانه چون بخشی از آن‌ها آموزش بوده‌اند).</p>}
      {st.log?.length > 0 && <details open={st.running} className="text-xs"><summary className="cursor-pointer">گزارش پیشرفت ({st.log.length} خط)</summary><pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-canvas p-2 leading-5">{st.log.join("\n")}</pre></details>}
      {L?.methods?.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {L.methods.map((m) => (
            <li key={m.version} className="rounded border border-border p-2">
              <b>{m.version}</b> — <span className={m.status === "فعال" ? "text-success" : "text-text-muted"}>{m.status}</span>{m.comparables?.mode === "nearest" && <span> · مقایسه با {m.comparables.k} کشور نزدیک</span>}
              {m.validation?.pairs > 0 && <span> · آزمون روی {m.validation.pairs} هدف دیده‌نشده: خطا {n2(m.validation.err_current * 100, 0)}٪ ← {n2(m.validation.err_candidate * 100, 0)}٪ (بهتر {m.validation.better}، بدتر {m.validation.worse})</span>}
              {m.reason && <div className="text-text-muted">{m.reason}</div>}
              {m.rules.length > 0 && <ol className="mt-1 list-decimal ps-5">{m.rules.map((r, i) => <li key={i}>{r}</li>)}</ol>}
            </li>
          ))}
        </ul>
      )}
      {L?.autopsies?.length > 0 && (
        <details className="text-xs"><summary className="cursor-pointer">{L.autopsies.length} کالبدشکافی چندزاویه</summary>
          <ul className="mt-1 space-y-2">{L.autopsies.map((a, i) => (
            <li key={i}><b>{a.country} / {a.target}</b> — {a.root_cause_fa || "علت نامعلوم"}
              <ul className="ps-4 text-text-muted"><li>اطلاعات اولیه: {a.answers.info}</li><li>قاعده: {a.answers.rule}</li><li>روش: {a.answers.method}</li><li>عامل ویژه‌ی کشور: {a.answers.country_factor}</li><li>کالیبراسیون: {a.answers.calibration}</li></ul>
              {a.fix && <div>← قاعده‌ی کلی: {a.fix}</div>}{a.rejected && <div className="text-warning">قاعده‌ی پیشنهادی رد شد: {a.rejected}</div>}
            </li>))}</ul>
        </details>
      )}
    </div>
  );
}
