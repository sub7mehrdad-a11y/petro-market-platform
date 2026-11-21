"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "../../../components/PageHeader";
import { Kpi, MonthlyChart, SalesNav, fa, fdate, usd } from "../../salesUi";

const inputCls = "mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";
const STATUS_CLS = { فعال: "bg-success-soft text-success", بالقوه: "bg-warning-soft text-warning", غیرفعال: "bg-canvas text-text-muted" };
const INFL_CLS = { تصمیم‌گیرنده: "bg-primary-soft text-primary-hover", تأثیرگذار: "bg-warning-soft text-warning" };
const ORDER_STATUS = { paid: "تسویه‌شده", partial: "بخشی", unpaid: "پرداخت‌نشده", overpaid: "بیش‌پرداخت", no_total: "بدون مبلغ" };
const blank = { name: "", country: "", status: "بالقوه", activity: "", website: "", city: "", registration_no: "", address: "", phone: "", whatsapp: "", email: "", telegram: "", linkedin: "", preferred_channel: "", language: "", manager: "", person: "", notes: "", contacts: [] };
const emptyPerson = () => ({ id: `n${Date.now().toString(36)}`, name: "", role: "", influence: "", phone: "", whatsapp: "", email: "", notes: "" });

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, ...j };
}
const waLink = (n) => (n ? `https://wa.me/${String(n).replace(/\D/g, "")}` : null);
const webLink = (u) => (u ? (/^https?:/i.test(u) ? u : `https://${u}`) : null);

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <dt className="shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-end text-text" dir="auto">{children || <span className="text-text-muted">—</span>}</dd>
    </div>
  );
}

export default function CustomerProfile({ id }) {
  const router = useRouter();
  const isNew = id === "new";
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (isNew) { setD({ customer: { ...blank, id: null }, stats: null, suggestions: { bank: [], whatsapp: [] }, statuses: ["فعال", "بالقوه", "غیرفعال"], channels: ["ایمیل", "واتساپ", "تلفن", "تلگرام", "لینکدین", "حضوری"], influences: ["تصمیم‌گیرنده", "تأثیرگذار", "خرید و بازرگانی", "مالی", "فنی و کیفیت", "اجرایی و لجستیک", "سایر"] }); return; }
    const r = await api(`/api/sales/contracts/customers?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) { setError(r.error || "خطا"); return; }
    setError(""); setD(r);
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  function startEdit(prefill = {}) {
    const c = d.customer;
    setForm({ ...blank, ...Object.fromEntries(Object.keys(blank).map((k) => [k, c[k] ?? blank[k]])), contacts: (c.contacts || []).map((p) => ({ ...emptyPerson(), ...p })), ...prefill });
    setMsg(""); setEditing(true);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setPerson = (i, patch) => setForm((p) => ({ ...p, contacts: p.contacts.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await api("/api/sales/contracts/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: isNew ? undefined : d.customer.id }) });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "ذخیره نشد."); return; }
    setEditing(false);
    if (isNew || r.customer.id !== id) router.push(`/sales/customers/${encodeURIComponent(r.customer.id)}`); else load();
  }

  if (error) return <div className="space-y-6"><SalesNav active="/sales/customers" /><div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div></div>;
  if (!d) return <div className="space-y-6"><SalesNav active="/sales/customers" /><p className="text-sm text-text-muted">در حال بارگذاری…</p></div>;

  const c = d.customer;
  const st = d.stats;
  const sug = d.suggestions || { bank: [], whatsapp: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? "مشتری جدید" : c.name}
        subtitle={isNew ? undefined : [c.country, c.activity].filter(Boolean).join(" — ") || undefined}
        actions={!isNew && !editing ? <button type="button" onClick={() => startEdit()} className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover cursor-pointer">ویرایش پرونده</button> : null}
      />
      <SalesNav active="/sales/customers" />

      {/* ------------------------------------------------ فرم ویرایش */}
      {editing && (
        <form onSubmit={save} className="space-y-5">
          <section className="card space-y-3 p-5">
            <h2 className="text-sm font-bold text-text">شرکت</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs text-text-muted sm:col-span-2">نام شرکت *<input value={form.name} onChange={set("name")} className={inputCls} dir="auto" required /></label>
              <label className="block text-xs text-text-muted">وضعیت<select value={form.status || ""} onChange={set("status")} className={inputCls}><option value="">—</option>{d.statuses.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="block text-xs text-text-muted">کشور<input value={form.country} onChange={set("country")} className={inputCls} dir="auto" /></label>
              <label className="block text-xs text-text-muted">شهر<input value={form.city} onChange={set("city")} className={inputCls} dir="auto" /></label>
              <label className="block text-xs text-text-muted">حوزه‌ی فعالیت<input value={form.activity} onChange={set("activity")} className={inputCls} dir="auto" /></label>
              <label className="block text-xs text-text-muted">شماره ثبت / شناسه‌ی شرکت<input value={form.registration_no} onChange={set("registration_no")} className={inputCls} dir="ltr" /></label>
              <label className="block text-xs text-text-muted">مسئول پیگیری (در شرکت ما)<input value={form.manager} onChange={set("manager")} className={inputCls} dir="auto" /></label>
              <label className="block text-xs text-text-muted">زبان مکاتبه<input value={form.language} onChange={set("language")} className={inputCls} dir="auto" /></label>
              <label className="block text-xs text-text-muted sm:col-span-3">آدرس<input value={form.address} onChange={set("address")} className={inputCls} dir="auto" /></label>
            </div>
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="text-sm font-bold text-text">راه‌های ارتباطی</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs text-text-muted">تلفن<input value={form.phone} onChange={set("phone")} className={inputCls} dir="ltr" /></label>
              <label className="block text-xs text-text-muted">واتساپ<input value={form.whatsapp} onChange={set("whatsapp")} className={inputCls} dir="ltr" placeholder="+7 900 000 0000" /></label>
              <label className="block text-xs text-text-muted">ایمیل<input type="email" value={form.email} onChange={set("email")} className={inputCls} dir="ltr" /></label>
              <label className="block text-xs text-text-muted">وب‌سایت<input value={form.website} onChange={set("website")} className={inputCls} dir="ltr" /></label>
              <label className="block text-xs text-text-muted">تلگرام<input value={form.telegram} onChange={set("telegram")} className={inputCls} dir="ltr" /></label>
              <label className="block text-xs text-text-muted">لینکدین<input value={form.linkedin} onChange={set("linkedin")} className={inputCls} dir="ltr" /></label>
              <label className="block text-xs text-text-muted">کانال ترجیحی<select value={form.preferred_channel || ""} onChange={set("preferred_channel")} className={inputCls}><option value="">—</option>{d.channels.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="block text-xs text-text-muted sm:col-span-2">شخص تماس اصلی (نام)<input value={form.person} onChange={set("person")} className={inputCls} dir="auto" /></label>
            </div>
          </section>

          <section className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-text">افراد کلیدی شرکت</h2>
              <button type="button" onClick={() => setForm((p) => ({ ...p, contacts: [...p.contacts, emptyPerson()] }))} className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-canvas cursor-pointer">+ فرد</button>
            </div>
            {form.contacts.length === 0 && <p className="text-xs text-text-muted">فردی ثبت نشده.</p>}
            {form.contacts.map((p, i) => (
              <div key={p.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-4">
                <input value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} placeholder="نام و نام خانوادگی *" className={inputCls} dir="auto" />
                <input value={p.role || ""} onChange={(e) => setPerson(i, { role: e.target.value })} placeholder="سمت (مدیرعامل، مدیر خرید…)" className={inputCls} dir="auto" />
                <select value={p.influence || ""} onChange={(e) => setPerson(i, { influence: e.target.value })} className={inputCls}><option value="">نقش در تصمیم‌گیری</option>{d.influences.map((x) => <option key={x}>{x}</option>)}</select>
                <input value={p.phone || ""} onChange={(e) => setPerson(i, { phone: e.target.value })} placeholder="تلفن" className={inputCls} dir="ltr" />
                <input value={p.whatsapp || ""} onChange={(e) => setPerson(i, { whatsapp: e.target.value })} placeholder="واتساپ" className={inputCls} dir="ltr" />
                <input value={p.email || ""} onChange={(e) => setPerson(i, { email: e.target.value })} placeholder="ایمیل" className={inputCls} dir="ltr" />
                <input value={p.notes || ""} onChange={(e) => setPerson(i, { notes: e.target.value })} placeholder="توضیح (زبان، ساعت تماس، سابقه…)" className={`${inputCls} sm:col-span-2`} dir="auto" />
                <div className="sm:col-span-4 text-end"><button type="button" onClick={() => setForm((q) => ({ ...q, contacts: q.contacts.filter((_, j) => j !== i) }))} className="text-xs text-danger hover:underline cursor-pointer">حذف فرد</button></div>
              </div>
            ))}
          </section>

          <section className="card space-y-2 p-5">
            <h2 className="text-sm font-bold text-text">یادداشت</h2>
            <textarea value={form.notes} onChange={set("notes")} rows={4} className={inputCls} dir="auto" />
          </section>

          {msg && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{msg}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50 cursor-pointer">{busy ? "…" : "ذخیره"}</button>
            {!isNew && <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-border px-6 py-2.5 text-sm hover:bg-canvas cursor-pointer">انصراف</button>}
          </div>
        </form>
      )}

      {/* ------------------------------------------------ نمایش پرونده */}
      {!isNew && !editing && (
        <>
          {c.sheet_only && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">برای این مشتری هنوز پرونده‌ی تماس ثبت نشده؛ فقط سابقه‌ی خرید از گزارش فروش نمایش داده می‌شود.</div>}

          {st && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
              <Kpi label="قراردادها" value={fa(st.deals)} sub={st.countries.join("، ")} />
              <Kpi label="حجم کل" value={`${fa(st.tons, 1)} تن`} sub={st.avg_order_tons != null ? `میانگین هر سفارش ${fa(st.avg_order_tons, 1)} تن` : undefined} />
              <Kpi label="جمع خرید" value={usd(st.revenue_usd)} />
              <Kpi label="میانگین قیمت" value={st.avg_price != null ? `$${fa(st.avg_price, 1)}` : "—"} sub={st.price_vs_company_pct != null ? `${st.price_vs_company_pct > 0 ? "+" : ""}${fa(st.price_vs_company_pct, 1)}٪ نسبت به میانگین شرکت` : undefined} />
              <Kpi label="مانده" value={usd(st.balance_usd)} tone={st.balance_usd > 0 ? "text-warning" : undefined} sub={st.paid_pct != null ? `${fa(st.paid_pct, 0)}٪ پرداخت‌شده` : undefined} />
              <Kpi label="سررسیدگذشته" value={usd(st.overdue_usd)} tone={st.overdue_usd > 0 ? "text-danger" : undefined} />
              <Kpi label="میانگین زمان پرداخت" value={st.avg_days_to_pay != null ? `${fa(st.avg_days_to_pay)} روز` : "—"} sub={st.on_time_pct != null ? `${fa(st.on_time_pct)}٪ به‌موقع` : undefined} />
              <Kpi label="آخرین سفارش" value={fdate(st.last_order)} sub={st.days_since_last != null ? `${fa(st.days_since_last)} روز پیش${st.avg_days_between_orders != null ? ` · فاصله‌ی معمول ${fa(st.avg_days_between_orders)} روز` : ""}` : undefined} />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold text-text">اطلاعات شرکت</h2>{c.status && <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_CLS[c.status] || ""}`}>{c.status}</span>}</div>
              <dl>
                <Row label="کشور / شهر">{[c.country, c.city].filter(Boolean).join("، ")}</Row>
                <Row label="حوزه‌ی فعالیت">{c.activity}</Row>
                <Row label="شناسه / شماره ثبت"><span dir="ltr">{c.registration_no}</span></Row>
                <Row label="آدرس">{c.address}</Row>
                <Row label="مسئول پیگیری">{c.manager}</Row>
                <Row label="زبان مکاتبه">{c.language}</Row>
                <Row label="کانال ترجیحی">{c.preferred_channel}</Row>
              </dl>
            </section>
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-bold text-text">راه‌های ارتباطی</h2>
              <dl>
                <Row label="تلفن"><span dir="ltr">{c.phone}</span></Row>
                <Row label="واتساپ">{c.whatsapp && <a href={waLink(c.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" dir="ltr">{c.whatsapp}</a>}</Row>
                <Row label="ایمیل">{c.email && <a href={`mailto:${c.email}`} className="text-primary hover:underline" dir="ltr">{c.email}</a>}</Row>
                <Row label="وب‌سایت">{c.website && <a href={webLink(c.website)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" dir="ltr">{c.website}</a>}</Row>
                <Row label="تلگرام"><span dir="ltr">{c.telegram}</span></Row>
                <Row label="لینکدین">{c.linkedin && <a href={webLink(c.linkedin)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" dir="ltr">{c.linkedin}</a>}</Row>
                <Row label="شخص تماس اصلی">{c.person}</Row>
              </dl>
            </section>
          </div>

          <section className="card p-5">
            <h2 className="mb-2 text-sm font-bold text-text">افراد کلیدی شرکت ({fa((c.contacts || []).length)})</h2>
            {(c.contacts || []).length === 0 ? <p className="text-xs text-text-muted">فردی ثبت نشده.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-text-muted">{["نام", "سمت", "نقش در تصمیم‌گیری", "تلفن", "واتساپ", "ایمیل", "توضیح"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {c.contacts.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="px-2 py-2 font-semibold">{p.name}</td><td className="px-2 py-2">{p.role || "—"}</td>
                        <td className="px-2 py-2">{p.influence ? <span className={`rounded-full px-2 py-0.5 text-[11px] ${INFL_CLS[p.influence] || "bg-canvas text-text-muted"}`}>{p.influence}</span> : "—"}</td>
                        <td className="px-2 py-2" dir="ltr" style={{ textAlign: "start" }}>{p.phone || "—"}</td>
                        <td className="px-2 py-2" dir="ltr" style={{ textAlign: "start" }}>{p.whatsapp ? <a href={waLink(p.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{p.whatsapp}</a> : "—"}</td>
                        <td className="px-2 py-2" dir="ltr" style={{ textAlign: "start" }}>{p.email ? <a href={`mailto:${p.email}`} className="text-primary hover:underline">{p.email}</a> : "—"}</td>
                        <td className="px-2 py-2">{p.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {(sug.bank.length > 0 || sug.whatsapp.length > 0) && (
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-bold text-text">اطلاعات موجود در بانک شرکت‌ها</h2>
              <ul className="space-y-3 text-sm">
                {sug.bank.map((b) => (
                  <li key={b.id} className="rounded-lg bg-canvas p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b>{b.name} <span className="text-xs font-normal text-text-muted">{b.country}</span></b>
                      <button type="button" onClick={() => startEdit({ email: c.email || b.email || "", phone: c.phone || b.phone || "", website: c.website || b.website || "", address: c.address || b.address || "", activity: c.activity || b.industry || "" })} className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-surface cursor-pointer">افزودن به پرونده</button>
                    </div>
                    <div className="mt-1 grid gap-x-6 text-xs text-text-muted sm:grid-cols-2">
                      {b.email && <div>ایمیل: <span dir="ltr" className="text-text">{b.email}</span></div>}{b.phone && <div>تلفن: <span dir="ltr" className="text-text">{b.phone}</span></div>}
                      {b.website && <div>وب‌سایت: <span dir="ltr" className="text-text">{b.website}</span></div>}{b.address && <div>آدرس: <span className="text-text">{b.address}</span></div>}
                      {b.industry && <div>صنعت: <span className="text-text">{b.industry}</span></div>}{b.grade && <div>گرید هدف: <span className="text-text">{b.grade}</span></div>}
                    </div>
                  </li>
                ))}
                {sug.whatsapp.map((w) => (
                  <li key={w.e164} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas p-3 text-xs">
                    <span>واتساپ ثبت‌شده روی سایت شرکت: <a href={waLink(w.e164)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" dir="ltr">{w.number}</a></span>
                    <button type="button" onClick={() => startEdit({ whatsapp: c.whatsapp || w.number })} className="rounded-lg border border-border px-3 py-1 hover:bg-surface cursor-pointer">افزودن به پرونده</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {st?.months.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-bold text-text">خرید ماهانه (تن) و میانگین قیمت</h2>
              <MonthlyChart months={st.months} />
            </section>
          )}

          {st?.orders.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-bold text-text">قراردادها</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-text-muted">{["شماره", "تاریخ", "کشور", "تن", "قیمت", "مبلغ", "پرداخت‌شده", "مانده", "وضعیت"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {st.orders.map((o) => (
                      <tr key={o.key} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5"><Link href={`/sales/contracts/${encodeURIComponent(o.file_no || o.key)}`} className="text-primary-hover hover:underline" dir="ltr">{o.file_no || o.key}</Link></td>
                        <td className="px-2 py-1.5">{fdate(o.date)}</td><td className="px-2 py-1.5">{o.country}</td><td className="px-2 py-1.5">{fa(o.tons, 1)}</td>
                        <td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{o.price != null ? fa(o.price, 1) : "—"}</td>
                        <td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{o.currency === "USD" ? usd(o.total) : o.total ?? "—"}</td>
                        <td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{usd(o.paid)}</td>
                        <td className={`px-2 py-1.5 font-semibold ${o.overdue ? "text-danger" : ""}`} dir="ltr" style={{ textAlign: "start" }}>{usd(o.balance)}</td>
                        <td className="px-2 py-1.5">{ORDER_STATUS[o.status] || "—"}{o.overdue ? ` · ${fa(o.overdue_days)} روز دیرکرد` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {st?.payments.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-bold text-text">آخرین پرداخت‌ها</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-text-muted">{["تاریخ", "قرارداد", "مبلغ", "نوع", "روش", "مرجع"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {st.payments.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0"><td className="px-2 py-1.5">{fdate(p.date)}</td><td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{p.contract_key}</td><td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{p.amount.toLocaleString("en-US")} {p.currency}</td><td className="px-2 py-1.5">{{ payment: "پرداخت", refund: "استرداد", adjustment: "تعدیل" }[p.type]}{p.estimated ? " (تخمینی)" : ""}</td><td className="px-2 py-1.5">{p.method || "—"}</td><td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{p.reference || "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {c.notes && <section className="card p-5"><h2 className="mb-2 text-sm font-bold text-text">یادداشت</h2><p className="whitespace-pre-wrap text-sm leading-7 text-text" dir="auto">{c.notes}</p></section>}

          {(c.history || []).length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-bold text-text">تاریخچه‌ی ویرایش پرونده</h2>
              <ol className="space-y-2">
                {[...c.history].reverse().map((h) => (
                  <li key={h.id} className="rounded-lg bg-canvas p-2.5 text-sm">
                    <div className="text-[11px] text-text-muted">{new Date(h.at).toLocaleString("fa-IR")} · {h.by || "؟"}</div>
                    <div className="mt-0.5">{h.summary}</div>
                    {h.changes?.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-text-muted">{h.changes.map((x, i) => <li key={i}><b className="text-text">{x.label}:</b> <span className="text-danger line-through">{x.from || "—"}</span> ← <span className="text-success">{x.to || "—"}</span></li>)}</ul>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
