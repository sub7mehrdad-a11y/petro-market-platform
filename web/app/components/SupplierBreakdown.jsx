/**
 * کارت «کشورهای مبدأ» — الگوی طرح مرجع (ui/01-dashboard.png)، با داده‌ی واقعی
 * ITC از data/import_suppliers.json.
 *
 * هر ردیف: پرچم + نام (راست) · ارزش · نوار سهم · رشد سالانه (چپ).
 *
 * چرا این کارت مهم است: تا امروز «شرکای تجاری» هر کشور را هوش مصنوعی از متن
 * گزارش‌ها بیرون می‌کشید (سه مورد اول، بدون عدد دقیق). این‌جا کل فهرست مستقیم
 * از منبع رسمی می‌آید، با سهم، قیمت واحد و تعرفه‌ی گمرکی هر مبدأ.
 */

function pct(value) {
  if (value == null) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fa-IR")}٪`;
}

function usdK(valueK) {
  if (valueK == null) return "—";
  if (valueK >= 1000) {
    return `${(valueK / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} م.د`;
  }
  return `${valueK.toLocaleString("fa-IR")} هـ.د`;
}

export default function SupplierBreakdown({ data, highlight = "ایران" }) {
  if (!data?.suppliers?.length) return null;

  const max = Math.max(...data.suppliers.map((s) => s.value_usd_k || 0)) || 1;
  const anyTariff = data.suppliers.some((s) => s.tariff_pct != null);

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
        <h2 className="text-lg font-bold">کشورهای مبدأ واردات</h2>
        <span className="text-xs text-slate-400">
          بر پایه‌ی ارزش واردات · {data.year?.toLocaleString("fa-IR", { useGrouping: false })}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        منبع: ITC Trade Map — تفکیک واقعی مبدأ‌به‌مبدأ. کل واردات{" "}
        <b className="font-tabular">{usdK(data.total?.value_usd_k)}</b>
        {data.total?.quantity != null && (
          <>
            {" "}
            معادل <b className="font-tabular">{data.total.quantity.toLocaleString("fa-IR")}</b> تن
          </>
        )}
        .
      </p>

      <ul className="divide-y divide-slate-100">
        {data.suppliers.map((s, i) => {
          const isUs = s.country === highlight;
          return (
            <li
              key={i}
              className={`py-2.5 ${isUs ? "bg-copper-50/60 -mx-2 px-2 rounded-lg" : ""}`}
            >
              <div className="flex items-center gap-3">
                {s.iso2 ? (
                  <img
                    src={`https://flagcdn.com/w40/${s.iso2}.png`}
                    alt=""
                    className="h-4 w-6 rounded-sm object-cover shrink-0 ring-1 ring-black/5"
                  />
                ) : (
                  <span className="h-4 w-6 rounded-sm bg-slate-100 shrink-0" />
                )}

                <span className={`text-sm shrink-0 ${isUs ? "font-black text-copper-800" : "font-medium"}`}>
                  {s.country}
                </span>

                <span className="text-xs font-tabular text-slate-600 shrink-0">
                  {usdK(s.value_usd_k)}
                </span>

                {/* نوار سهم — از راست رشد می‌کند (RTL) */}
                <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden min-w-8">
                  <span
                    className={`block h-full rounded-full ${isUs ? "bg-copper-500" : "bg-petrol-300"}`}
                    style={{ width: `${Math.max(4, ((s.value_usd_k || 0) / max) * 100)}%` }}
                  />
                </span>

                {s.growth_value_5y_pct != null && (
                  <span
                    className={`text-[11px] font-tabular font-bold shrink-0 ${
                      s.growth_value_5y_pct >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {pct(s.growth_value_5y_pct)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-400 mt-1 ps-9">
                {s.share_pct != null && <span>سهم {s.share_pct.toLocaleString("fa-IR")}٪</span>}
                {s.unit_value_usd != null && (
                  <span>
                    قیمت واحد{" "}
                    <b className="font-tabular text-slate-500">
                      {s.unit_value_usd.toLocaleString("fa-IR")}
                    </b>{" "}
                    دلار/تن
                  </span>
                )}
                {s.tariff_pct != null && (
                  <span className={s.tariff_pct === 0 ? "text-emerald-600 font-medium" : ""}>
                    تعرفه {s.tariff_pct.toLocaleString("fa-IR")}٪
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-slate-400 mt-4 leading-6">
        «رشد» ستون چپ، نرخ سالانه‌ی مرکب ارزش واردات از آن مبدأ در پنج سال گذشته است.
        {anyTariff && (
          <>
            {" "}
            «تعرفه» میانگین تعرفه‌ی گمرکی است که همین کشور واردکننده بر آن مبدأ اعمال می‌کند —
            تعرفه‌ی صفر معمولاً یعنی توافق تجاری یا عضویت مشترک در یک اتحادیه‌ی گمرکی.
          </>
        )}
      </p>
    </section>
  );
}
