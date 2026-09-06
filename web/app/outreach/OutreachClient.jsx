"use client";

import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";

const GRADE_LABELS = {
  food: "خوراکی",
  feed: "دامی (فید)",
  industrial: "صنعتی",
  unclear: "نامشخص/چندگانه",
};

const BATCH_SIZE = 30;

export default function OutreachClient({ companies, countries, sendingEnabled }) {
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
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [sending, setSending] = useState(false);

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
    } finally {
      setPreviewLoading(false);
    }
  }

  async function sendBatch(ids) {
    if (!confirm(`ارسال واقعی برای ${ids.length.toLocaleString("fa-IR")} شرکت انجام بشه؟`)) return;
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
        // موفق‌ها رو از لیست انتخاب حذف کن تا اشتباهی دوباره فرستاده نشن
        setSelected((prev) => {
          const next = new Map(prev);
          for (const r of data.results || []) {
            if (r.ok) next.delete(r.id);
          }
          return next;
        });
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

      {!sendingEnabled && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
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
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
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
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
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
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px]"
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-slate-600">
            {filtered.length.toLocaleString("fa-IR")} شرکت مطابق این فیلتر
          </p>
          <button
            type="button"
            onClick={() => addToSelection(filtered)}
            disabled={filtered.length === 0}
            className="bg-petrol-700 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-petrol-800 disabled:opacity-40"
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
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full max-w-md"
        />
        {addSearchMatches.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {addSearchMatches.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {c.english_name} <span className="text-slate-400">— {c.country}</span>
                </span>
                <button
                  type="button"
                  onClick={() => addToSelection([c])}
                  className="text-copper-700 hover:underline shrink-0"
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
            <button type="button" onClick={clearAll} className="text-xs text-rose-600 hover:underline">
              پاک‌کردن کل لیست
            </button>
          )}
        </div>

        {selectedList.length === 0 ? (
          <p className="text-sm text-slate-500">هنوز شرکتی به لیست اضافه نشده.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
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
                  <tr key={c.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pe-3">
                      <input type="checkbox" checked={checked} onChange={() => toggleChecked(c.id)} />
                    </td>
                    <td className="py-2 pe-3 font-medium">{c.english_name}</td>
                    <td className="py-2 pe-3 whitespace-nowrap">{c.country}</td>
                    <td className="py-2 pe-3 whitespace-nowrap">
                      {GRADE_LABELS[c.grade]}
                      {c.already_sent && (
                        <span className="ms-1.5 text-[10px] bg-rose-50 text-rose-700 rounded-full px-1.5 py-0.5">
                          قبلاً ارسال شده
                        </span>
                      )}
                    </td>
                    <td className="py-2 pe-3 text-xs text-slate-500 whitespace-nowrap">{c.email}</td>
                    <td className="py-2">
                      <button type="button" onClick={() => removeRow(c.id)} className="text-slate-400 hover:text-rose-600">
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
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => openPreview(checkedIds.slice(0, 10))}
              className="border border-slate-300 text-slate-700 text-sm font-medium rounded-lg px-4 py-2 hover:bg-slate-50"
            >
              پیش‌نمایش (حداکثر ۱۰ تا)
            </button>
            <button
              type="button"
              onClick={() => sendBatch(checkedIds.slice(0, BATCH_SIZE))}
              disabled={!sendingEnabled || sending}
              className="bg-copper-700 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-copper-800 disabled:opacity-40"
            >
              {sending
                ? "در حال ارسال..."
                : `ارسال ${Math.min(checkedIds.length, BATCH_SIZE).toLocaleString("fa-IR")} تای اول`}
            </button>
            {checkedIds.length > BATCH_SIZE && (
              <span className="text-xs text-slate-400">
                (سقف هر دسته {BATCH_SIZE} تاست — بقیه رو بعد از این دسته بفرست)
              </span>
            )}
          </div>
        )}

        {sendResult && (
          <div
            className={`mt-3 text-sm rounded-lg px-3 py-2 ${
              sendResult.status === 200
                ? "bg-petrol-50 text-petrol-800 border border-petrol-100"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
          >
            {sendResult.error || `${sendResult.sent} ایمیل ارسال شد، ${sendResult.failed} ناموفق.`}
          </div>
        )}
      </section>

      {/* پیش‌نمایش */}
      {previewLoading && <p className="text-sm text-slate-500">در حال ساخت پیش‌نمایش...</p>}
      {previews && (
        <section className="card p-5 space-y-5">
          <h2 className="text-lg font-bold">پیش‌نمایش ({previews.length.toLocaleString("fa-IR")} نمونه)</h2>
          {previews.map((p) => (
            <div key={p.id} className="border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500 mb-1">
                {p.english_name} — {p.email} — گرید: {p.grade_label_fa}
              </div>
              <div className="text-sm font-bold mb-2">{p.subject}</div>
              <pre className="text-xs whitespace-pre-wrap font-sans leading-6 text-slate-700 bg-slate-50 rounded-md p-3">
                {p.body}
              </pre>
              <div className="text-[11px] text-slate-400 mt-2">
                پیوست‌ها: {p.attachments?.join("، ")}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
