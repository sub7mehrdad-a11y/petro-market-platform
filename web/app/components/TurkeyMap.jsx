import { TURKEY_VIEWBOX, TURKEY_PATHS, projectTurkey } from "@/lib/turkeyGeo";
import { CHINA_VIEWBOX, CHINA_PATHS, projectChina } from "@/lib/chinaGeo";
import { RUSSIA_VIEWBOX, RUSSIA_PATH, projectRussia } from "@/lib/russiaGeo";
import { GENERIC_VIEWBOX, computeAutoBounds, projectGeneric } from "@/lib/genericGeo";

// کشورهایی که مرز واقعی از‌قبل‌ترسیم‌شده دارن (نه fallback عمومی). برای اضافه
// کردن کشور بعدی: مثل web/lib/chinaGeo.js یک فایل geo جدید بساز و اینجا اضافه‌ش کن.
// روسیه چون تا خط تاریخ (۱۸۰ درجه) کشیده می‌شه، به‌جای یک چندضلعیِ بسته‌ی
// کامل، فقط مرز غربی/جنوبی (همون بخشی که همه‌ی نشانگرها توش هستن) به‌صورت یک
// خط باز (strokeOnly، بدون پرکردن داخلش) رسم می‌شه.
const REAL_BORDER_GEO = {
  turkey: { viewBox: TURKEY_VIEWBOX, paths: TURKEY_PATHS, project: projectTurkey },
  china: { viewBox: CHINA_VIEWBOX, paths: CHINA_PATHS, project: projectChina },
  russia: { viewBox: RUSSIA_VIEWBOX, paths: [RUSSIA_PATH], project: projectRussia, strokeOnly: true },
};

const LAYERS = [
  { key: "facilities", label: "کارخانه‌ها", color: "#C9762E", shape: "square" },
  { key: "ports", label: "بنادر خروجی", color: "#0B7285", shape: "circle" },
  { key: "borders", label: "گذرگاه‌های مرزی", color: "#9C2B2B", shape: "triangle" },
];

function Marker({ x, y, color, shape, emphasized }) {
  const r = emphasized ? 7 : 5.5;
  if (shape === "square") {
    return (
      <rect
        x={x - r} y={y - r} width={r * 2} height={r * 2} rx="1.5"
        fill={color} stroke="#fff" strokeWidth="1.5"
      />
    );
  }
  if (shape === "triangle") {
    return (
      <polygon
        points={`${x},${y - r - 1} ${x + r},${y + r - 1} ${x - r},${y + r - 1}`}
        fill={color} stroke="#fff" strokeWidth="1.5"
      />
    );
  }
  return <circle cx={x} cy={y} r={r} fill={color} stroke="#fff" strokeWidth="1.5" />;
}

export default function TurkeyMap({ map, countryId }) {
  if (!map) return null;

  // مرز SVG واقعی فقط برای کشورهای فهرست‌شده در REAL_BORDER_GEO از قبل ترسیم
  // شده. برای بقیه (مثل روسیه) به‌جای پروجکشن با محدوده‌ی ثابت ترکیه (که نقطه‌ها
  // رو کاملاً بیرون از viewBox می‌انداخت و نقشه خالی به نظر می‌رسید)، محدوده رو
  // خودکار از روی خودِ نقطه‌ها می‌سازیم و به‌جای مرز واقعی، یک زمینه‌ی ساده رسم می‌کنیم.
  const geo = REAL_BORDER_GEO[countryId] || null;
  const allRawPoints = LAYERS.flatMap((layer) => map[layer.key] || []);
  const bounds = !geo ? computeAutoBounds(allRawPoints) : null;
  const viewBox = geo ? geo.viewBox : GENERIC_VIEWBOX;

  const points = LAYERS.flatMap((layer) =>
    (map[layer.key] || []).map((item) => {
      const [x, y] = geo ? geo.project(item.lat, item.lon) : projectGeneric(item.lat, item.lon, bounds);
      return { ...item, x, y, color: layer.color, shape: layer.shape, layerKey: layer.key };
    })
  );

  const [, , vbWidth, vbHeight] = viewBox.split(" ").map(Number);

  return (
    <div>
      <div className="rounded-xl border border-petrol-100 bg-petrol-50/60 overflow-hidden">
        <svg viewBox={viewBox} className="w-full h-auto" role="img"
             aria-label="نقشه‌ی شماتیک با موقعیت کارخانه‌های جوش شیرین، بنادر خروجی و گذرگاه‌های مرزی صادراتی">
          {/* زمینه‌ی «دریا/بوم» همیشه اول رسم می‌شه — قبلاً برای کشورهای بدون
              مرز واقعی، یک مستطیل تمام‌قدِ سفید همین نقش رو داشت و چون رنگش
              با پس‌زمینه‌ی صفحه یکی بود، عملاً نامرئی می‌شد (اصل گزارش‌شده‌ی
              «نقشه نمایش داده نمی‌شه»). یک رنگ روشن مشخص (#EAF4F4) این مشکل
              رو حل می‌کنه، هم برای fallback عمومی هم زیر مرزهای واقعی/نیمه‌واقعی. */}
          <rect x="0" y="0" width={vbWidth} height={vbHeight} fill="#EAF4F4" stroke="#7FA3A9"
                strokeWidth="2" rx="12" />

          {geo &&
            geo.paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={geo.strokeOnly ? "none" : "#ffffff"}
                stroke="#7FA3A9"
                strokeWidth={geo.strokeOnly ? 2.5 : 1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

          {points.map((p, i) => (
            <g key={i}>
              <Marker x={p.x} y={p.y} color={p.color} shape={p.shape} emphasized={p.key} />
              <text
                x={p.x}
                y={p.y - 11}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill="#0B2027"
                style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3.5 }}
              >
                {p.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-xs">
        {LAYERS.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0"
              style={{
                background: l.color,
                borderRadius: l.shape === "circle" ? "999px" : l.shape === "square" ? "2px" : "0",
                clipPath: l.shape === "triangle" ? "polygon(50% 0, 100% 100%, 0 100%)" : undefined,
              }}
            />
            <span className="text-slate-600">{l.label}</span>
          </span>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mt-4">
        {LAYERS.map((layer) => (
          <div key={layer.key} className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs font-bold mb-2" style={{ color: layer.color }}>
              {layer.label}
            </div>
            <ul className="space-y-1.5">
              {(map[layer.key] || []).map((item, i) => (
                <li key={i} className="text-xs leading-5">
                  <span className={`font-semibold ${item.key ? "text-copper-800" : "text-slate-800"}`}>
                    {item.name}
                  </span>
                  <span className="block text-slate-500">{item.sub}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-400 mt-2">
        {geo
          ? "مرز کشور از یک GeoJSON عمومی ساده‌شده رسم شده و موقعیت هر نشانگر بر پایه‌ی مختصات جغرافیایی واقعی آن است؛ محل دقیق کارخانه‌ها در سطح شهرستان تقریبی است، نه پلاک صنعتی."
          : "این نقشه مرز واقعی کشور رو نداره — فقط موقعیت نسبی نشانگرها نسبت به هم، بر پایه‌ی مختصات جغرافیایی واقعی‌شونه؛ محل دقیق کارخانه‌ها در سطح شهر تقریبی است، نه پلاک صنعتی."}
      </p>
    </div>
  );
}
