import Link from "next/link";
import { notFound } from "next/navigation";
import { getExhibitions, getExhibition, getExhibitionReport } from "@/lib/data";

const AVAILABILITY_FA = {
  sufficient: "کامل",
  limited: "محدود",
  none: "در دسترس نیست",
};

export function generateStaticParams() {
  return getExhibitions().map((e) => ({ id: e.id }));
}

function Section({ title, subtitle, children }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-petrol-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function ExhibitionDetailPage({ params }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const e = getExhibition(id);

  if (!e) notFound();

  const report = getExhibitionReport(id);
  const hasRealData = report && report.data_availability !== "none";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/exhibitions" className="text-sm text-slate-500 hover:underline">
          ← بانک نمایشگاه‌ها
        </Link>
      </div>

      <section className="bg-petrol-gradient text-white rounded-xl overflow-hidden relative">
        <div
          className="pointer-events-none absolute -top-20 -start-20 h-64 w-64 rounded-full opacity-50"
          style={{ background: "radial-gradient(circle, rgba(201,118,46,.4), transparent 70%)" }}
        />
        <div className="relative z-10 p-6">
          <div className="flex items-baseline gap-3 flex-wrap mb-1">
            <h1 className="text-2xl font-black">{e.name}</h1>
            <span className="text-sm text-petrol-200">{e.country}</span>
          </div>
          {e.organizer && <p className="text-copper-300 text-sm font-medium mb-3">{e.organizer}</p>}

          <div className="grid gap-3 sm:grid-cols-3 mt-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
              <div className="text-[11px] text-petrol-200 mb-1">زمان</div>
              <div className="font-bold text-sm">{e.date}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
              <div className="text-[11px] text-petrol-200 mb-1">محل</div>
              <div className="font-bold text-sm">{e.location}</div>
            </div>
            {e.website && (
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                <div className="text-[11px] text-petrol-200 mb-1">وب‌سایت رسمی</div>
                <a
                  href={e.website.startsWith("http") ? e.website : `https://${e.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-sm text-copper-300 hover:underline"
                >
                  {e.website} ↗
                </a>
              </div>
            )}
          </div>

          {(e.focus || e.target_grade) && (
            <p className="text-sm leading-7 text-petrol-50 max-w-3xl mt-4">
              {e.focus || e.target_grade}
            </p>
          )}

          {/* خریداران/غرفه‌داران بالقوه — فعلاً فقط فایل ارمنستان این ستون را دارد */}
          {e.audience && (
            <p className="text-sm leading-7 text-petrol-100 max-w-3xl mt-2">
              <span className="text-petrol-300">خریداران و غرفه‌داران بالقوه: </span>
              {e.audience}
            </p>
          )}
        </div>
      </section>

      <Section
        title="بررسی خلاصه"
        subtitle="ترکیب صنایع حاضر و عملکرد دوره‌های قبل — استخراج‌شده از سایت رسمی نمایشگاه"
      >
        {!report ? (
          <p className="text-sm text-slate-500">
            گزارشی برای این نمایشگاه هنوز ساخته نشده. اسکریپت{" "}
            <code className="text-xs">scripts/enrich_exhibitions.py</code> را اجرا کنید.
          </p>
        ) : !hasRealData ? (
          <p className="text-sm text-slate-500">
            {report.past_editions_summary || "اطلاعات کافی درباره‌ی این نمایشگاه در دسترس نیست."}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  report.data_availability === "sufficient"
                    ? "bg-copper-50 text-copper-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                میزان اطلاعات: {AVAILABILITY_FA[report.data_availability]}
              </span>
            </div>

            {report.industries_present?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 mb-2">صنایع پررنگ‌تر در این نمایشگاه</h4>
                <div className="flex flex-wrap gap-2">
                  {report.industries_present.map((ind, i) => (
                    <span
                      key={i}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-full px-3 py-1"
                    >
                      {ind}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {report.past_editions_summary && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 mb-2">عملکرد دوره‌های قبل</h4>
                <p className="text-sm leading-7 text-slate-700">{report.past_editions_summary}</p>
              </div>
            )}

            {report.exhibitor_notes && (
              <div className="rounded-lg bg-petrol-50 border border-petrol-100 p-4">
                <h4 className="text-xs font-bold text-petrol-800 mb-1.5">نکته برای تصمیم به حضور</h4>
                <p className="text-sm leading-7 text-slate-700">{report.exhibitor_notes}</p>
              </div>
            )}

            {report.sources?.length > 0 && (
              <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1 pt-1">
                <span>منبع:</span>
                {report.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-copper-700 hover:underline"
                  >
                    {s.url}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
