import MemoryClient from "./MemoryClient";

// پرسش از حافظه‌ی مغز (مرحله‌ی ۲) — فقط مدیر؛ API هم خودش مدیر بودن را بررسی می‌کند.
export const dynamic = "force-dynamic";
export const metadata = { title: "حافظه‌ی مغز" };

export default function MemoryPage() {
  return <MemoryClient />;
}
