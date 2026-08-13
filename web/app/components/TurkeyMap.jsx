import { TURKEY_VIEWBOX, TURKEY_PATHS, projectTurkey } from "@/lib/turkeyGeo";

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

export default function TurkeyMap({ map }) {
  if (!map) return null;

  const points = LAYERS.flatMap((layer) =>
    (map[layer.key] || []).map((item) => {
      const [x, y] = projectTurkey(item.lat, item.lon);
      return { ...item, x, y, color: layer.color, shape: layer.shape, layerKey: layer.key };
    })
  );

  return (
    <div>
      <div className="rounded-xl border border-petrol-100 bg-petrol-50/60 overflow-hidden">
        <svg viewBox={TURKEY_VIEWBOX} className="w-full h-auto" role="img"
             aria-label="نقشه‌ی شماتیک ترکیه با موقعیت کارخانه‌های جوش شیرین، بنادر خروجی و گذرگاه‌های مرزی صادراتی">
          {TURKEY_PATHS.map((d, i) => (
            <path key={i} d={d} fill="#ffffff" stroke="#7FA3A9" strokeWidth="1.5"
                  strokeLinejoin="round" />
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
        مرز ترکیه از یک GeoJSON عمومی ساده‌شده رسم شده و موقعیت هر نشانگر بر پایه‌ی مختصات جغرافیایی
        واقعی آن است؛ محل دقیق کارخانه‌ها در سطح شهرستان تقریبی است، نه پلاک صنعتی.
      </p>
    </div>
  );
}
