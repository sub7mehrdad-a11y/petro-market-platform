"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../../components/PageHeader";
import { SalesNav, fa, fdate } from "../../salesUi";
import { PaymentForm, PaymentList } from "../../accounts/AccountsClient";
import ContractForm from "../ContractForm";

const money = (n, cur = "USD") => (n == null ? "—" : `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${cur}`);
const today = () => new Date().toISOString().slice(0, 10);
const inputCls = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";
const ACTION_FA = { create: "ثبت", update: "ویرایش", step: "مرحله", note: "یادداشت", cancel: "لغو", reopen: "بازگردانی", adopt: "انتقال", shipment: "بارگیری", payment: "پرداخت" };
const SHIP_FA = { queued: "در صف بارگیری", loaded: "بارگیری شد", shipped: "ارسال شد" };
const SHIP_CLS = { queued: "bg-warning-soft text-warning", loaded: "bg-primary-soft text-primary-hover", shipped: "bg-success-soft text-success" };

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, ...j };
}
const patch = (body) => api("/api/sales/contracts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const show = (v) => (v == null || v === "" ? "—" : String(v));

function Shipments({ c, act, busy }) {
  const t = c.shipment_totals || { planned: 0, loaded: 0, shipped: 0, remaining: c.tons };
  const [f, setF] = useState({ tons: "", planned_date: "", note: "" });
  const [edit, setEdit] = useState(null); // {id, tons, planned_date, note, vehicle}
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const cancelled = c.status === "cancelled";

  async function add(e) {
    e.preventDefault();
    setErr("");
    const r = await act({ action: "shipment_add", shipment: { tons: f.tons || t.remaining, planned_date: f.planned_date, note: f.note } }, true);
    if (r?.ok) setF({ tons: "", planned_date: "", note: "" }); else if (r) setErr(r.errors?.join(" ") || r.error || "ثبت نشد");
  }
  async function setStatus(s, status) {
    const label = status === "loaded" ? "تاریخ بارگیری" : "تاریخ ارسال";
    const d = prompt(`${label} (خالی = امروز):`, today());
    if (d === null) return;
    const body = { status };
    if (status === "loaded") body.loaded_at = d || today(); else body.shipped_at = d || today();
    const r = await act({ action: "shipment_update", shipment_id: s.id, shipment: body }, true);
    if (r && !r.ok) alert(r.errors?.join(" ") || r.error || "انجام نشد");
  }
  async function saveEdit() {
    const r = await act({ action: "shipment_update", shipment_id: edit.id, shipment: { tons: edit.tons, planned_date: edit.planned_date, note: edit.note, vehicle: edit.vehicle } }, true);
    if (r?.ok) setEdit(null); else if (r) alert(r.errors?.join(" ") || r.error || "ذخیره نشد");
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-text">بارگیری و ارسال</h2>
        <div className="flex flex-wrap gap-3 text-[11px] text-text-muted">
          <span>کل قرارداد <b className="text-text">{fa(c.tons, 1)}</b> تن</span><span>برنامه‌ریزی‌شده <b className="text-text">{fa(t.planned, 1)}</b></span>
          <span>بارگیری‌شده <b className="text-text">{fa(t.loaded, 1)}</b></span><span>ارسال‌شده <b className="text-text">{fa(t.shipped, 1)}</b></span><span>بدون برنامه <b className={t.remaining > 0 ? "text-warning" : "text-text"}>{fa(t.remaining, 1)}</b></span>
        </div>
      </div>
      {(c.shipments || []).length === 0 && <p className="mb-2 text-xs text-text-muted">بارگیری ثبت نشده است.</p>}
      {(c.shipments || []).length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-text-muted">{["تن", "برنامه", "وضعیت", "بارگیری", "ارسال", "توضیح", ""].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {c.shipments.map((s) => edit?.id === s.id ? (
                <tr key={s.id} className="border-b border-border bg-canvas">
                  <td className="px-2 py-1.5"><input value={edit.tons} onChange={(e) => setEdit({ ...edit, tons: e.target.value })} dir="ltr" className={`${inputCls} w-20`} /></td>
                  <td className="px-2 py-1.5"><input value={edit.planned_date || ""} onChange={(e) => setEdit({ ...edit, planned_date: e.target.value })} dir="ltr" placeholder="۱۴۰۵/۰۹/۲۰" className={`${inputCls} w-28`} /></td>
                  <td className="px-2 py-1.5" colSpan={2}><input value={edit.vehicle || ""} onChange={(e) => setEdit({ ...edit, vehicle: e.target.value })} placeholder="وسیله / شماره بارنامه" className={`${inputCls} w-full`} /></td>
                  <td className="px-2 py-1.5" colSpan={2}><input value={edit.note || ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="توضیح" className={`${inputCls} w-full`} /></td>
                  <td className="px-2 py-1.5 whitespace-nowrap"><button type="button" onClick={saveEdit} className="text-primary hover:underline cursor-pointer">ذخیره</button> <button type="button" onClick={() => setEdit(null)} className="text-text-muted hover:underline cursor-pointer">انصراف</button></td>
                </tr>
              ) : (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5 font-semibold">{fa(s.tons, 1)}</td>
                  <td className="px-2 py-1.5">{fdate(s.planned_date)}</td>
                  <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] ${SHIP_CLS[s.status]}`}>{SHIP_FA[s.status]}</span></td>
                  <td className="px-2 py-1.5">{fdate(s.loaded_at)}</td>
                  <td className="px-2 py-1.5">{fdate(s.shipped_at)}</td>
                  <td className="px-2 py-1.5">{[s.vehicle, s.note].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {!cancelled && s.status === "queued" && <button type="button" disabled={busy} onClick={() => setStatus(s, "loaded")} className="text-primary hover:underline cursor-pointer">بارگیری شد</button>}
                    {!cancelled && s.status === "loaded" && <button type="button" disabled={busy} onClick={() => setStatus(s, "shipped")} className="text-primary hover:underline cursor-pointer">ارسال شد</button>}
                    {!cancelled && s.status !== "queued" && <button type="button" disabled={busy} onClick={() => act({ action: "shipment_update", shipment_id: s.id, shipment: { status: s.status === "shipped" ? "loaded" : "queued" } })} className="ms-2 text-text-muted hover:underline cursor-pointer">برگشت مرحله</button>}
                    {!cancelled && <button type="button" onClick={() => setEdit({ id: s.id, tons: s.tons, planned_date: s.planned_date, note: s.note, vehicle: s.vehicle })} className="ms-2 text-text-muted hover:underline cursor-pointer">ویرایش</button>}
                    {!cancelled && <button type="button" disabled={busy} onClick={() => { if (confirm("این بارگیری حذف شود؟ (در تاریخچه می‌ماند)")) act({ action: "shipment_delete", shipment_id: s.id }); }} className="ms-2 text-danger hover:underline cursor-pointer">حذف</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!cancelled && (
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[8rem_10rem_1fr_auto]">
          <input value={f.tons} onChange={set("tons")} placeholder={t.remaining > 0 ? `تن (باقیمانده ${t.remaining})` : "تن"} dir="ltr" inputMode="decimal" className={inputCls} />
          <input value={f.planned_date} onChange={set("planned_date")} placeholder="تاریخ برنامه ۱۴۰۵/۰۹/۲۰" dir="ltr" className={inputCls} />
          <input value={f.note} onChange={set("note")} placeholder="توضیح (کامیون، کانتینر، مقصد…)" className={inputCls} />
          <button type="submit" disabled={busy || t.remaining <= 0} className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white disabled:opacity-50 cursor-pointer">افزودن بارگیری</button>
          {err && <p className="text-xs text-danger sm:col-span-4">{err}</p>}
        </form>
      )}
    </section>
  );
}

function History({ c }) {
  const events = useMemo(() => {
    const own = (c.history || []).map((h) => ({ at: h.at, by: h.by, action: h.action, summary: h.summary, changes: h.changes || [] }));
    const pay = (c.account?.payments || []).filter((p) => p.created_at).map((p) => ({ at: p.created_at, by: p.created_by, action: "payment", summary: `${{ payment: "پرداخت", refund: "استرداد", adjustment: "تعدیل" }[p.type] || "پرداخت"} ${money(p.amount, c.currency)} (تاریخ ${p.date})`, changes: [] }));
    return [...own, ...pay].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [c]);
  if (!events.length) return <p className="text-xs text-text-muted">تاریخچه‌ای نیست.</p>;
  return (
    <ol className="space-y-2">
      {events.map((e, i) => (
        <li key={i} className="rounded-lg bg-canvas p-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
            <span className="rounded-full border border-border px-2 py-0.5">{ACTION_FA[e.action] || e.action}</span>
            <span>{new Date(e.at).toLocaleString("fa-IR")}</span><span>{e.by || "؟"}</span>
          </div>
          <div className="mt-1 leading-7">{e.summary}</div>
          {e.changes.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-text-muted">
              {e.changes.map((x, j) => <li key={j}><b className="text-text">{x.label}:</b> <span className="text-danger line-through">{show(x.from)}</span> ← <span className="text-success">{show(x.to)}</span></li>)}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function ContractDetail({ id }) {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api(`/api/sales/contracts?key=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) { setError(r.error || "خطا"); return; }
    setError(""); setData(r);
  }, [id]);
  useEffect(() => { load(); api("/api/sales/contracts", { cache: "no-store" }).then((r) => r.ok && setMeta(r)); }, [load]);

  const c = data?.contract;
  const ref = c ? (c.id ? { id: c.id } : { contract_key: c.file_no }) : {};

  // quiet=true: نتیجه برگردانده می‌شود و پیام خطا را فراخوان نشان می‌دهد
  async function act(body, quiet = false) {
    setBusy(true);
    const r = await patch({ ...ref, ...body });
    setBusy(false);
    if (!r.ok && !quiet) { alert(r.error || "انجام نشد"); return false; }
    if (r.ok) await load();
    return quiet ? r : r.ok;
  }
  async function toggleStep(key, done) {
    if (done) { const n = prompt("یادداشت این مرحله (اختیاری):", "") ?? null; if (n === null) return; await act({ action: "step", key, done: true, note: n }); }
    else if (confirm("تیک این مرحله برداشته شود؟")) await act({ action: "step", key, done: false });
  }
  async function toggleDelivery(i) {
    const plan = c.delivery_plan.map((p, j) => (j === i ? { ...p, done: !p.done, done_at: !p.done ? today() : null } : p));
    await act({ action: "update", fields: { delivery_plan: plan } });
  }

  if (error) return <div className="space-y-6"><SalesNav active="/sales/contracts" /><div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div></div>;
  if (!c) return <div className="space-y-6"><SalesNav active="/sales/contracts" /><p className="text-sm text-text-muted">در حال بارگذاری…</p></div>;

  // سررسید هر قسط نسبت به پرداخت واقعی: قسط‌ها به ترتیب سررسید از پرداخت‌شده‌ی کل پوشش داده می‌شوند
  let cum = 0;
  const plan = (c.payment_plan || []).map((p) => { cum += p.amount; const covered = (c.account?.paid || 0) + 0.01 >= cum; return { ...p, covered, late: !covered && p.due_date && p.due_date < today() }; });
  const cancelled = c.status === "cancelled";
  const payCtx = { key: c.file_no, currency: c.currency, balance: c.account?.balance };

  return (
    <div className="space-y-6">
      <PageHeader title={`قرارداد ${c.file_no}`} subtitle={`${c.buyer} — ${c.country} — ${fa(c.tons, 1)} تن ${c.grade || ""}${c.incoterm ? ` ${c.incoterm}` : ""}`} actions={<button type="button" onClick={() => setEditing((v) => !v)} className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover cursor-pointer">{editing ? "بستن ویرایش" : "ویرایش قرارداد"}</button>} />
      <SalesNav active="/sales/contracts" />

      {cancelled && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">قرارداد لغو شده است{c.cancel?.reason ? `: ${c.cancel.reason}` : ""}.</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["مبلغ کل", money(c.total, c.currency)], ["پرداخت‌شده", money(c.account?.paid, c.currency)], ["مانده", money(c.account?.balance, c.currency)], ["مرحله‌ی فعلی", c.current_step_label || "—"], ["بارگیری‌شده", `${fa(c.shipment_totals?.loaded, 1)} از ${fa(c.tons, 1)} تن`]].map(([l, v]) => (
          <div key={l} className="card p-4"><div className="text-xs text-text-muted">{l}</div><div className="mt-1 text-base font-bold text-text" dir="auto">{v}</div></div>
        ))}
      </div>

      {editing && meta && <ContractForm initial={{ ...c, grade: c.grade || "خوراکی" }} meta={meta} submitLabel="ذخیره‌ی تغییرات" onSaved={() => { setEditing(false); load(); }} />}

      <section className="card p-5">
        <h2 className="mb-2 text-sm font-bold text-text">پرداخت‌ها</h2>
        <PaymentList payments={c.account?.payments} onChange={load} />
        {!cancelled && <div className="mt-3"><PaymentForm contract={payCtx} defaultAmount={c.account?.balance} onDone={load} /></div>}
      </section>

      <Shipments c={c} act={act} busy={busy} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-bold text-text">مراحل قرارداد</h2>
          <ol className="space-y-2">
            {(data.steps || []).map((s) => {
              const st = c.steps?.[s.key];
              return (
                <li key={s.key} className="flex flex-wrap items-center gap-3 text-sm">
                  <button type="button" disabled={busy || cancelled} onClick={() => toggleStep(s.key, !st?.done)} aria-pressed={!!st?.done}
                    className={`flex h-6 w-6 items-center justify-center rounded border text-xs cursor-pointer disabled:opacity-50 ${st?.done ? "border-success bg-success text-white" : "border-border bg-surface"}`}>{st?.done ? "✓" : ""}</button>
                  <span className={st?.done ? "text-text" : "text-text-muted"}>{s.label}</span>
                  {st?.done && <span className="text-[11px] text-text-muted">{fdate(st.at)}{st.by ? ` · ${st.by}` : ""}{st.note ? ` · ${st.note}` : ""}</span>}
                </li>
              );
            })}
          </ol>
        </section>

        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-2 text-sm font-bold text-text">برنامه‌ی پرداخت</h2>
            {plan.length === 0 && <p className="text-xs text-text-muted">قسطی تعریف نشده.</p>}
            <ul className="space-y-1.5 text-sm">
              {plan.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${p.covered ? "bg-success-soft text-success" : p.late ? "bg-danger-soft text-danger" : "bg-canvas text-text-muted"}`}>{p.covered ? "پرداخت‌شده" : p.late ? "سررسیدگذشته" : "در انتظار"}</span>
                  <span dir="ltr">{money(p.amount, c.currency)}</span><span className="text-text-muted">تا {fdate(p.due_date)}</span>{p.note && <span className="text-xs text-text-muted">{p.note}</span>}
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-5">
            <h2 className="mb-2 text-sm font-bold text-text">برنامه‌ی تحویل</h2>
            {(c.delivery_plan || []).length === 0 && <p className="text-xs text-text-muted">محموله‌ای تعریف نشده.</p>}
            <ul className="space-y-1.5 text-sm">
              {(c.delivery_plan || []).map((p, i) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy || cancelled} onClick={() => toggleDelivery(i)} aria-pressed={p.done}
                    className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] cursor-pointer ${p.done ? "border-success bg-success text-white" : "border-border bg-surface"}`}>{p.done ? "✓" : ""}</button>
                  <span className={p.done ? "text-text-muted line-through" : p.date < today() ? "text-danger" : "text-text"}>{fdate(p.date)}</span>
                  {p.tons != null && <span>{fa(p.tons, 1)} تن</span>}{p.note && <span className="text-xs text-text-muted">{p.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold text-text">تاریخچه‌ی تغییرات</h2>
        <History c={c} />
      </section>

      <section className="card p-5">
        <h2 className="mb-2 text-sm font-bold text-text">یادداشت‌ها</h2>
        <ul className="mb-3 space-y-2 text-sm">
          {(c.notes || []).length === 0 && <li className="text-xs text-text-muted">یادداشتی نیست.</li>}
          {[...(c.notes || [])].reverse().map((n) => (
            <li key={n.id} className="rounded-lg bg-canvas p-2.5"><div className="text-[11px] text-text-muted">{new Date(n.at).toLocaleString("fa-IR")} · {n.by || "؟"}</div><div className="mt-0.5 whitespace-pre-wrap leading-7">{n.text}</div></li>
          ))}
        </ul>
        <form onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "note", text: note })) setNote(""); }} className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت تازه" className={`${inputCls} flex-1`} />
          <button type="submit" disabled={busy || !note.trim()} className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white disabled:opacity-50 cursor-pointer">افزودن</button>
        </form>
      </section>

      <section className="card p-5 text-sm leading-7">
        <h2 className="mb-2 text-sm font-bold text-text">مشتری و مشخصات</h2>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <div>شرکت: <b>{c.buyer}</b></div><div>کشور: {c.country}</div>
          <div>شخص تماس: {c.contact_person || "—"}</div><div>تلفن: <span dir="ltr">{c.phone || "—"}</span></div>
          <div>ایمیل: <span dir="ltr">{c.email || "—"}</span></div><div>آدرس: {c.address || "—"}</div>
          <div>شرایط پرداخت: <span dir="ltr">{c.payment_terms || "—"}</span></div><div>بندر/تحویل: {c.port || "—"}</div>
          <div>قیمت هر تن: <span dir="ltr">{money(c.price, c.currency)}</span></div><div>تاریخ قرارداد: {fdate(c.date)}</div>
          <div>کارخانه: {c.plant || "—"}</div><div>بسته‌بندی: {c.packaging || "—"}</div>
        </div>
        {data.customer?.notes && <p className="mt-2 text-xs text-text-muted">یادداشت مشتری: {data.customer.notes}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {!cancelled && <button type="button" disabled={busy} onClick={() => { const r = prompt("دلیل لغو قرارداد:", ""); if (r !== null) act({ action: "cancel", reason: r }); }} className="rounded-lg border border-danger px-4 py-1.5 text-xs text-danger hover:bg-danger-soft cursor-pointer">لغو قرارداد</button>}
          {cancelled && <button type="button" disabled={busy} onClick={() => act({ action: "reopen" })} className="rounded-lg border border-border px-4 py-1.5 text-xs hover:bg-canvas cursor-pointer">بازگردانی قرارداد</button>}
          <Link href="/sales/loading" className="rounded-lg border border-border px-4 py-1.5 text-xs hover:bg-canvas">لیست بارگیری</Link>
        </div>
      </section>
    </div>
  );
}
