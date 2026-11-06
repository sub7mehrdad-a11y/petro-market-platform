"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";

const fa = (n, d = 0) => (n == null ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d }));
const num = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 }));
const when = (iso) => new Date(iso).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, ...j };
}

function Interval({ f }) {
  return (
    <span dir="ltr" className="font-semibold">
      {num(f.point)} <span className="text-text-muted font-normal">({num(f.lo)} – {num(f.hi)})</span>
    </span>
  );
}

function QuestionCard({ q, round, onSaved }) {
  const [v, setV] = useState({ point: "", lo: "", hi: "", rationale: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const lv = q.last_value;

  async function submit() {
    if (!confirm("بعد از ثبت، پیش‌بینی قابل ویرایش یا حذف نیست و پیش‌بینی مغز نشان داده می‌شود. ثبت شود؟")) return;
    setBusy(true); setErr("");
    const r = await api("/api/brain/forecasts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round_id: round.round_id, question_id: q.id, point: Number(v.point), lo: Number(v.lo), hi: Number(v.hi), rationale: v.rationale }),
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "ثبت نشد"); return; }
    onSaved(r.round);
  }

  const inp = "mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";
  return (
    <section className="card p-5">
      <h3 className="text-sm font-bold leading-7 text-text">{q.text}</h3>
      <div className="mt-1 space-y-0.5 text-[11px] leading-6 text-text-muted">
        <div>منبع واقعیت: <span className="text-text">{q.target.truth_source.source_id}</span>{q.target.truth_source.confidential ? " (داخلی)" : ""} · سررسید داوری: {q.resolves_at} · {q.target.package_fa}</div>
        {lv && <div>آخرین مقدار ثبت‌شده‌ی این سری: <b dir="ltr">{num(lv.value)} {lv.currency}/{lv.unit}</b> (دوره‌ی گزارش {lv.reported} · {lv.source})</div>}
      </div>

      {q.mine ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-canvas p-3 text-sm">
            <div className="mb-1 text-[11px] font-bold text-text-muted">پیش‌بینی شما (ثبت‌شده، غیرقابل‌ویرایش)</div>
            <Interval f={q.mine.forecast} />
            <div className="text-[11px] text-text-muted">{when(q.mine.made_at)}</div>
            {q.mine.rationale && <p className="mt-1 text-xs leading-6 text-text">{q.mine.rationale}</p>}
          </div>
          {q.brain ? (
            <div className="rounded-lg border border-primary bg-primary-soft p-3 text-sm">
              <div className="mb-1 text-[11px] font-bold text-primary-hover">پیش‌بینی مغز</div>
              <Interval f={q.brain.forecast} />
              <div className="text-[11px] text-text-muted">{q.brain.model} · {q.brain.method_version}</div>
              {q.brain.rationale && <p className="mt-1 text-xs leading-6 text-text">{q.brain.rationale}</p>}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-text-muted">پیش‌بینی مغز برای این پرسش هنوز ثبت نشده است.</div>
          )}
        </div>
      ) : round.can_submit ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-text-muted">کف بازه‌ی ۸۰٪<input value={v.lo} onChange={set("lo")} dir="ltr" inputMode="decimal" className={inp} /></label>
            <label className="text-[11px] text-text-muted">عدد پیش‌بینی (بهترین حدس)<input value={v.point} onChange={set("point")} dir="ltr" inputMode="decimal" className={inp} /></label>
            <label className="text-[11px] text-text-muted">سقف بازه‌ی ۸۰٪<input value={v.hi} onChange={set("hi")} dir="ltr" inputMode="decimal" className={inp} /></label>
          </div>
          <label className="block text-[11px] text-text-muted">دلیل (اختیاری، کوتاه)
            <textarea value={v.rationale} onChange={set("rationale")} rows={2} maxLength={round.limits.rationale_max_chars} className={inp} />
          </label>
          {err && <div className="text-xs text-danger">{err}</div>}
          <div className="flex items-center gap-3">
            <button type="button" disabled={busy || !v.point || !v.lo || !v.hi} onClick={submit} className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer">{busy ? "…" : "ثبت پیش‌بینی"}</button>
            <span className="text-[11px] text-text-muted">پیش‌بینی مغز تا ثبت شما نشان داده نمی‌شود.</span>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-text-muted">مهلت ثبت تمام شده و برای این پرسش پیش‌بینی‌ای ثبت نکرده‌اید.</div>
      )}

      {q.others?.length > 0 && (
        <div className="mt-3 rounded-lg border border-border p-3 text-xs">
          <div className="mb-1 font-bold text-text">پیش‌بینی‌های همکاران (فقط مدیر، بعد از بسته شدن دور)</div>
          <ul className="space-y-1">
            {q.others.map((o) => (
              <li key={o.id}>{o.forecaster.replace("human:", "")}: <Interval f={o.forecast} />{o.rationale ? <span className="text-text-muted"> — {o.rationale}</span> : null}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-2 text-[11px] text-text-muted">وضعیت داوری: <b>{q.status}</b> (نمره‌دهی خودکار در مرحله‌ی بعد؛ اگر مقدار واقعی نرسد، بدون نمره می‌ماند)</div>
    </section>
  );
}

export default function ForecastClient() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [roundId, setRoundId] = useState("");
  const [adminMsg, setAdminMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (rid) => {
    const r = await api(`/api/brain/forecasts${rid ? `?round=${rid}` : ""}`, { cache: "no-store" });
    if (!r.ok) { setError(r.error || "خطا"); return; }
    setError(""); setData(r); setRoundId(r.round?.round_id || "");
  }, []);
  useEffect(() => { load(""); }, [load]);

  async function admin(action) {
    setBusy(true); setAdminMsg("");
    const r = await api("/api/brain/forecasts/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, round_id: roundId || undefined }) });
    setBusy(false);
    if (!r.ok) { setAdminMsg(r.error || "انجام نشد"); }
    else if (action === "open_round") setAdminMsg(r.created ? `دور ${r.round_id} باز شد.` : `دور ${r.round_id} از قبل باز بود.`);
    else setAdminMsg(`نتیجه‌ی پیش‌بینی مغز: ${r.results.map((x) => `${x.question.split(":")[1]}=${x.status}${x.error ? ` (${x.error})` : ""}`).join("؛ ")}`);
    load(roundId);
  }

  const round = data?.round;
  return (
    <div className="space-y-6">
      <PageHeader title="دفتر پیش‌بینی" subtitle="هر ماه برای قیمت فوب ماه بعد پیش‌بینی ثبت می‌شود: شما، همکاران و مغز؛ هرکدام مستقل. با گذشت زمان، مقدار واقعی هرکس را داوری می‌کند و معلوم می‌شود چه کسی (و مغز) از ساده‌ترین حدس («قیمت ماه بعد = همین ماه») بهتر است." />

      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {data?.storage_problem && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">⚠ {data.storage_problem}</div>}

      <section className="card p-4 text-xs leading-7 text-text-muted">
        <b className="text-text">قاعده‌ها:</b> ۱) پیش‌بینی خودتان را <b>پیش از دیدن</b> پیش‌بینی مغز ثبت کنید. ۲) بعد از ثبت قابل ویرایش نیست. ۳) «بازه‌ی ۸۰٪» یعنی کف و سقفی که ۸۰٪ مطمئنید مقدار واقعی بینشان می‌افتد (نه بازه‌ی خیلی باریک، نه بی‌معنی پهن). ۴) پیش‌بینی همکاران تا پایان مهلت برای هیچ‌کس دیده نمی‌شود. ۵) قیمت فوب = قیمت مبدأ؛ با سی‌آی‌اف و ارزش واحد واردات قابل‌مقایسه نیست.
      </section>

      {data && !round && (
        <section className="card p-5 text-sm text-text-muted">
          هنوز دوری باز نشده است. {data.me.is_admin ? "مدیر می‌تواند پایین «باز کردن دور این ماه» را بزند." : "منتظر باز شدن دور توسط مدیر یا زمان‌بند ماهانه باشید."}
        </section>
      )}

      {round && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select value={roundId} onChange={(e) => load(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-1.5">
              {data.rounds.map((r) => <option key={r.round_id} value={r.round_id}>دور {r.round_id} (هدف: {r.target_month})</option>)}
            </select>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${round.open ? "bg-success-soft text-success" : "bg-canvas text-text-muted"}`}>
              {round.open ? `باز تا ${when(round.closes_at)}` : `بسته شده (${when(round.closes_at)})`}
            </span>
            <span className="text-xs text-text-muted">پیش‌بینی برای ماه <b dir="ltr">{round.target_month}</b></span>
          </div>
          {round.questions.map((q) => (
            <QuestionCard key={q.id} q={q} round={round} onSaved={(r) => setData((d) => ({ ...d, round: r }))} />
          ))}
        </>
      )}

      {data?.me.is_admin && (
        <section className="card border-primary p-4">
          <h2 className="mb-2 text-sm font-bold text-text">مدیر</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => admin("open_round")} className="rounded-lg border border-border px-4 py-2 text-xs cursor-pointer disabled:opacity-50">باز کردن دور این ماه</button>
            <button type="button" disabled={busy || !round} onClick={() => admin("brain_forecasts")} className="rounded-lg border border-border px-4 py-2 text-xs cursor-pointer disabled:opacity-50">ثبت پیش‌بینی مغز برای پرسش‌های بدون پیش‌بینی</button>
          </div>
          {adminMsg && <p className="mt-2 text-xs leading-6 text-text">{adminMsg}</p>}
          {data.participation && (
            <p className="mt-2 text-[11px] leading-6 text-text-muted">تعداد پیش‌بینی ثبت‌شده در این دور (بدون مقدار): {Object.entries(data.participation).map(([k, v]) => `${k.replace("human:", "")}=${v}`).join("، ")}</p>
          )}
        </section>
      )}
    </div>
  );
}
