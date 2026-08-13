// نقشه‌ی واقعی گوگل‌مپ (embed بدون نیاز به API key) روی مختصات واقعی بندر مقصد،
// به‌همراه فاصله‌ی واقعی (haversine) تا بنادر مرجع به‌صورت کارت‌های کنارش.
const REF_COLORS = {
  "ایران": "#059669",
  "چین": "#b45309",
  "ترکیه": "#be123c",
  "هند": "#6d28d9",
  "روسیه": "#1d4ed8",
};

export default function WorldRouteMap({ destPort, destCountry, distances }) {
  if (!destPort) return null;

  const mapSrc = `https://maps.google.com/maps?q=${destPort.lat},${destPort.lon}&z=6&output=embed`;
  const refs = Object.entries(distances || {});

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_220px]">
      <div className="rounded-lg overflow-hidden border border-slate-200">
        <iframe
          src={mapSrc}
          title={`نقشه‌ی ${destPort.name} (${destCountry})`}
          className="w-full h-72 md:h-80"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
          بندر ورودی: <span className="font-semibold">{destPort.name}</span> ({destCountry})
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs text-slate-500 font-medium">فاصله‌ی هوایی تا بنادر مرجع</div>
        {refs.map(([name, km]) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
            style={{ borderInlineStartWidth: 3, borderInlineStartColor: REF_COLORS[name] || "#475569" }}
          >
            <span className="font-medium">{name}</span>
            <span className="text-slate-600 font-tabular">{km.toLocaleString("fa-IR")} کیلومتر</span>
          </div>
        ))}
        <p className="text-[11px] text-slate-400 mt-1">
          فاصله‌ها خط‌مستقیم هوایی‌ان (نه لزوماً مسیر واقعی کشتی‌رانی)، برای مقایسه‌ی نسبی بین مبادی تأمین.
        </p>
      </div>
    </div>
  );
}
