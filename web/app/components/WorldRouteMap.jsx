// یک «نقشه‌ی مسیر» شماتیک (نه نقشه‌ی سیاسی دقیق با مرز کشورها) که بندر مقصد رو
// روی یک شبکه‌ی طول/عرض جغرافیایی واقعی (تصویر مستطیلی equirectangular) نشون
// می‌ده و خط فاصله تا هر بندر مرجع رو با فاصله‌ی واقعی (کیلومتر) برچسب می‌زنه.
// مختصات نقطه‌ها واقعی و دقیقن؛ فقط شکل قاره‌ها روی نقشه رسم نشده.

const W = 720;
const H = 360;

function project(lat, lon) {
  const x = ((lon + 180) / 360) * W;
  const y = ((90 - lat) / 180) * H;
  return [x, y];
}

const REF_COLORS = {
  "ایران": "#059669",
  "چین": "#b45309",
  "ترکیه": "#be123c",
  "هند": "#6d28d9",
  "روسیه": "#1d4ed8",
};

export default function WorldRouteMap({ destPort, destCountry, distances }) {
  if (!destPort) return null;
  const [dx, dy] = project(destPort.lat, destPort.lon);

  const refs = Object.entries(distances)
    .map(([name, km]) => {
      const coords = REF_PORT_COORDS[name];
      if (!coords) return null;
      const [x, y] = project(coords.lat, coords.lon);
      return { name, km, x, y, color: REF_COLORS[name] || "#475569" };
    })
    .filter(Boolean);

  const graticuleLines = [];
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x1] = project(0, lon);
    graticuleLines.push(<line key={`v${lon}`} x1={x1} y1={0} x2={x1} y2={H} stroke="#e2e8f0" strokeWidth="1" />);
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const [, y1] = project(lat, 0);
    graticuleLines.push(<line key={`h${lat}`} x1={0} y1={y1} x2={W} y2={y1} stroke="#e2e8f0" strokeWidth="1" />);
  }

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg border border-slate-200 bg-slate-50">
        <rect x="0" y="0" width={W} height={H} fill="#f0f9ff" />
        {graticuleLines}
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#cbd5e1" strokeWidth="1.5" />

        {refs.map((r) => (
          <g key={r.name}>
            <line x1={dx} y1={dy} x2={r.x} y2={r.y} stroke={r.color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
            <circle cx={r.x} cy={r.y} r="5" fill={r.color} />
            <text x={r.x} y={r.y - 9} textAnchor="middle" fontSize="11" fontWeight="600" fill={r.color}>
              {r.name}
            </text>
            <text
              x={(dx + r.x) / 2}
              y={(dy + r.y) / 2 - 4}
              textAnchor="middle"
              fontSize="10"
              fill="#475569"
              style={{ paintOrder: "stroke", stroke: "#f0f9ff", strokeWidth: 3 }}
            >
              {r.km.toLocaleString("fa-IR")} کیلومتر
            </text>
          </g>
        ))}

        <circle cx={dx} cy={dy} r="6" fill="#0f172a" />
        <text x={dx} y={dy - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">
          {destPort.name} ({destCountry})
        </text>
      </svg>
      <p className="text-xs text-slate-400 mt-1">
        نقشه‌ی شماتیک مسیر بر پایه‌ی مختصات واقعی بنادر است (نه نقشه‌ی سیاسی دقیق)؛ فاصله‌ها خط‌مستقیم هوایی هستن، نه لزوماً مسیر واقعی کشتی‌رانی.
      </p>
    </div>
  );
}

// مختصات بنادر مرجع (باید با scripts/geo_data.py هم‌خوان بمونه)
const REF_PORT_COORDS = {
  "ایران": { lat: 27.1142, lon: 56.0614 },
  "چین": { lat: 31.2304, lon: 121.4737 },
  "ترکیه": { lat: 36.8, lon: 34.6333 },
  "هند": { lat: 18.949, lon: 72.9525 },
  "روسیه": { lat: 44.7239, lon: 37.7683 },
};
