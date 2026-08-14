import { buildSearchIndex } from "@/lib/searchIndex";
import AskClient from "./AskClient";

export default function AskPage() {
  // ایندکس در زمان build ساخته و به کلاینت فرستاده می‌شود، تا جست‌وجوی فوری
  // بدون رفت‌وبرگشت به سرور و بدون نیاز به کلید API کار کند.
  const index = buildSearchIndex().map((it) => ({
    id: it.id,
    type: it.type,
    typeLabel: it.typeLabel,
    title: it.title,
    subtitle: it.subtitle,
    // متن هر آیتم برای حجم منطقی صفحه محدود می‌شود؛ پاسخ هوشمند سمت سرور به
    // متن کامل دسترسی دارد.
    body: (it.body || "").slice(0, 1200),
    url: it.url,
    _norm: it._norm.slice(0, 3000),
  }));

  return <AskClient index={index} />;
}
