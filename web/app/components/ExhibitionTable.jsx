export default function ExhibitionTable({ exhibitions }) {
  if (exhibitions.length === 0) {
    return <p className="text-sm text-slate-500">نمایشگاهی پیدا نشد.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-right text-slate-500 border-b border-slate-200">
            <th className="py-2 pe-4">نمایشگاه</th>
            <th className="py-2 pe-4">کشور</th>
            <th className="py-2 pe-4">محل</th>
            <th className="py-2 pe-4">زمان</th>
            <th className="py-2 pe-4">تمرکز / اهمیت</th>
          </tr>
        </thead>
        <tbody>
          {exhibitions.map((e) => (
            <tr key={e.id} className="border-b border-slate-100 align-top">
              <td className="py-2 pe-4">
                <div className="font-medium">{e.name}</div>
                {e.organizer && <div className="text-xs text-slate-400">{e.organizer}</div>}
                {e.website && (
                  <a
                    href={e.website.startsWith("http") ? e.website : `https://${e.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-700 hover:underline"
                  >
                    {e.website}
                  </a>
                )}
              </td>
              <td className="py-2 pe-4 whitespace-nowrap">{e.country}</td>
              <td className="py-2 pe-4">{e.location}</td>
              <td className="py-2 pe-4 whitespace-nowrap">{e.date}</td>
              <td className="py-2 pe-4 max-w-sm text-slate-600">
                {e.focus || e.target_grade}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
