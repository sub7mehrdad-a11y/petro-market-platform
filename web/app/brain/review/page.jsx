import ReviewClient from "./ReviewClient";

// بازبینی روزانه‌ی کارشناسان (مرحله‌ی ۷): حداکثر ۵ مورد در روز؛ ارزیابی کور.
export const dynamic = "force-dynamic";
export const metadata = { title: "بازبینی روزانه" };

export default function ReviewPage() {
  return <ReviewClient />;
}
