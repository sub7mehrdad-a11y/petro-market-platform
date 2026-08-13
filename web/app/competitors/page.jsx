import Link from "next/link";
import { getCompetitors } from "@/lib/data";

export default function CompetitorsPage() {
  const competitors = Object.values(getCompetitors());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تحلیل رقبا</h1>
        <p className="text-sm text-slate-500 mt-1">
          رصد مستمر رقبای صادراتی اصلی در بازار جوش شیرین. ترکیه به‌عنوان رقیب اول با یک ایجنت
          اختصاصی روزانه رصد می‌شود.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {competitors.map((c) => (
          <Link
            key={c.id}
            href={`/competitors/${c.id}`}
            className="block bg-white border border-slate-200 rounded-xl shadow-sm p-5 hover:border-copper-500 hover:shadow-md transition-all"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h2 className="text-lg font-black text-petrol-900">{c.name}</h2>
              <span className="text-xs text-slate-400">{c.name_en}</span>
            </div>
            <p className="text-xs text-copper-700 font-medium mb-3">{c.rank_note}</p>
            <p className="text-sm text-slate-600 leading-7 line-clamp-3">{c.summary}</p>

            <div className="flex flex-wrap gap-2 mt-4">
              {(c.headline_stats || []).slice(0, 2).map((s, i) => (
                <span key={i} className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                  <span className="text-slate-500">{s.label}: </span>
                  <span className="font-bold text-petrol-900 font-tabular">{s.value}</span>
                  <span className="text-slate-500"> {s.unit}</span>
                </span>
              ))}
            </div>

            <span className="inline-block mt-4 text-sm text-copper-700 font-medium">
              مشاهده‌ی تحلیل کامل ←
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
