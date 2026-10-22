import Link from "next/link";
import ExhibitionCountdownBadge from "./ExhibitionCountdownBadge";

function siteHref(w) {
  return w.startsWith("http") ? w : `https://${w}`;
}

export default function ExhibitionTable({ exhibitions }) {
  if (exhibitions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-canvas p-6 text-center">
        <p className="font-semibold">نمایشگاهی پیدا نشد</p>
        <p className="mt-1 text-sm text-text-muted">عبارت جست‌وجو یا کشور را تغییر دهید.</p>
      </div>
    );
  }

  return (
    <>
      {/* موبایل: کارت */}
      <ul className="space-y-3 md:hidden">
        {exhibitions.map((e) => (
          <li key={e.id} className="rounded-xl border border-border p-4 text-sm">
            <Link href={`/exhibitions/${e.id}`} className="font-bold text-primary hover:underline">
              {e.name}
            </Link>
            {e.organizer && <div className="text-xs text-text-muted">{e.organizer}</div>}
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-text-muted">کشور</dt><dd>{e.country}</dd>
              {e.location && (<><dt className="text-text-muted">محل</dt><dd>{e.location}</dd></>)}
              <dt className="text-text-muted">زمان</dt>
              <dd>
                {e.date}
                <div className="mt-1"><ExhibitionCountdownBadge dateStr={e.date} /></div>
              </dd>
            </dl>
            {(e.focus || e.target_grade) && (
              <p className="mt-2 text-xs leading-6">{e.focus || e.target_grade}</p>
            )}
          </li>
        ))}
      </ul>

      {/* دسکتاپ: جدول */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-soft text-text-muted">
              <th className="px-3 py-3 text-start font-semibold">نمایشگاه</th>
              <th className="px-3 py-3 text-start font-semibold">کشور</th>
              <th className="px-3 py-3 text-start font-semibold">محل</th>
              <th className="px-3 py-3 text-start font-semibold">زمان و وضعیت</th>
              <th className="px-3 py-3 text-start font-semibold">تمرکز / اهمیت</th>
            </tr>
          </thead>
          <tbody>
            {exhibitions.map((e) => (
              <tr key={e.id} className="border-b border-border align-top hover:bg-canvas">
                <td className="px-3 py-3">
                  <Link href={`/exhibitions/${e.id}`} className="font-medium text-primary hover:underline">
                    {e.name}
                  </Link>
                  {e.organizer && <div className="text-xs text-text-muted">{e.organizer}</div>}
                  {e.website && (
                    <a
                      href={siteHref(e.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-primary hover:underline"
                    >
                      {e.website}
                    </a>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{e.country}</td>
                <td className="px-3 py-3">{e.location}</td>
                <td className="whitespace-nowrap px-3 py-3">
                  <div>{e.date}</div>
                  <div className="mt-1"><ExhibitionCountdownBadge dateStr={e.date} /></div>
                </td>
                <td className="max-w-sm px-3 py-3 text-text">{e.focus || e.target_grade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
