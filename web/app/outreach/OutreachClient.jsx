"use client";

import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { jalaliFa } from "@/lib/dateFormat";
import QueuePanel from "./QueuePanel";
import ReportPanel from "./ReportPanel";
import AutoPanel from "./AutoPanel";

const GRADE_LABELS = {
  food: "خوراکی",
  feed: "دامی (فید)",
  industrial: "صنعتی",
  unclear: "نامشخص/چندگانه",
};

// حالا «صف‌گذاری»ه، نه ارسال فوری (ارسال واقعی با فاصله‌ی زمانی توسط کارگر پس‌زمینه) — سقف بالاتره.
const BATCH_SIZE = 200;

export default function OutreachClient({ companies, countries, sendingEnabled, halt }) {
  // توقف اضطراری دستی (data/outreach_halt.json): همه‌ی دکمه‌های ارسال غیرفعال؛ انتخاب و پیش‌نمایش فقط‌خواندنی کار می‌کند.
  const halted = !!halt;
  const canSend = sendingEnabled && !halted;
  const [country, setCountry] = useState("همه");
  const [industry, setIndustry] = useState("");
  const [grade, setGrade] = useState("همه");
  const [addQuery, setAddQuery] = useState("");

  // نتیجه‌ی فیلتر فعلی — فقط برای *دیدن* گزینه‌هاست، نه خودِ انتخاب.
  const filtered = useMemo(() => {
    const ind = industry.trim().toLowerCase();
    return companies.filter((c) => {
      if (country !== "همه" && c.country !== country) return false;
      if (grade !== "همه" && c.grade !== grade) return false;
      if (ind && !(c.industry || "").toLowerCase().includes(ind)) return false;
      return true;
    });
  }, [companies, country, industry, grade]);

  // لیست نهایی برای ارسال — تجمعیه: چند بار فیلتر کردن و «افزودن به لیست» زدن،
  // همه روی هم جمع می‌شن؛ فقط با «×» یا برداشتن تیک از این لیست حذف می‌شه.
  const [selected, setSelected] = useState(new Map()); // id -> {company, checked}
  const [previewIds, setPreviewIds] = useState([]);
  const [previews, setPreviews] = useState(null);
  const [previewCc, setPreviewCc] = useState([]);
  const [missingLinkEnvVars, setMissingLinkEnvVars] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [queueRefresh, setQueueRefresh] = useState(0);

  const addToSelection = (list) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of list) {
        if (!next.has(c.id)) {
          next.set(c.id, { company: c, checked: !c.already_sent });
        }
      }
      return next;
    });
  };

  const addSearchMatches = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return [];
    return companies.filter((c) => (c.english_name || "").toLowerCase().includes(q)).slice(0, 8);
  }, [addQuery, companies]);

  const selectedList = [...selected.values()];
  const checkedIds = selectedList.filter((r) => r.checked).map((r) => r.company.id);

  function toggleChecked(id) {
    setSelected((prev) => {
      const next = new Map(prev);
      const row = next.get(id);
      if (row) next.set(id, { ...row, checked: !row.checked });
      return next;
    });
  }

  function removeRow(id) {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function clearAll() {
    setSelected(new Map());
    setPreviews(null);
    setSendResult(null);
  }

  async function openPreview(ids) {
    setPreviewIds(ids);
    setPreviewLoading(true);
    setPreviews(null);
    try {
      const res = await fetch("/api/outreach/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: ids }),
      });
      const data = await res.json();
      setPreviews(data.previews || []);
      setPreviewCc(data.cc || []);
      setMissingLinkEnvVars(data.missingLinkEnvVars || []);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function sendBatch(ids) {
    if (!confirm(`${ids.length.toLocaleString("fa-IR")} شرکت به صف ارسال واقعی اضافه بشه؟ (ایمیل‌ها با فاصله‌ی زمانی، یکی‌یکی فرستاده می‌شن)`)) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: ids }),
      });
      const data = await res.json();
      setSendResult({ status: res.status, ...data });
      if (res.ok) {
        // هرچی وارد صف شد (یا از قبل ارسال/در صف بود) از لیست انتخاب حذف می‌شه تا دوباره اضافه نشه
        setSelected((prev) => {
          const next = new Map(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
        setQueueRefresh((n) => n + 1);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ایمیل معرفی"
        subtitle="ارسال دسته‌ای ایمیل معرفی شرکت + کاتالوگ محصول، بر اساس کشور/صنعت/گرید هر شرکت."
      />

      {halted && (
        <div role="alert" className="rounded-xl border border-danger bg-danger-soft px-5 py-4 text-danger">
          <h2 className="text-lg font-black">ارسال ایمیل متوقف شده است</h2>
          <p className="mt-2 text-sm">علت: {halt.reason}</p>
          {halt.halted_at && <p className="mt-1 text-sm">تاریخ توقف: {jalaliFa(halt.halted_at)} (شمسی)</p>}
          <p className="mt-2 text-sm">تا برداشته‌شدن توقف توسط مدیر سیستم هیچ ایمیلی ارسال نمی‌شود. برداشتن توقف فقط از طرف مدیر سیستم روی سرور انجام می‌شود.</p>
        </div>
      )}

      {!sendingEnabled && !halted && (
        <div className="bg-warning-soft border border-warning text-warning text-sm rounded-lg px-4 py-3">
          ⚠ ارسال واقعی فعلاً غیرفعاله (در انتظار تأیید هیئت‌مدیره) — می‌تونی لیست بسازی و پیش‌نمایش
          بگیری، ولی دکمه‌ی «ارسال» تا فعال‌شدن <code className="font-mono">OUTREACH_SENDING_ENABLED</code> کار
          نمی‌کنه.
        </div>
      )}

      {/* فیلترها */}
      <section className="card p-5">
        <h2 className="text-lg font-bold mb-3">۱. فیلتر کن و به لیست اضافه کن</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="input"
          >
            <option value="همه">همه‌ی کشورها</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="input"
          >
            <option value="همه">همه‌ی گریدها</option>
            {Object.entries(GRADE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="جست‌وجو در صنعت..."
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="input flex-1 min-w-[160px]"
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-text">
            {filtered.length.toLocaleString("fa-IR")} شرکت مطابق این فیلتر
          </p>
          <button
            type="button"
            onClick={() => addToSelection(filtered)}
            disabled={filtered.length === 0}
            className="btn"
          >
            + افزودن این {filtered.length.toLocaleString("fa-IR")} شرکت به لیست ارسال
          </button>
        </div>
      </section>

      {/* افزودن دستی */}
      <section className="card p-5">
        <h2 className="text-lg font-bold mb-3">افزودن دستیِ یک شرکت خاص (بر اساس اسم)</h2>
        <input
          type="text"
          placeholder="اسم شرکت رو تایپ کن..."
          value={addQuery}
          onChange={(e) => setAddQuery(e.target.value)}
          className="input w-full max-w-md"
        />
        {addSearchMatches.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {addSearchMatches.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {c.english_name} <span className="text-text-muted">— {c.country}</span>
                </span>
                <button
                  type="button"
                  onClick={() => addToSelection([c])}
                  className="text-primary hover:underline shrink-0"
                >
                  + افزودن
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* لیست نهایی */}
      <section className="card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-lg font-bold">
            ۲. لیست نهایی ارسال ({selectedList.length.toLocaleString("fa-IR")} شرکت،{" "}
            {checkedIds.length.toLocaleString("fa-IR")} تیک‌خورده)
          </h2>
          {selectedList.length > 0 && (
            <button type="button" onClick={clearAll} className="text-xs text-danger hover:underline">
              پاک‌کردن کل لیست
            </button>
          )}
        </div>

        {selectedList.length === 0 ? (
          <p className="text-sm text-text-muted">هنوز شرکتی به لیست اضافه نشده.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-text-muted border-b border-border">
                  <th className="py-2 pe-3"></th>
                  <th className="py-2 pe-3">نام</th>
                  <th className="py-2 pe-3">کشور</th>
                  <th className="py-2 pe-3">گرید</th>
                  <th className="py-2 pe-3">ایمیل</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {selectedList.map(({ company: c, checked }) => (
                  <tr key={c.id} className="border-b border-border align-top">
                    <td className="py-2 pe-3">
                      <input type="checkbox" checked={checked} onChange={() => toggleChecked(c.id)} />
                    </td>
                    <td className="py-2 pe-3 font-medium">{c.english_name}</td>
                    <td className="py-2 pe-3 whitespace-nowrap">{c.country}</td>
                    <td className="py-2 pe-3 whitespace-nowrap">
                      {GRADE_LABELS[c.grade]}
                      {c.already_sent && (
                        <span className="ms-1.5 text-[10px] bg-danger-soft text-danger rounded-full px-1.5 py-0.5">
                          قبلاً ارسال شده
                        </span>
                      )}
                    </td>
                    <td className="py-2 pe-3 text-xs text-text-muted whitespace-nowrap">{c.email}</td>
                    <td className="py-2">
                      <button type="button" onClick={() => removeRow(c.id)} className="text-text-muted hover:text-danger">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {checkedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => openPreview(checkedIds.slice(0, 10))}
              className="btn btn-secondary"
            >
              پیش‌نمایش (حداکثر ۱۰ تا)
            </button>
            <button
              type="button"
              onClick={() => sendBatch(checkedIds.slice(0, BATCH_SIZE))}
              disabled={!canSend || sending}
              className="btn"
            >
              {sending
                ? "در حال افزودن به صف..."
                : `افزودن ${Math.min(checkedIds.length, BATCH_SIZE).toLocaleString("fa-IR")} شرکت به صف ارسال`}
            </button>
            {checkedIds.length > BATCH_SIZE && (
              <span className="text-xs text-text-muted">
                (سقف هر بار {BATCH_SIZE} شرکت — بقیه رو بعداً اضافه کن)
              </span>
            )}
          </div>
        )}

        {sendResult && (
          <div
            className={`mt-3 text-sm rounded-lg px-3 py-2 ${
              sendResult.status === 200
                ? "bg-canvas text-text border border-border"
                : "bg-danger-soft text-danger border border-danger"
            }`}
          >
            {sendResult.error ||
              `${(sendResult.queued ?? 0).toLocaleString("fa-IR")} شرکت وارد صف شد${
                sendResult.skipped?.length ? `، ${sendResult.skipped.length.toLocaleString("fa-IR")} مورد رد شد (تکراری/نامعتبر)` : ""
              }. ارسال خودکار با فاصله‌ی حدود ${(sendResult.interval_sec || 60).toLocaleString("fa-IR")} ثانیه انجام می‌شود.${
                sendResult.test_redirect ? " (حالت تست: همه‌ی ایمیل‌ها فقط به آدرس تست می‌رن)" : ""
              }`}
            {sendResult.logError && <div className="mt-1 font-semibold text-danger">⚠ {sendResult.logError}</div>}
          </div>
        )}
      </section>

      <AutoPanel halted={halted} />

      <QueuePanel refreshKey={queueRefresh} halted={halted} />

      <ReportPanel />

      {/* پیش‌نمایش */}
      {previewLoading && <p className="text-sm text-text-muted">در حال ساخت پیش‌نمایش...</p>}
      {previews && (
        <section className="card p-5 space-y-5">
          <h2 className="text-lg font-bold">پیش‌نمایش ({previews.length.toLocaleString("fa-IR")} نمونه)</h2>
          <div
            className={`text-xs rounded-md px-3 py-2 border ${
              previewCc.length > 0
                ? "bg-canvas text-text border-border"
                : "bg-warning-soft text-warning border-warning"
            }`}
          >
            {previewCc.length > 0
              ? `CC روی همه‌ی ایمیل‌ها: ${previewCc.join("، ")}`
              : "⚠️ هیچ آدرس CC ای تنظیم نشده (OUTREACH_CC_EMAILS خالیه) — قبل از ارسال واقعی چک کن."}
          </div>
          {missingLinkEnvVars.length > 0 && (
            <div className="text-xs rounded-md px-3 py-2 border bg-warning-soft text-warning border-warning">
              ⚠️ لینک کاتالوگ‌ها هنوز روی سایت آپلود/تنظیم نشده (متغیرهای env گمشده:{" "}
              {missingLinkEnvVars.join("، ")}) — پایین متن ایمیل به‌جاش «[LINK PENDING]» می‌بینی. تا
              این تنظیم نشه، دکمه‌ی ارسال واقعی هم قفل می‌مونه.
            </div>
          )}
          {previews.map((p) => (
            <div key={p.id} className="border border-border rounded-lg p-4">
              <div className="text-xs text-text-muted mb-1">
                {p.english_name} — {p.email} — گرید: {p.grade_label_fa}
              </div>
              <div className="text-sm font-bold mb-2">{p.subject}</div>
              <pre className="text-xs whitespace-pre-wrap font-sans leading-6 text-text bg-canvas rounded-md p-3">
                {p.body}
              </pre>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
