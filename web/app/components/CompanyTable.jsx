function ContactCell({ c }) {
  return (
    <>
      {c.phone && <div dir="ltr" className="text-start">{c.phone}</div>}
      {c.email && <div dir="ltr" className="break-all text-start">{c.email}</div>}
      {c.website && (
        <a
          href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {c.website}
        </a>
      )}
    </>
  );
}

export default function CompanyTable({ companies }) {
  if (companies.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-canvas p-6 text-center">
        <p className="font-semibold">شرکتی پیدا نشد</p>
        <p className="mt-1 text-sm text-text-muted">عبارت جست‌وجو یا کشور را تغییر دهید.</p>
      </div>
    );
  }

  return (
    <>
      {/* موبایل: کارت */}
      <ul className="space-y-3 md:hidden">
        {companies.map((c) => (
          <li key={c.id} className="rounded-xl border border-border p-4 text-sm">
            <div className="font-bold">{c.english_name}</div>
            {c.arabic_name && <div className="text-xs text-text-muted">{c.arabic_name}</div>}
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-text-muted">کشور</dt><dd>{c.country}</dd>
              {c.industry && (<><dt className="text-text-muted">صنعت</dt><dd>{c.industry}</dd></>)}
              {c.target_grade && (<><dt className="text-text-muted">گرید هدف</dt><dd>{c.target_grade}</dd></>)}
              {c.purchasing_potential && (<><dt className="text-text-muted">پتانسیل خرید</dt><dd>{c.purchasing_potential}</dd></>)}
            </dl>
            {c.action_plan && <div className="mt-2 text-xs text-primary">برنامه اقدام: {c.action_plan}</div>}
            <div className="mt-3 border-t border-border pt-2 text-xs"><ContactCell c={c} /></div>
          </li>
        ))}
      </ul>

      {/* دسکتاپ: جدول */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-soft text-start text-text-muted">
              <th className="px-3 py-3 text-start font-semibold">نام</th>
              <th className="px-3 py-3 text-start font-semibold">کشور</th>
              <th className="px-3 py-3 text-start font-semibold">صنعت</th>
              <th className="px-3 py-3 text-start font-semibold">گرید هدف</th>
              <th className="px-3 py-3 text-start font-semibold">پتانسیل خرید</th>
              <th className="px-3 py-3 text-start font-semibold">تماس</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-border align-top hover:bg-canvas">
                <td className="px-3 py-3">
                  <div className="font-medium">{c.english_name}</div>
                  {c.arabic_name && <div className="text-xs text-text-muted">{c.arabic_name}</div>}
                  {c.address && <div className="max-w-xs text-xs text-text-muted">{c.address}</div>}
                  {c.action_plan && (
                    <div className="mt-1 text-xs text-primary">برنامه اقدام: {c.action_plan}</div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{c.country}</td>
                <td className="px-3 py-3">{c.industry}</td>
                <td className="px-3 py-3">{c.target_grade}</td>
                <td className="px-3 py-3">{c.purchasing_potential}</td>
                <td className="px-3 py-3 text-xs"><ContactCell c={c} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
