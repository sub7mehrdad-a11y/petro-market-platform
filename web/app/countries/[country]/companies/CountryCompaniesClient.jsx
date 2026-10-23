"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../../components/PageHeader";
import Pagination from "../../../components/Pagination";
import useCompanyEmailStatus from "../../../components/useCompanyEmailStatus";
import { GRADE_LABELS_FA } from "@/lib/companyGrades";
import { jalaliFa } from "@/lib/dateFormat";

const PAGE_SIZE = 25;
const SEND_BATCH = 200; // همان سقف صفحه‌ی «ایمیل معرفی»
const fa = (n) => Number(n || 0).toLocaleString("fa-IR");

const STATUS_FILTERS = [
  { key: "all", label: "همه‌ی وضعیت‌ها" },
  { key: "not_sent", label: "ارسال‌نشده" },
  { key: "sent", label: "ایمیل ارسال‌شده" },
  { key: "reminded", label: "یادآوری ارسال‌شده" },
  { key: "replied", label: "پاسخ داده‌اند" },
  { key: "queued", label: "در صف ارسال" },
  { key: "bounced", label: "ایمیل برگشت خورده" },
];

function matchesStatus(s, key) {
  if (key === "all") return true;
  if (!s || !s.has_email) return false;
  if (key === "not_sent") return !s.sent && !s.queued;
  if (key === "sent") return s.sent;
  if (key === "reminded") return s.reminder === "sent";
  if (key === "replied") return s.replied;
  if (key === "queued") return s.queued || s.reminder === "queued";
  if (key === "bounced") return s.bounced;
  return true;
}

const canSelect = (s) => !!s && s.has_email && !s.sent && !s.queued;

function Check() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" className="shrink-0">
      <path d="M3 8.5l3.2 3L13 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// نشان پاسخ — کنار نام شرکت
function RepliedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-0.5 text-[11px] font-bold text-white" title="این شرکت به ایمیل ما پاسخ داده است">
      <Check /> پاسخ داده
    </span>
  );
}

// وضعیت ایمیل: سبز = ارسال/یادآوری انجام شده؛ زرد = در صف؛ قرمز = برگشتی. متن همیشه کنار رنگ هست.
function EmailStatus({ s }) {
  if (!s) return null;
  if (!s.has_email) return <span className="text-xs text-text-muted">ایمیل معتبر ندارد</span>;
  const chips = [];
  if (s.bounced) chips.push(<span key="b" className="badge badge-danger">✕ ایمیل برگشت خورد</span>);
  if (s.sent) {
    chips.push(
      <span key="s" className="badge badge-success" title={s.legacy ? "ارسال‌شده در کمپین قبلی" : undefined}>
        <Check /> ایمیل ارسال شد{s.sent_at ? ` (${jalaliFa(s.sent_at)})` : ""}
      </span>
    );
  }
  if (s.reminder === "sent") {
    chips.push(
      <span key="r" className="badge badge-success">
        <Check /> یادآوری ارسال شد{s.reminder_at ? ` (${jalaliFa(s.reminder_at)})` : ""}
      </span>
    );
  } else if (s.reminder === "queued") {
    chips.push(<span key="rq" className="badge badge-warning">یادآوری در صف</span>);
  }
  if (s.queued) chips.push(<span key="q" className="badge badge-warning">در صف ارسال</span>);
  if (!s.sent && !s.queued) chips.push(<span key="n" className="badge badge-neutral">ارسال نشده</span>);
  return <div className="flex flex-wrap gap-1.5">{chips}</div>;
}

function Contact({ c }) {
  return (
    <>
      {c.phone && <div dir="ltr" className="text-start">{c.phone}</div>}
      {c.email && <div dir="ltr" className="break-all text-start">{c.email}</div>}
      {c.website && (
        <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {c.website}
        </a>
      )}
    </>
  );
}

export default function CountryCompaniesClient({ country, companies }) {
  const { state, data, reload } = useCompanyEmailStatus(country);
  const emailReady = state === "ready" && !!data;
  const statuses = data?.companies || {};

  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("all");
  const [statusKey, setStatusKey] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [preview, setPreview] = useState(null); // { loading, items, cc, missing, error }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (grade !== "all" && c.grade !== grade) return false;
      if (emailReady && !matchesStatus(statuses[c.id], statusKey)) return false;
      if (!q) return true;
      return (
        c.english_name?.toLowerCase().includes(q) ||
        c.arabic_name?.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q)
      );
    });
  }, [companies, query, grade, statusKey, statuses, emailReady]);

  useEffect(() => setPage(0), [query, grade, statusKey]);

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectableInFilter = filtered.filter((c) => canSelect(statuses[c.id]));
  const selectedIds = [...selected].filter((id) => canSelect(statuses[id]));
  const sendBlocked = !data?.sending_enabled ? "ارسال واقعی هنوز فعال نشده است." : data?.halted ? "ارسال ایمیل متوقف شده است." : null;
  const summary = data?.summary;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function openPreview(id) {
    setPreview({ loading: true });
    try {
      const res = await fetch("/api/outreach/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: [id] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "خطا در ساخت پیش‌نمایش");
      setPreview({ items: d.previews || [], cc: d.cc || [], missing: d.missingLinkEnvVars || [] });
    } catch (err) {
      setPreview({ error: String(err.message || err) });
    }
  }

  async function send(ids) {
    if (ids.length === 0) return;
    const batch = ids.slice(0, SEND_BATCH);
    if (!confirm(`${fa(batch.length)} شرکت به صف ارسال ایمیل معرفی اضافه شود؟ (ایمیل‌ها با فاصله‌ی زمانی، یکی‌یکی فرستاده می‌شوند)`)) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: batch }),
      });
      const d = await res.json();
      setSendResult({ ok: res.ok, ...d, requested: batch.length });
      if (res.ok) {
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of batch) next.delete(id);
          return next;
        });
        setPreview(null);
        await reload();
      }
    } catch (err) {
      setSendResult({ ok: false, error: String(err.message || err) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={[
          { label: "داشبورد", href: "/" },
          { label: "کشورها و اتحادیه‌ها", href: "/countries" },
          { label: country, href: `/countries/${encodeURIComponent(country)}` },
          { label: "شرکت‌ها" },
        ]}
        title={`شرکت‌های ${country}`}
        subtitle={`${fa(companies.length)} شرکت شناسایی‌شده${emailReady ? " — وضعیت ایمیل معرفی هر شرکت کنار نامش نمایش داده می‌شود." : ""}`}
      />

      {emailReady && summary && (
        <section className="card p-4" aria-label="خلاصه‌ی ایمیل">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span><b>{fa(summary.sent)}</b> <span className="text-text-muted">ایمیل ارسال‌شده</span></span>
            <span><b>{fa(summary.reminded)}</b> <span className="text-text-muted">یادآوری</span></span>
            <span><b>{data.replies_known ? fa(summary.replied) : "—"}</b> <span className="text-text-muted">پاسخ داده</span></span>
            <span><b>{fa(summary.queued)}</b> <span className="text-text-muted">در صف</span></span>
            <span><b>{fa(summary.not_sent)}</b> <span className="text-text-muted">ارسال‌نشده</span></span>
          </div>
          {!data.replies_known && (
            <p className="mt-2 text-xs text-warning">وضعیت پاسخ‌ها فعلاً از صندوق ایمیل خوانده نشد؛ «ارسال‌شده» و «در صف» درست است ولی پاسخ‌ها نمایش داده نمی‌شوند.</p>
          )}
        </section>
      )}

      <section className="card p-5" aria-label="فیلترها">
        <div className={`grid gap-4 ${emailReady ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            جست‌وجوی نام یا صنعت
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجوی نام یا صنعت" className="input font-normal" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            گرید هدف
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className="input font-normal">
              <option value="all">همه‌ی گریدها</option>
              {Object.entries(GRADE_LABELS_FA).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          {emailReady && (
            <label className="flex flex-col gap-2 text-sm font-semibold">
              وضعیت ایمیل
              <select value={statusKey} onChange={(e) => setStatusKey(e.target.value)} className="input font-normal">
                {STATUS_FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {emailReady && (
        <section className="card p-5" aria-label="ارسال ایمیل">
          <h2 className="text-base font-bold">ارسال ایمیل معرفی</h2>
          <p className="mt-1 text-xs leading-6 text-text-muted">
            شرکت‌های «ارسال‌نشده» را تیک بزنید و به صف ارسال اضافه کنید (همان صف صفحه‌ی «ایمیل معرفی»: با فاصله‌ی زمانی، CC و سقف روزانه). شرکتی که قبلاً ایمیل گرفته دوباره انتخاب‌پذیر نیست.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-secondary" disabled={selectableInFilter.length === 0} onClick={() => setSelected(new Set(selectableInFilter.map((c) => c.id)))}>
              انتخاب همه‌ی ارسال‌نشده‌ها ({fa(selectableInFilter.length)})
            </button>
            <button type="button" className="btn btn-secondary" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              پاک‌کردن انتخاب
            </button>
            <button type="button" className="btn" disabled={sending || selectedIds.length === 0 || !!sendBlocked} onClick={() => send(selectedIds)}>
              {sending ? "در حال افزودن به صف…" : `افزودن ${fa(Math.min(selectedIds.length, SEND_BATCH))} شرکت به صف ارسال`}
            </button>
          </div>
          {sendBlocked && <p className="mt-2 text-xs text-warning">{sendBlocked} می‌توانید شرکت‌ها را ببینید و پیش‌نمایش بگیرید ولی دکمه‌ی ارسال تا آن موقع غیرفعال است.</p>}
          {selectedIds.length > SEND_BATCH && <p className="mt-2 text-xs text-text-muted">سقف هر بار {fa(SEND_BATCH)} شرکت است؛ بقیه را بعداً اضافه کنید.</p>}
          {sendResult && (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${sendResult.ok ? "border-border bg-canvas text-text" : "border-danger bg-danger-soft text-danger"}`} role="status">
              {sendResult.error ||
                `${fa(sendResult.queued ?? 0)} شرکت وارد صف شد${sendResult.skipped?.length ? `، ${fa(sendResult.skipped.length)} مورد رد شد (تکراری/نامعتبر)` : ""}. ارسال خودکار با فاصله‌ی حدود ${fa(sendResult.interval_sec || 60)} ثانیه انجام می‌شود.${sendResult.test_redirect ? " (حالت تست: همه‌ی ایمیل‌ها فقط به آدرس تست می‌روند)" : ""}`}
            </div>
          )}
        </section>
      )}

      {preview && (
        <section className="card p-5" aria-label="پیش‌نمایش ایمیل">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold">پیش‌نمایش ایمیل</h2>
            <button type="button" className="text-xs text-text-muted hover:text-danger" onClick={() => setPreview(null)}>بستن ×</button>
          </div>
          {preview.loading && <p className="text-sm text-text-muted">در حال ساخت پیش‌نمایش…</p>}
          {preview.error && <p className="text-sm text-danger">{preview.error}</p>}
          {preview.items?.map((p) => (
            <div key={p.id}>
              <div className="mb-1 text-xs text-text-muted">{p.english_name} — {p.email} — گرید: {p.grade_label_fa}</div>
              <div className="mb-2 text-sm font-bold" dir="ltr">{p.subject}</div>
              <pre className="whitespace-pre-wrap rounded-md bg-canvas p-3 font-sans text-xs leading-6 text-text" dir="ltr">{p.body}</pre>
              <p className="mt-2 text-xs text-text-muted">{preview.cc?.length ? `CC: ${preview.cc.join("، ")}` : "CC تنظیم نشده است."}</p>
              {preview.missing?.length > 0 && <p className="mt-1 text-xs text-warning">لینک کاتالوگ‌ها هنوز تنظیم نشده ({preview.missing.join("، ")}).</p>}
            </div>
          ))}
        </section>
      )}

      <section className="card p-5">
        <p className="mb-4 text-xs text-text-muted">{fa(filtered.length)} شرکت مطابق فیلتر فعلی</p>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-canvas p-6 text-center">
            <p className="font-semibold">شرکتی پیدا نشد</p>
            <p className="mt-1 text-sm text-text-muted">عبارت جست‌وجو یا فیلترها را تغییر دهید.</p>
          </div>
        ) : (
          <>
            {/* موبایل: کارت */}
            <ul className="space-y-3 md:hidden">
              {pageItems.map((c) => {
                const s = statuses[c.id];
                return (
                  <li key={c.id} className="rounded-xl border border-border p-4 text-sm">
                    <div className="flex items-start gap-3">
                      {emailReady && canSelect(s) && (
                        <input type="checkbox" className="mt-1 h-5 w-5" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`انتخاب ${c.english_name}`} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{c.english_name}</span>
                          {emailReady && s?.replied && <RepliedBadge />}
                        </div>
                        {c.arabic_name && <div className="text-xs text-text-muted">{c.arabic_name}</div>}
                      </div>
                    </div>
                    {emailReady && <div className="mt-2"><EmailStatus s={s} /></div>}
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      {c.industry && (<><dt className="text-text-muted">صنعت</dt><dd>{c.industry}</dd></>)}
                      <dt className="text-text-muted">گرید هدف</dt><dd>{GRADE_LABELS_FA[c.grade]}</dd>
                      {c.purchasing_potential && (<><dt className="text-text-muted">پتانسیل خرید</dt><dd>{c.purchasing_potential}</dd></>)}
                    </dl>
                    <div className="mt-3 border-t border-border pt-2 text-xs"><Contact c={c} /></div>
                    {emailReady && canSelect(s) && (
                      <button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={() => openPreview(c.id)}>پیش‌نمایش ایمیل</button>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* دسکتاپ: جدول */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-soft text-start text-text-muted">
                    {emailReady && <th className="w-10 px-3 py-3"><span className="sr-only">انتخاب</span></th>}
                    <th className="px-3 py-3 text-start font-semibold">نام</th>
                    {emailReady && <th className="px-3 py-3 text-start font-semibold">وضعیت ایمیل</th>}
                    <th className="px-3 py-3 text-start font-semibold">صنعت</th>
                    <th className="px-3 py-3 text-start font-semibold">گرید هدف</th>
                    <th className="px-3 py-3 text-start font-semibold">پتانسیل خرید</th>
                    <th className="px-3 py-3 text-start font-semibold">تماس</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => {
                    const s = statuses[c.id];
                    return (
                      <tr key={c.id} className="border-b border-border align-top hover:bg-canvas">
                        {emailReady && (
                          <td className="px-3 py-3">
                            {canSelect(s) && <input type="checkbox" className="h-4 w-4" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`انتخاب ${c.english_name}`} />}
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{c.english_name}</span>
                            {emailReady && s?.replied && <RepliedBadge />}
                          </div>
                          {c.arabic_name && <div className="text-xs text-text-muted">{c.arabic_name}</div>}
                          {c.address && <div className="max-w-xs text-xs text-text-muted">{c.address}</div>}
                          {c.action_plan && <div className="mt-1 text-xs text-primary">برنامه اقدام: {c.action_plan}</div>}
                        </td>
                        {emailReady && (
                          <td className="px-3 py-3">
                            <EmailStatus s={s} />
                            {canSelect(s) && (
                              <button type="button" className="mt-1.5 text-xs text-primary hover:underline" onClick={() => openPreview(c.id)}>پیش‌نمایش ایمیل</button>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-3">{c.industry}</td>
                        <td className="px-3 py-3">{GRADE_LABELS_FA[c.grade]}</td>
                        <td className="px-3 py-3">{c.purchasing_potential}</td>
                        <td className="px-3 py-3 text-xs"><Contact c={c} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtered.length > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} label="شرکت" />}
          </>
        )}
      </section>
    </div>
  );
}
