"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { SalesNav, fa } from "../salesUi";

const usd = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const inputCls = "mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";
const blank = { name: "", country: "", person: "", phone: "", email: "", address: "", notes: "" };

export default function CustomersClient() {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/sales/contracts/customers", { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error || "خطا"); return; }
    setError(""); setList(j.customers);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list || []).filter((c) => !t || `${c.name} ${c.country || ""} ${c.person || ""}`.toLowerCase().includes(t));
  }, [list, q]);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg("");
    const res = await fetch("/api/sales/contracts/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "ذخیره نشد."); return; }
    setForm(null); load();
  }
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <PageHeader title="مشتریان" subtitle="پرونده‌ی تماس و یادداشت هر مشتری کنار خلاصه‌ی حسابش. مشتریان فایل اکسل هم دیده می‌شوند؛ با «ویرایش» پرونده‌ی تماس برایشان بسازید." />
      <SalesNav active="/sales/customers" />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو: شرکت، کشور، شخص تماس" className="min-w-52 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <button type="button" onClick={() => setForm({ ...blank })} className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover cursor-pointer">+ مشتری جدید</button>
        </div>
        {list && rows.length === 0 && <p className="text-xs text-text-muted">مشتری‌ای پیدا نشد.</p>}
        <ul className="divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-60 flex-1 space-y-0.5">
                <div className="font-semibold text-text">{c.name} <span className="text-xs font-normal text-text-muted">{c.country || ""}</span>{c.sheet_only && <span className="ms-2 rounded-full bg-canvas px-2 py-0.5 text-[10px] text-text-muted">فقط در اکسل</span>}</div>
                <div className="text-xs text-text-muted">{[c.person, c.phone, c.email].filter(Boolean).join(" · ") || "اطلاعات تماس ثبت نشده"}</div>
                {c.address && <div className="text-xs text-text-muted">{c.address}</div>}
                {c.notes && <div className="text-xs text-text">{c.notes}</div>}
              </div>
              <div className="text-xs text-text-muted">
                {c.account ? <>{fa(c.account.deals)} قرارداد · کل {usd(c.account.total)} · مانده <b className={c.account.balance > 0 ? "text-warning" : "text-text"}>{usd(c.account.balance)}</b>{c.account.overdue_balance > 0 && <span className="text-danger"> · سررسیدگذشته {usd(c.account.overdue_balance)}</span>}</> : "بدون قرارداد"}
              </div>
              <button type="button" onClick={() => setForm({ name: c.name, country: c.country || "", person: c.person || "", phone: c.phone || "", email: c.email || "", address: c.address || "", notes: c.notes || "" })} className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-canvas cursor-pointer">ویرایش</button>
            </li>
          ))}
        </ul>
      </section>

      {form && (
        <form onSubmit={save} className="card space-y-3 p-5">
          <h2 className="text-sm font-bold text-text">{form.name ? `پرونده‌ی ${form.name}` : "مشتری جدید"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[["name", "نام شرکت *", "auto", true], ["country", "کشور", "auto"], ["person", "شخص تماس", "auto"], ["phone", "تلفن", "ltr"], ["email", "ایمیل", "ltr"], ["address", "آدرس", "auto"]].map(([k, l, dir, req]) => (
              <label key={k} className="block text-xs text-text-muted">{l}<input value={form[k]} onChange={set(k)} dir={dir} required={!!req} className={inputCls} /></label>
            ))}
            <label className="block text-xs text-text-muted sm:col-span-2">یادداشت<textarea value={form.notes} onChange={set("notes")} rows={3} className={inputCls} /></label>
          </div>
          {msg && <p className="text-sm text-danger">{msg}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50 cursor-pointer">{busy ? "…" : "ذخیره"}</button>
            <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-border px-5 py-2 text-sm hover:bg-canvas cursor-pointer">انصراف</button>
          </div>
        </form>
      )}
    </div>
  );
}
