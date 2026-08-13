import ReportChart from "./ReportChart";
import SectionBody from "./SectionBody";
import LivePriceBox from "./LivePriceBox";
import WorldRouteMap from "./WorldRouteMap";

export default function SummaryReportView({ report, livePrices = [], countryProfile = null }) {
  const { key_stats = [], sections = [], charts = [] } = report;

  return (
    <div className="space-y-6">
      <LivePriceBox prices={livePrices} />

      {countryProfile?.port && (
        <div className="border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">نقشه‌ی مسیر و فاصله تا بنادر مرجع</h3>
          <WorldRouteMap
            destPort={countryProfile.port}
            destCountry={countryProfile.country}
            distances={countryProfile.distances_km || {}}
          />
          {countryProfile.top_trade_partners?.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {countryProfile.top_trade_partners.map((p, i) => (
                <div key={i} className="text-xs bg-slate-50 border border-slate-200 rounded-md p-2">
                  <div className="font-semibold">{p.country}</div>
                  <div className="text-slate-500">{p.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {key_stats.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {key_stats.map((s, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <div className="text-xs text-slate-500 mb-1">{s.label}</div>
              <div className="text-lg font-bold text-sky-800 font-tabular">
                {s.value} <span className="text-sm font-normal text-slate-500">{s.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {charts.map((chart, i) => (
        <div key={i} className="border border-slate-200 rounded-lg p-4">
          <ReportChart chart={chart} />
        </div>
      ))}

      <div className="space-y-5">
        {sections.map((s, i) => (
          <div key={i}>
            {s.heading && <h3 className="text-lg font-semibold mb-2">{s.heading}</h3>}
            <SectionBody text={s.body || ""} />
          </div>
        ))}
      </div>
    </div>
  );
}
