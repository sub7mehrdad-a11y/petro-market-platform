// نقشه‌ی واقعی گوگل‌مپ (embed بدون نیاز به API key) روی مختصات واقعی بندر مقصد،
// به‌همراه فاصله‌ی واقعی (haversine) تا بنادر مرجع به‌صورت کارت‌های کنارش.
const REF_COLORS = {
  "ایران": "#193D5B",
  "چین": "#A64270",
  "ترکیه": "#7757A2",
  "هند": "#6E7131",
  "روسیه": "#286F94",
};

export default function WorldRouteMap({ destPort, destCountry, distances }) {
  if (!destPort) return null;

  const mapSrc = `https://maps.google.com/maps?q=${destPort.lat},${destPort.lon}&z=6&output=embed`;
  const refs = Object.entries(distances || {});

  // کشورهای محصور در خشکی (مثل ارمنستان) بندر ندارن؛ نقطه‌ی مرجعشون گمرک/شهر
  // ورودی زمینیه و فاصله‌ی هوایی تا بنادر هم براشون محاسبه نمی‌شه (عدد گمراه‌کننده
  // می‌داد، چون مسیر واقعی جاده‌ایه). پس ستون کنار نقشه اصلاً نمایش داده نمی‌شه.
  const isLand = destPort.kind === "land";

  return (
    <div className={refs.length > 0 ? "grid gap-3 md:grid-cols-[1fr_220px]" : "grid gap-3"}>
      <div className="rounded-lg overflow-hidden border border-border">
        <iframe
          src={mapSrc}
          title={`نقشه‌ی ${destPort.name} (${destCountry})`}
          className="w-full h-72 md:h-80"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="bg-canvas border-t border-border px-3 py-2 text-xs text-text">
          {isLand ? "نقطه‌ی ورود زمینی" : "بندر ورودی"}:{" "}
          <span className="font-semibold">{destPort.name}</span> ({destCountry})
          {isLand && (
            <span className="text-text-muted">
              {" "}
              — کشور محصور در خشکی؛ فاصله‌ی هوایی تا بنادر مرجع برای این بازار معنا ندارد.
            </span>
          )}
        </div>
      </div>

      {refs.length > 0 && (
      <div className="flex flex-col gap-2">
        <div className="text-xs text-text-muted font-medium">فاصله‌ی هوایی تا بنادر مرجع</div>
        {refs.map(([name, km]) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            style={{ borderInlineStartWidth: 3, borderInlineStartColor: REF_COLORS[name] || "#536779" }}
          >
            <span className="font-medium">{name}</span>
            <span className="text-text">{km.toLocaleString("fa-IR")} کیلومتر</span>
          </div>
        ))}
        <p className="text-[11px] text-text-muted mt-1">
          فاصله‌ها خط‌مستقیم هوایی‌ان (نه لزوماً مسیر واقعی کشتی‌رانی)، برای مقایسه‌ی نسبی بین مبادی تأمین.
        </p>
      </div>
      )}
    </div>
  );
}
