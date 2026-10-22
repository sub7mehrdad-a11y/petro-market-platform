"use client";

// دکمه‌ی چاپ — کل صفحه با استایل @media print (A4) چاپ می‌شود؛ در خود چاپ مخفی است.
export default function PrintButton({ label = "چاپ" }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-secondary print:hidden">
      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z" />
      </svg>
      {label}
    </button>
  );
}
