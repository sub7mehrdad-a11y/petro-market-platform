export default function CompanyTable({ companies }) {
  if (companies.length === 0) {
    return <p className="text-sm text-slate-500">شرکتی پیدا نشد.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-right text-slate-500 border-b border-slate-200">
            <th className="py-2 pe-4">نام</th>
            <th className="py-2 pe-4">کشور</th>
            <th className="py-2 pe-4">صنعت</th>
            <th className="py-2 pe-4">گرید هدف</th>
            <th className="py-2 pe-4">پتانسیل خرید</th>
            <th className="py-2 pe-4">تماس</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c.id} className="border-b border-slate-100 align-top">
              <td className="py-2 pe-4">
                <div className="font-medium">{c.english_name}</div>
                {c.arabic_name && <div className="text-xs text-slate-400">{c.arabic_name}</div>}
                {c.address && <div className="text-xs text-slate-400 max-w-xs">{c.address}</div>}
                {c.action_plan && (
                  <div className="text-xs text-sky-700 mt-1">برنامه اقدام: {c.action_plan}</div>
                )}
              </td>
              <td className="py-2 pe-4 whitespace-nowrap">{c.country}</td>
              <td className="py-2 pe-4">{c.industry}</td>
              <td className="py-2 pe-4">{c.target_grade}</td>
              <td className="py-2 pe-4">{c.purchasing_potential}</td>
              <td className="py-2 pe-4 whitespace-nowrap text-xs">
                {c.phone && <div>{c.phone}</div>}
                {c.email && <div>{c.email}</div>}
                {c.website && (
                  <a
                    href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-700 hover:underline"
                  >
                    {c.website}
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
