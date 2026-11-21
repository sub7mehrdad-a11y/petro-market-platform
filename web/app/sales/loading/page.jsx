import LoadingClient from "./LoadingClient";

// لیست بارگیری و ارسال (ترتیب اولویت: زودتر پرداخت‌کننده) — فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";
export const metadata = { title: "بارگیری و ارسال" };

export default function LoadingPage() {
  return <LoadingClient />;
}
