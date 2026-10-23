"use client";

import Link from "next/link";
import useCompanyEmailStatus from "./useCompanyEmailStatus";
import { GRADE_LABELS_FA } from "@/lib/companyGrades";

const fa = (n) => Number(n || 0).toLocaleString("fa-IR");

function Tile({ label, value, tone = "default" }) {
  const toneClass =
    tone === "success" ? "bg-success-soft text-success" : tone === "primary" ? "bg-primary-soft text-primary" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-canvas text-text";
  return (
    <div className={`rounded-xl px-3 py-2.5 ${toneClass}`}>
      <div className="text-xl font-black leading-none">{value}</div>
      <div className="mt-1.5 text-[11px] leading-5">{label}</div>
    </div>
  );
}

/**
 * باکس ورودی «شرکت‌های این کشور» در صفحه‌ی کشور: خلاصه + دکمه‌ی ورود به صفحه‌ی کامل شرکت‌ها.
 * شمار شرکت‌ها و گریدها استاتیک‌اند؛ آمار ایمیل فقط برای نقش بازرگانی (و وقتی رابط ایمیل روشن است) از API می‌آید.
 */
export default function CompaniesEntryBox({ country, total, withEmail, gradeCounts }) {
  const { state, data } = useCompanyEmailStatus(country);
  const href = `/countries/${encodeURIComponent(country)}/companies`;
  const s = data?.summary;

  return (
    <section className="card overflow-hidden" aria-labelledby="companies-box-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-soft px-5 py-4">
        <div>
          <h2 id="companies-box-title" className="text-lg font-bold">شرکت‌های {country}</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            {fa(total)} شرکت شناسایی‌شده{withEmail != null ? ` — ${fa(withEmail)} شرکت با ایمیل معتبر` : ""}
          </p>
        </div>
        <Link href={href} className="btn hover:no-underline">
          مشاهده‌ی شرکت‌ها ←
        </Link>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <div className="mb-2 text-xs font-semibold text-text-muted">تعداد شرکت‌ها به تفکیک گرید هدف</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(GRADE_LABELS_FA).map(([k, label]) => (
              <Tile key={k} label={label} value={fa(gradeCounts?.[k])} />
            ))}
          </div>
        </div>

        {state === "loading" && (
          <div className="h-[74px] animate-pulse rounded-xl bg-canvas" aria-hidden="true" />
        )}

        {state === "ready" && s && (
          <div>
            <div className="mb-2 text-xs font-semibold text-text-muted">آمار ایمیل معرفی</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Tile label="ایمیل ارسال‌شده" value={fa(s.sent)} tone="success" />
              <Tile label="یادآوری ارسال‌شده" value={fa(s.reminded)} tone="success" />
              <Tile label={data.replies_known ? "پاسخ داده‌اند" : "پاسخ (نامشخص)"} value={data.replies_known ? fa(s.replied) : "—"} tone="primary" />
              <Tile label="در صف ارسال" value={fa(s.queued)} tone="warning" />
              <Tile label="هنوز ارسال‌نشده" value={fa(s.not_sent)} />
            </div>
            {s.bounced > 0 && (
              <p className="mt-2 text-xs text-danger">{fa(s.bounced)} ایمیل برگشت خورده است.</p>
            )}
          </div>
        )}

        <p className="text-[11px] leading-5 text-text-muted">
          گرید هر شرکت از متن «گرید هدف» ثبت‌شده در بانک شرکت‌ها برداشته می‌شود؛ مواردی که چند گرید دارند یا مشخص نیستند در «نامشخص/چندگانه» می‌آیند.
        </p>
      </div>
    </section>
  );
}
