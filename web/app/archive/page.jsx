"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const COUNTRIES = ["برزیل", "ترکیه", "چین", "هند", "کنیا", "اردن", "عراق", "سایر"];
const PRODUCTS = ["جوش شیرین", "سود پرک", "آمونیوم سولفات", "سایر"];
const REPORT_TYPE_FA = { detailed: "گزارش مفصل", summary: "گزارش مدیریتی (خلاصه)" };

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArchivePage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("همه");
  const [productFilter, setProductFilter] = useState("همه");
  const [typeFilter, setTypeFilter] = useState("همه");

  const [form, setForm] = useState({ country: COUNTRIES[0], product: PRODUCTS[0], title: "" });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function loadReports() {
    setLoading(true);
    const res = await fetch("/api/reports", { cache: "no-store" });
    const data = await res.json();
    setReports(data);
    setLoading(false);
  }

  useEffect(() => {
    loadReports();
  }, []);

  const filtered = useMemo(() => {
    return reports
      .filter((r) => countryFilter === "همه" || r.country === countryFilter)
      .filter((r) => productFilter === "همه" || r.product === productFilter)
      .filter((r) => typeFilter === "همه" || r.report_type === typeFilter)
      .filter((r) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          r.original_filename.toLowerCase().includes(q) ||
          r.country.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
  }, [reports, query, countryFilter, productFilter, typeFilter]);

  async function handleUpload(e) {
    e.preventDefault();
    setUploadError("");
    if (!file) {
      setUploadError("یک فایل PDF یا Word انتخاب کن.");
      return;
    }
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    body.append("country", form.country);
    body.append("product", form.product);
    body.append("title", form.title);

    const res = await fetch("/api/reports", { method: "POST", body });
    setUploading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setUploadError(data.error || "آپلود ناموفق بود.");
      return;
    }

    setFile(null);
    setForm({ ...form, title: "" });
    await loadReports();
  }

  return (
    <div className="space-y-8">
      <section className="card p-5">
        <h1 className="text-xl font-bold mb-4">آپلود گزارش بازار</h1>
        <form onSubmit={handleUpload} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600 mb-1">کشور</label>
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">محصول</label>
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              value={form.product}
              onChange={(e) => setForm({ ...form, product: e.target.value })}
            >
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-slate-600 mb-1">عنوان گزارش</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              placeholder="مثلاً: تحلیل بازار جوش شیرین برزیل - تابستان ۲۰۲۶"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-slate-600 mb-1">فایل (PDF یا Word)</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </div>
          {uploadError && <p className="sm:col-span-2 text-sm text-rose-600">{uploadError}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={uploading}
              className="bg-copper-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 shadow-sm hover:bg-copper-800 hover:shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              {uploading ? "در حال آپلود..." : "آپلود"}
            </button>
          </div>
        </form>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold">آرشیو گزارش‌ها</h2>
            <p className="text-xs text-slate-500 mt-0.5">همه‌ی گزارش‌ها — چه گزارش‌های هوشمند مدیریتی، چه گزارش‌های مفصل — همین‌جا بایگانی می‌شن.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="جست‌وجو در عنوان/نام فایل..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            />
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            >
              <option value="همه">همه‌ی کشورها</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            >
              <option value="همه">همه‌ی محصولات</option>
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            >
              <option value="همه">همه‌ی انواع</option>
              <option value="summary">گزارش مدیریتی (خلاصه)</option>
              <option value="detailed">گزارش مفصل</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">در حال بارگذاری...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500">گزارشی پیدا نشد.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <Link href={`/reports/${r.id}`} className="font-medium text-copper-700 hover:underline">
                    {r.title}
                  </Link>
                  {r.report_type && (
                    <span className="ms-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {REPORT_TYPE_FA[r.report_type]}
                    </span>
                  )}
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.country} · {r.product} · {formatSize(r.size_bytes)} · {new Date(r.uploaded_at).toLocaleDateString("fa-IR")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
