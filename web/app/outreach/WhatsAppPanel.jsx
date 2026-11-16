"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

// واتساپ نیمه‌خودکار: متن آماده + دکمه‌ی «ارسال در واتساپ» که واتساپ را با شماره و متن باز می‌کند.
// ارسال نهایی را خودِ کاربر در واتساپ می‌زند؛ سایت هیچ پیامی نمی‌فرستد.

const PAGE = 20;
const fa = (n) => Number(n || 0).toLocaleString("fa-IR");
const STATUS = {
  new: { label: "ارسال نشده", cls: "bg-canvas text-text-muted" },
  opened: { label: "واتساپ باز شد", cls: "bg-warning-soft text-warning" },
  sent: { label: "ارسال شد ✓", cls: "bg-success-soft text-success" },
};
const LANG_FA = { en: "انگلیسی", ru: "روسی", ar: "عربی" };
const GRADE_FA = { food: "خوراکی", feed: "دامی", industrial: "صنعتی", unclear: "نامشخص" };

async function call(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, ...j };
}

export default function WhatsAppPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [country, setCountry] = useState("همه");
  const [status, setStatus] = useState("همه");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [drafts, setDrafts] = useState({}); // "id:زبان" -> متن ویرایش‌شده
  const [langMode, setLangMode] = useState("en"); // en = همه انگلیسی | local = زبان محلی هر کشور (روسی/عربی؛ بقیه انگلیسی)
  const [langOverride, setLangOverride] = useState({}); // id -> زبانی که کاربر دستی انتخاب کرده
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const r = await call("/api/outreach/whatsapp", { cache: "no-store" });
    if (!r.rows) { setError(r.error || "خطا در بارگذاری فهرست واتساپ"); return; }
    setError(""); setData(r);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows || [];
  const countries = useMemo(() => [...new Set(rows.map((r) => r.country))].sort((a, b) => a.localeCompare(b)), [rows]);
  const counts = useMemo(() => ({ total: rows.length, new: rows.filter((r) => r.status === "new").length, opened: rows.filter((r) => r.status === "opened").length, sent: rows.filter((r) => r.status === "sent").length }), [rows]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (country === "همه" || r.country === country) && (status === "همه" || r.status === status) && (!s || r.name.toLowerCase().includes(s)));
  }, [rows, country, status, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => { setPage(0); }, [country, status, q]);

  const canSend = !!data?.sending_enabled && !data?.state_problem;

  const langOf = (r) => langOverride[r.id] || (langMode === "local" && r.local_lang ? r.local_lang : "en");

  async function act(id, action, text, lang) {
    setBusy(id);
    const r = await call("/api/outreach/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, text, lang }) });
    if (!r.ok) setError(r.error || "ثبت نشد");
    setBusy("");
    await load();
    return r.ok;
  }

  async function openWhatsApp(r) {
    const lang = langOf(r);
    const text = drafts[`${r.id}:${lang}`] ?? r.messages[lang];
    if (!r.wa) { setError("شماره‌ی این شرکت نامعتبر است."); return; }
    // پنجره‌ی خالی همان لحظه‌ی کلیک باز می‌شود (وگرنه مرورگر بعد از await آن را مسدود می‌کند)؛ بعد از ثبت موفق، آدرس واتساپ در آن می‌نشیند.
    const w = window.open("", "_blank");
    const ok = await act(r.id, "opened", text, lang);
    if (ok && w) { w.opener = null; w.location.href = `https://wa.me/${r.wa}?text=${encodeURIComponent(text.slice(0, 2000))}`; }
    else if (w) w.close();
  }

  return (
    <section className="card p-5 space-y-4" id="whatsapp">
      <div>
        <h2 className="text-lg font-bold">واتساپ (نیمه‌خودکار)</h2>
        <p className="mt-1 text-sm leading-7 text-text-muted">
          شرکت‌هایی که خودِ سایتشان لینک واتساپ گذاشته. متن آماده است و قابل ویرایش. دکمه‌ی «ارسال در واتساپ» واتساپ را با شماره و متن باز می‌کند؛ دکمه‌ی Send را شما در واتساپ می‌زنید. ثبت‌بودن شماره در واتساپ از بیرون قابل بررسی نیست.
        </p>
      </div>

      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {data && !data.sending_enabled && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">ارسال فعلاً غیرفعال است (در انتظار تأیید هیئت‌مدیره). متن‌ها را می‌توانید ببینید و ویرایش کنید؛ دکمه‌ی ارسال بعد از فعال‌شدن کار می‌کند.</div>}
      {data?.state_problem && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{data.state_problem}</div>}
      {data?.missing_catalog_env?.length > 0 && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-xs text-warning">لینک کاتالوگ تنظیم نشده ({data.missing_catalog_env.join("، ")})؛ تا آن موقع خط کاتالوگ در متن نمی‌آید.</div>}

      {!data && !error && <p className="text-sm text-text-muted">در حال بارگذاری…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["کل شرکت‌ها", counts.total], ["ارسال نشده", counts.new], ["واتساپ باز شد", counts.opened], ["ارسال شد", counts.sent]].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-border bg-canvas p-3"><div className="text-xs text-text-muted">{l}</div><div className="mt-1 text-2xl font-bold">{fa(v)}</div></div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <select value={country} onChange={(e) => setCountry(e.target.value)} className="input">
              <option value="همه">همه‌ی کشورها</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              <option value="همه">همه‌ی وضعیت‌ها</option>
              <option value="new">ارسال نشده</option>
              <option value="opened">واتساپ باز شد</option>
              <option value="sent">ارسال شد</option>
            </select>
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی نام شرکت…" className="input flex-1 min-w-[160px]" />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-canvas p-3 text-sm">
            <span className="font-medium">زبان پیام‌ها:</span>
            <label className="flex items-center gap-1.5"><input type="radio" name="wa-lang" checked={langMode === "en"} onChange={() => setLangMode("en")} /> همه انگلیسی (پیش‌فرض)</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="wa-lang" checked={langMode === "local"} onChange={() => setLangMode("local")} /> زبان کشور مقصد ({fa(rows.filter((r) => r.local_lang === "ru").length)} روسی، {fa(rows.filter((r) => r.local_lang === "ar").length)} عربی؛ بقیه انگلیسی)</label>
            <span className="text-xs text-text-muted">برای هر شرکت می‌توانید زبان را جدا عوض کنید.</span>
          </div>

          <p className="text-sm">{fa(filtered.length)} شرکت مطابق این فیلتر</p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-text-muted border-b border-border">
                  <th className="py-2 pe-3">شرکت</th><th className="py-2 pe-3">کشور</th><th className="py-2 pe-3">شماره</th><th className="py-2 pe-3">وضعیت</th><th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => {
                  const st = STATUS[r.status] || STATUS.new;
                  const open = openId === r.id;
                  const lang = langOf(r);
                  const dk = `${r.id}:${lang}`;
                  const text = drafts[dk] ?? r.messages[lang];
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-border align-top">
                        <td className="py-2 pe-3">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-[11px] text-text-muted">
                            {r.exhibition} · گرید: {GRADE_FA[r.grade]} · زبان پیام: {LANG_FA[lang]}
                            {r.match === "medium" && <span className="ms-1 rounded-full bg-warning-soft px-1.5 text-warning">تطبیق سایت متوسط</span>}
                            {r.emailed && <span className="ms-1 rounded-full bg-canvas px-1.5">قبلاً ایمیل شده</span>}
                            {r.same_number_as.length > 0 && <span className="ms-1 rounded-full bg-canvas px-1.5" title={r.same_number_as.join("، ")}>شماره‌ی مشترک با {fa(r.same_number_as.length)} شرکت</span>}
                          </div>
                        </td>
                        <td className="py-2 pe-3 whitespace-nowrap">{r.country}</td>
                        <td className="py-2 pe-3 whitespace-nowrap" dir="ltr">
                          {r.source_url ? <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" title="صفحه‌ای که لینک واتساپ در آن دیده شد">{r.number}</a> : r.number}
                        </td>
                        <td className="py-2 pe-3 whitespace-nowrap"><span className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span></td>
                        <td className="py-2 whitespace-nowrap">
                          <button type="button" className="btn btn-secondary" onClick={() => setOpenId(open ? null : r.id)}>{open ? "بستن" : "متن و ارسال"}</button>
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${r.id}-d`} className="border-b border-border bg-canvas">
                          <td colSpan={5} className="p-3 space-y-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-text-muted">زبان این پیام:</span>
                              {["en", "ru", "ar"].map((l) => (
                                <button key={l} type="button" onClick={() => setLangOverride({ ...langOverride, [r.id]: l })} className={`rounded-full border px-3 py-1 ${l === lang ? "border-primary bg-primary text-white" : "border-border bg-surface"}`}>{LANG_FA[l]}{r.local_lang === l ? " (زبان کشور)" : ""}</button>
                              ))}
                              {r.local_lang === null && <span className="text-text-muted">برای این کشور زبان محلی (روسی/عربی) تعریف نشده؛ پیش‌فرض انگلیسی است.</span>}
                            </div>
                            <textarea dir="auto" rows={12} value={text} onChange={(e) => setDrafts({ ...drafts, [dk]: e.target.value })} className="input w-full text-sm leading-7" />
                            <div className="flex flex-wrap items-center gap-3">
                              <button type="button" className="btn" disabled={!canSend || busy === r.id || !r.wa} onClick={() => openWhatsApp(r)}>{busy === r.id ? "…" : "ارسال در واتساپ"}</button>
                              {r.status === "opened" && <button type="button" className="btn btn-secondary" disabled={busy === r.id} onClick={() => act(r.id, "sent")}>ارسال شد ✓</button>}
                              {r.status !== "new" && <button type="button" className="text-xs text-danger hover:underline" disabled={busy === r.id} onClick={() => act(r.id, "reset")}>بازنشانی وضعیت</button>}
                              {drafts[dk] !== undefined && <button type="button" className="text-xs text-text-muted hover:underline" onClick={() => { const d = { ...drafts }; delete d[dk]; setDrafts(d); }}>برگشت به متن اصلی</button>}
                              {r.status === "opened" && <span className="text-xs text-text-muted">بعد از زدن Send در واتساپ، «ارسال شد» را بزنید.</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {view.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-text-muted">شرکتی پیدا نشد.</td></tr>}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center gap-3 text-sm">
              <button type="button" className="btn btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>قبلی</button>
              <span>صفحه‌ی {fa(page + 1)} از {fa(pages)}</span>
              <button type="button" className="btn btn-secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>بعدی</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
