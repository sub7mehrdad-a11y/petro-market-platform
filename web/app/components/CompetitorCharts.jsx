"use client";

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, LabelList,
} from "recharts";

const COPPER = "#C9762E";
const COPPER_LIGHT = "#EAA659";
const PETROL = "#123742";
const PETROL_LIGHT = "#4C7B83";

/**
 * رنگ روش تولید — در همه‌ی نمودارهای این صفحه یکسان است.
 *
 * چرا این ثابت وجود دارد: قبلاً نمودار ظرفیت، «استخراج محلول» را مسی نشان می‌داد
 * ولی نمودار هزینه همان روش را قرمز می‌کشید. نتیجه دو ایراد بود:
 *   ۱. یک دسته‌ی واحد، در دو نمودار کنار هم، دو رنگ متفاوت داشت.
 *   ۲. قرمز در عرف نمودار یعنی «خطر/بد»، در حالی که استخراج محلول ارزان‌ترین
 *      روش و نقطه‌ی قوت رقیب است — یعنی رنگ، پیام را وارونه می‌رساند.
 * حالا رنگ فقط «روش تولید» را کد می‌کند و قضاوت در متن زیر نمودار می‌آید.
 */
const METHOD_COLOR = {
  solution: COPPER, // استخراج محلول ترونای طبیعی — اتی سودا و کازان سودا
  synthetic: PETROL_LIGHT, // فرآیند سنتتیک سُلوِه — سودا سانایی (شیشه‌جام)
};

const axisProps = { fontSize: 12, tick: { fill: "#5B7B82" } };

function ChartFrame({ title, note, children, height = 300 }) {
  return (
    <div className="card p-4">
      <h4 className="text-sm font-bold text-petrol-900 mb-1">{title}</h4>
      {note && <p className="text-xs text-slate-500 mb-3">{note}</p>}
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** ۱۰ مقصد اصلی صادرات — حجم (تن) */
export function ExportDestinationsChart({ destinations }) {
  const data = destinations.map((d) => ({
    country: d.country,
    volume: d.volume_t,
    value: d.value_musd,
  }));

  return (
    <ChartFrame
      title="۱۰ مقصد اصلی صادرات جوش شیرین ترکیه (۲۰۲۴)"
      note="حجم بر حسب تن — اروپای غربی مقصد غالب است، نه بازارهای هدف ما. این نمودار عمداً ۲۰۲۴ مانده: تفکیک مقصدبه‌مقصد در فایل ITC (که فقط سرجمع جهانی هر کشور را دارد) نیست و از گزارش تحلیلی ترکیه می‌آید؛ آمار کلان بالای صفحه ۲۰۲۵ است."
      height={340}
    >
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis dataKey="country" {...axisProps} interval={0} angle={-35} textAnchor="end" height={62} />
        <YAxis {...axisProps} tickFormatter={(v) => (v / 1000).toLocaleString("fa-IR") + "K"} />
        <Tooltip
          formatter={(v, n) => (n === "volume" ? [`${v.toLocaleString("fa-IR")} تن`, "حجم"] : v)}
          contentStyle={{ fontSize: 12, direction: "rtl" }}
        />
        <Bar dataKey="volume" fill={COPPER} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

/** روند قیمت FOB */
export function FobTrendChart({ trend }) {
  const data = trend.map((t) => ({ period: t.period, price: t.mid }));

  return (
    <ChartFrame
      title="روند قیمت FOB صادراتی ترکیه"
      note="نقطه‌ی میانی هر بازه (گرید غذایی، دلار بر تن) — خط چین: قیمت پایه‌ی مرجع ما"
      height={300}
    >
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
        <XAxis dataKey="period" {...axisProps} interval={0} angle={-20} textAnchor="end" height={70} />
        <YAxis {...axisProps} domain={[200, 380]} />
        <Tooltip formatter={(v) => [`${v} دلار/تن`, "قیمت FOB"]} contentStyle={{ fontSize: 12, direction: "rtl" }} />
        <Line type="monotone" dataKey="price" stroke={COPPER} strokeWidth={2.5} dot={{ r: 4, fill: COPPER }} />
      </LineChart>
    </ChartFrame>
  );
}

/** مقایسه‌ی هزینه‌ی تولید: استخراج محلول در برابر سنتتیک */
export function CostComparisonChart() {
  // ستونی (نه نواری افقی): در چیدمان راست‌به‌چپ، برچسب‌های بلندِ محور عمودی روی
  // خود میله‌ها می‌افتادند و بریده می‌شدند. ستونی، هم‌شکل نمودار ظرفیت کناری است.
  const data = [
    { label: "استخراج محلول ترونا", sub: "اتی سودا + کازان سودا", cost: 83.2, kind: "solution" },
    { label: "سنتتیک سُلوِه — کف", sub: "سودا سانایی (شیشه‌جام)", cost: 150, kind: "synthetic" },
    { label: "سنتتیک سُلوِه — سقف", sub: "سودا سانایی (شیشه‌جام)", cost: 190, kind: "synthetic" },
  ];

  return (
    <ChartFrame
      title="شکاف ساختاری هزینه‌ی تولید در ترکیه"
      note="دلار بر تن — استخراج محلول (اتی سودا و کازان سودا) حدود نصف تا کمتر از نصفِ روش سنتتیک سُلوِه (شیشه‌جام) تمام می‌شود. عدد ۸۳.۲ از گزارش مالی رسمی WE Soda (۲۰۲۴)؛ ارقام سنتتیک برآورد صنعتی غیررسمی است."
      height={260}
    >
      <BarChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval={0} height={46} />
        <YAxis {...axisProps} domain={[0, 220]} />
        <Tooltip
          formatter={(v) => [`${v} دلار/تن`, "هزینه‌ی تولید"]}
          labelFormatter={(l) => {
            const row = data.find((d) => d.label === l);
            return row ? `${l} — ${row.sub}` : l;
          }}
          contentStyle={{ fontSize: 12, direction: "rtl" }}
        />
        <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={METHOD_COLOR[d.kind]} />
          ))}
          <LabelList dataKey="cost" position="top" style={{ fontSize: 11, fill: "#334155" }} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** ظرفیت جوش شیرین تولیدکنندگان */
export function CapacityChart({ producers }) {
  const data = producers
    .filter((p) => p.bicarb_capacity_num)
    .map((p) => ({
      name: p.name,
      capacity: p.bicarb_capacity_num,
      kind: p.tech_type,
    }));

  return (
    <ChartFrame
      title="ظرفیت تولید جوش شیرین به تفکیک تولیدکننده"
      note="تن در سال — رنگ مسی: استخراج محلول ترونای طبیعی (اتی سودا و کازان سودا؛ روش کم‌هزینه‌تر) · رنگ نفتی: فرآیند سنتتیک سُلوِه (سودا سانایی/شیشه‌جام؛ پرهزینه‌تر)"
      height={250}
    >
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval={0} height={50} />
        <YAxis {...axisProps} tickFormatter={(v) => (v / 1000).toLocaleString("fa-IR") + "K"} />
        <Tooltip formatter={(v) => [`${v.toLocaleString("fa-IR")} تن/سال`, "ظرفیت"]} contentStyle={{ fontSize: 12, direction: "rtl" }} />
        <Bar dataKey="capacity" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={METHOD_COLOR[d.kind] || PETROL_LIGHT} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** شدت انتشار کربن */
export function CarbonChart({ carbon }) {
  const data = carbon.rows.map((r) => ({ label: r.label, value: r.value }));

  return (
    <ChartFrame title="شدت انتشار کربن" note={carbon.note} height={230}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval={0} height={40} />
        <YAxis {...axisProps} />
        <Tooltip formatter={(v) => [`${v} تن CO₂e`, "شدت انتشار"]} contentStyle={{ fontSize: 12, direction: "rtl" }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.label.includes("اروپا") ? PETROL_LIGHT : COPPER} />
          ))}
          <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: "#334155" }} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** کرایه‌ی حمل زمینی به عراق */
export function FreightChart({ freight }) {
  const data = freight.rows
    .filter((r) => !r.origin.includes("خرده‌بار"))
    .map((r) => ({ route: `${r.origin} ← ${r.dest}`, cost: r.per_ton_mid }));

  return (
    <ChartFrame
      title="کرایه‌ی حمل زمینی ترکیه به عراق"
      note="دلار بر تن (نقطه‌ی میانی بازه، کامیون دربست ~۲۲ تن)"
      height={260}
    >
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
        <XAxis type="number" {...axisProps} />
        <YAxis type="category" dataKey="route" {...axisProps} width={185} />
        <Tooltip formatter={(v) => [`${v} دلار/تن`, "کرایه"]} contentStyle={{ fontSize: 12, direction: "rtl" }} />
        <Bar dataKey="cost" fill={COPPER_LIGHT} radius={[0, 4, 4, 0]}>
          <LabelList dataKey="cost" position="right" style={{ fontSize: 11, fill: "#334155" }} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}
