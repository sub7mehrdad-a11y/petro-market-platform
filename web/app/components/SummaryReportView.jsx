import ReportChart from "./ReportChart";
import SectionBody from "./SectionBody";

export default function SummaryReportView({ report }) {
  const { key_stats = [], sections = [], charts = [] } = report;

  return (
    <div className="space-y-6">
      {key_stats.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {key_stats.map((s, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <div className="text-xs text-slate-500 mb-1">{s.label}</div>
              <div className="text-lg font-bold text-emerald-800">
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
