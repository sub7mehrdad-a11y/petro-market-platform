// خروجی‌های گزارش عملکرد ایمیل معرفی: فایل اکسل (برای تیم بازرگانی) و صفحه‌ی HTML مستقل با
// جدول و نمودار (برای ارائه به هیئت‌مدیره). هر دو از همان شیء گزارشی ساخته می‌شن که
// buildOutreachReport (web/lib/outreachReport.js) برمی‌گردونه.
//
// نسخه‌ی هیئت‌مدیره عمداً آدرس ایمیل نداره (فقط نام شرکت/کشور/گرید)؛ اکسل تیم آدرس‌ها رو داره.

import ExcelJS from "exceljs";

const GRADE_FA = { food: "خوراکی", feed: "دامی (فید)", industrial: "صنعتی", unclear: "نامشخص/چندگانه", unknown: "نامشخص (کمپین قبلی)" };
const STATUS_FA = {
  delivered: "تحویل تأییدشده",
  relayed: "به سرور مقصد سپرده شد",
  delayed: "در تأخیر",
  failed: "برگشتی (ناموفق)",
  none: "بدون پیام وضعیت",
};

const gradeFa = (g) => GRADE_FA[g] || g;
const periodFa = (r) => (r.window_days ? `${r.window_days.toLocaleString("fa-IR")} روز اخیر` : "کل زمان");
const dateFa = (iso) => (iso ? new Date(iso).toLocaleDateString("fa-IR") : "—");

export function reportFileName(report, ext) {
  const day = new Date(report.generated_at).toISOString().slice(0, 10);
  return `outreach-report-${report.window_days ? `${report.window_days}d` : "all"}-${day}.${ext}`;
}

export async function buildReportXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "پلتفرم تحقیق و توسعه — پارس جوش شیرین";
  wb.created = new Date(report.generated_at);

  const headerStyle = (row) => {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123742" } };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.height = 24;
  };
  const sheet = (name) => wb.addWorksheet(name, { views: [{ rightToLeft: true }] });

  // ۱) خلاصه
  const s1 = sheet("خلاصه");
  s1.columns = [{ width: 38 }, { width: 22 }];
  s1.addRow(["گزارش عملکرد ایمیل معرفی — پارس جوش شیرین"]).font = { bold: true, size: 14 };
  s1.addRow(["بازه", periodFa(report)]);
  s1.addRow(["تاریخ تهیه", dateFa(report.generated_at)]);
  s1.addRow([]);
  const t = report.totals;
  headerStyle(s1.addRow(["شاخص", "مقدار"]));
  for (const [label, v] of [
    ["ایمیل ارسال‌شده", t.sent],
    ["تحویل تأییدشده (پیام Delivered سرور)", t.confirmed_delivered],
    ["به سرور مقصد سپرده‌شده (Relayed)", t.relayed],
    ["در تأخیر", t.delayed],
    ["برگشتی قطعی", t.failed],
    ["تحویل‌شده (برآورد = ارسال − برگشتی)", t.delivered_est],
    ["پاسخ واقعی", t.replied],
    ["پاسخ خودکار (Out of Office)", t.auto_replied],
  ]) s1.addRow([label, v]);
  s1.addRow(["نرخ برگشتی", t.bounce_rate_pct == null ? "—" : `${t.bounce_rate_pct}٪`]);
  s1.addRow(["نرخ پاسخ (از تحویل‌شده‌ی برآوردی)", t.reply_rate_pct == null ? "—" : `${t.reply_rate_pct}٪`]);
  s1.addRow([]);
  for (const n of report.notes) s1.addRow([n]).font = { italic: true, color: { argb: "FF7C8A90" } };

  // ۲) به تفکیک گرید
  const s2 = sheet("به تفکیک گرید");
  s2.columns = [
    { header: "گرید", width: 22 }, { header: "ارسال", width: 10 }, { header: "تحویل تأییدشده", width: 16 },
    { header: "برگشتی", width: 10 }, { header: "در تأخیر", width: 10 }, { header: "پاسخ", width: 10 },
    { header: "پاسخ خودکار", width: 14 }, { header: "نرخ پاسخ ٪", width: 12 }, { header: "نرخ برگشتی ٪", width: 14 },
  ];
  headerStyle(s2.getRow(1));
  for (const [g, v] of Object.entries(report.by_grade)) {
    s2.addRow([gradeFa(g), v.sent, v.confirmed_delivered, v.failed, v.delayed, v.replied, v.auto_replied, v.reply_rate_pct, v.bounce_rate_pct]);
  }
  s2.addRow(["جمع", t.sent, t.confirmed_delivered, t.failed, t.delayed, t.replied, t.auto_replied, t.reply_rate_pct, t.bounce_rate_pct]).font = { bold: true };

  // ۳) پاسخ‌دهندگان
  const s3 = sheet("پاسخ‌دهندگان");
  s3.columns = [{ header: "شرکت", width: 40 }, { header: "کشور", width: 16 }, { header: "گرید", width: 18 }, { header: "تاریخ پاسخ", width: 16 }];
  headerStyle(s3.getRow(1));
  for (const c of report.replied_companies) s3.addRow([c.name || "—", c.country || "—", gradeFa(c.grade), dateFa(c.date)]);

  // ۴) ارسال‌ها (تفصیلی)
  const s4 = sheet("ارسال‌ها");
  s4.columns = [
    { header: "شرکت", width: 40 }, { header: "کشور", width: 16 }, { header: "ایمیل", width: 32 }, { header: "گرید", width: 18 },
    { header: "تاریخ ارسال", width: 16 }, { header: "وضعیت تحویل", width: 24 }, { header: "پاسخ داده؟", width: 12 },
  ];
  headerStyle(s4.getRow(1));
  for (const r of report.rows || []) {
    s4.addRow([r.name || "—", r.country || "—", r.email, gradeFa(r.grade), dateFa(r.sent_at), STATUS_FA[r.status] || r.status, r.replied ? "بله" : r.auto_replied ? "پاسخ خودکار" : "خیر"]);
  }
  s4.autoFilter = { from: "A1", to: "G1" };
  s4.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function weeklySeries(rows) {
  const buckets = new Map();
  for (const r of rows || []) {
    const d = new Date(r.sent_at);
    if (Number.isNaN(d.getTime())) continue;
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()].sort().map(([k, v]) => ({ label: `هفته‌ی ${dateFa(k)}`, value: v }));
}

export function buildReportHtml(report) {
  const t = report.totals;
  const grades = Object.entries(report.by_grade);
  const weekly = weeklySeries(report.rows);
  const fa = (n) => (n == null ? "—" : Number(n).toLocaleString("fa-IR"));
  const pct = (n) => (n == null ? "—" : `${Number(n).toLocaleString("fa-IR")}٪`);
  const chartData = {
    grades: grades.map(([g, v]) => ({ label: gradeFa(g), sent: v.sent, delivered: v.confirmed_delivered, replied: v.replied })),
    outcome: [t.failed, t.confirmed_delivered, t.relayed, t.delayed, Math.max(t.sent - t.failed - t.confirmed_delivered - t.relayed - t.delayed, 0)],
    weekly,
  };

  const gradeRows = grades.map(([g, v]) => `<tr><td>${esc(gradeFa(g))}</td><td class="num-cell">${fa(v.sent)}</td><td class="num-cell">${fa(v.confirmed_delivered)}</td><td class="num-cell">${fa(v.failed)}</td><td class="num-cell">${fa(v.delayed)}</td><td class="num-cell">${fa(v.replied)}</td><td class="num-cell">${pct(v.reply_rate_pct)}</td></tr>`).join("");
  const repliedRows = report.replied_companies.length
    ? report.replied_companies.map((c) => `<tr><td>${esc(c.name || "—")}</td><td>${esc(c.country || "—")}</td><td>${esc(gradeFa(c.grade))}</td><td>${dateFa(c.date)}</td></tr>`).join("")
    : `<tr><td colspan="4">در این بازه هنوز پاسخ واقعی ثبت نشده.</td></tr>`;
  const warn = t.bounce_rate_pct != null && t.bounce_rate_pct > 5
    ? `<div class="callout bad"><p><strong>هشدار:</strong> نرخ برگشتی ${pct(t.bounce_rate_pct)} است (بیش از ۵٪). پاک‌سازی/تأیید لیست ایمیل‌ها پیش از ادامه‌ی ارسال توصیه می‌شود تا اعتبار دامنه‌ی ارسال نسوزد.</p></div>`
    : "";
  const n3 = weekly.length > 1 ? "۴" : "۳";

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>گزارش عملکرد ایمیل معرفی — پارس جوش شیرین</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800;900&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
<style>${REPORT_CSS}
  @media print { .hero{ -webkit-print-color-adjust: exact; print-color-adjust: exact; } section{ break-inside: avoid; } }
</style>
</head>
<body>
<div class="hero"><div class="wrap">
  <span class="eyebrow">گزارش بازاریابی صادراتی &middot; ایمیل معرفی</span>
  <h1>گزارش عملکرد ایمیل معرفی پارس جوش شیرین</h1>
  <p class="lead">چندتا ایمیل ارسال شد، برای کدام گرید، چندتا به مقصد رسید و چندتا شرکت پاسخ دادند.</p>
  <div class="meta"><span>بازه: ${esc(periodFa(report))}</span><span>تاریخ تهیه: ${dateFa(report.generated_at)}</span></div>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${fa(t.sent)}</div><div class="l">ایمیل ارسال‌شده</div></div>
    <div class="kpi"><div class="v">${fa(t.delivered_est)}</div><div class="l">تحویل‌شده (برآورد: ارسال منهای برگشتی)</div></div>
    <div class="kpi"><div class="v">${fa(t.replied)}</div><div class="l">شرکت پاسخ‌دهنده (نرخ ${pct(t.reply_rate_pct)})</div></div>
    <div class="kpi"><div class="v">${pct(t.bounce_rate_pct)}</div><div class="l">نرخ برگشتی قطعی</div></div>
  </div>
</div></div>

<main class="wrap">
  ${warn}
  <section>
    <div class="sec-head"><span class="sec-num">۱</span><h2>ارسال، تحویل و پاسخ به تفکیک گرید</h2></div>
    <div class="chart-box"><div class="chart-h" style="height:300px"><canvas id="chGrade"></canvas></div><div class="cap">ارسال‌شده، تحویل تأییدشده (پیام Delivered سرور ایمیل) و پاسخ‌دهنده، به تفکیک گرید محصول</div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>گرید</th><th>ارسال</th><th>تحویل تأییدشده</th><th>برگشتی</th><th>در تأخیر</th><th>پاسخ</th><th>نرخ پاسخ</th></tr></thead>
      <tbody>${gradeRows}<tr class="hl"><td>جمع</td><td class="num-cell">${fa(t.sent)}</td><td class="num-cell">${fa(t.confirmed_delivered)}</td><td class="num-cell">${fa(t.failed)}</td><td class="num-cell">${fa(t.delayed)}</td><td class="num-cell">${fa(t.replied)}</td><td class="num-cell">${pct(t.reply_rate_pct)}</td></tr></tbody>
    </table></div>
  </section>

  <section>
    <div class="sec-head"><span class="sec-num">۲</span><h2>وضعیت تحویل ایمیل‌ها</h2></div>
    <div class="chart-box"><div class="chart-h" style="height:280px"><canvas id="chOutcome"></canvas></div><div class="cap">توزیع وضعیت تحویل ایمیل‌های ارسال‌شده در این بازه</div></div>
  </section>

  ${weekly.length > 1 ? `<section>
    <div class="sec-head"><span class="sec-num">۳</span><h2>روند ارسال هفتگی</h2></div>
    <div class="chart-box"><div class="chart-h" style="height:260px"><canvas id="chWeekly"></canvas></div><div class="cap">تعداد ایمیل ارسال‌شده در هر هفته</div></div>
  </section>` : ""}

  <section>
    <div class="sec-head"><span class="sec-num">${n3}</span><h2>شرکت‌های پاسخ‌دهنده</h2></div>
    <div class="table-wrap"><table><thead><tr><th>شرکت</th><th>کشور</th><th>گرید</th><th>تاریخ پاسخ</th></tr></thead><tbody>${repliedRows}</tbody></table></div>
  </section>

  <section>
    <div class="callout"><p><strong>نحوه‌ی محاسبه:</strong></p><ul>${report.notes.map((n) => `<li>${esc(n)}</li>`).join("")}<li>پاسخ‌های خودکار (Out of Office) در شمار «پاسخ» نیامده‌اند.</li></ul></div>
  </section>
</main>
<footer class="wrap"><p>گزارش خودکار پلتفرم تحقیق و توسعه — ${dateFa(report.generated_at)}. برای PDF از «چاپ» مرورگر استفاده کنید.</p></footer>

<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script>
(function(){
  var D = ${JSON.stringify(chartData)};
  var FA = "۰۱۲۳۴۵۶۷۸۹";
  function fa(n){ return String(n).replace(/[0-9]/g, function(d){ return FA[+d]; }); }
  function css(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  var charts = [];
  function build(){
    charts.forEach(function(c){ c.destroy(); }); charts = [];
    Chart.defaults.font.family = "Vazirmatn, Tahoma, sans-serif"; Chart.defaults.color = css('--ink-soft'); Chart.defaults.borderColor = css('--line-soft');
    var petrol = css('--petrol-500'), copper = css('--copper-500'), good = css('--good'), bad = css('--bad'), light = css('--petrol-300'), bg = css('--bg-soft');
    var tip = { rtl: true, textDirection: 'rtl' };
    charts.push(new Chart(document.getElementById('chGrade'), { type: 'bar',
      data: { labels: D.grades.map(function(g){ return g.label; }), datasets: [
        { label: 'ارسال‌شده', data: D.grades.map(function(g){ return g.sent; }), backgroundColor: petrol, borderRadius: 5 },
        { label: 'تحویل تأییدشده', data: D.grades.map(function(g){ return g.delivered; }), backgroundColor: good, borderRadius: 5 },
        { label: 'پاسخ‌دهنده', data: D.grades.map(function(g){ return g.replied; }), backgroundColor: copper, borderRadius: 5 } ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: Object.assign({}, tip, { callbacks: { label: function(c){ return c.dataset.label + ': ' + fa(c.raw); } } }) },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: function(v){ return fa(v); } } } } } }));
    charts.push(new Chart(document.getElementById('chOutcome'), { type: 'doughnut',
      data: { labels: ['برگشتی قطعی', 'تحویل تأییدشده', 'به سرور مقصد سپرده شد', 'در تأخیر', 'بدون پیام وضعیت'], datasets: [{ data: D.outcome, backgroundColor: [bad, good, petrol, copper, light], borderColor: bg, borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom' }, tooltip: Object.assign({}, tip, { callbacks: { label: function(c){ return c.label + ': ' + fa(c.raw); } } }) } } }));
    var wk = document.getElementById('chWeekly');
    if (wk) charts.push(new Chart(wk, { type: 'bar',
      data: { labels: D.weekly.map(function(w){ return w.label; }), datasets: [{ data: D.weekly.map(function(w){ return w.value; }), backgroundColor: petrol, borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: Object.assign({}, tip, { callbacks: { label: function(c){ return fa(c.raw) + ' ایمیل'; } } }) },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: function(v){ return fa(v); } } } } } }));
  }
  build();
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', build);
})();
</script>
</body>
</html>`;
}

const REPORT_CSS = `
  :root{
    color-scheme: light;
    --bg: #F7F3EC;
    --bg-soft: #FFFFFF;
    --ink: #16232A;
    --ink-soft: #4B5A61;
    --muted: #7C8A90;
    --line: #E4DDD0;
    --line-soft: #EDE7DA;
    --petrol-900: #0B2027;
    --petrol-700: #123742;
    --petrol-600: #17414A;
    --petrol-500: #2A5860;
    --petrol-300: #7FA3A9;
    --petrol-100: #D7E2E4;
    --petrol-50: #EAF1F2;
    --copper-700: #8B4A1C;
    --copper-600: #AD5F22;
    --copper-500: #C9762E;
    --copper-400: #DA8C42;
    --copper-300: #EAA659;
    --copper-100: #FAE4C7;
    --copper-50: #FDF3E7;
    --good: #2F7D5A;
    --good-bg: #E7F3EC;
    --bad: #B4472C;
    --bad-bg: #FBEAE4;
    --card-shadow: 0 1px 2px rgba(11,32,39,0.05), 0 10px 24px -14px rgba(11,32,39,0.35);
    --hero-ink: #EAF1F2;
    --hero-ink-soft: #D7E2E4;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg: #0B2027;
      --bg-soft: #10262E;
      --ink: #EAF1F2;
      --ink-soft: #C4D3D6;
      --muted: #8FA4A9;
      --line: #1E3841;
      --line-soft: #17313A;
      --petrol-50: #17313A;
      --petrol-100: #1E3841;
      --copper-500: #E0954D;
      --copper-400: #EAA659;
      --copper-100: #3A2A17;
      --copper-50: #2A1F13;
      --good: #6FCB9E;
      --good-bg: #12332A;
      --bad: #E38A73;
      --bad-bg: #3A2019;
      --card-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 10px 24px -14px rgba(0,0,0,0.6);
    }
  }
  :root[data-theme="dark"]{
    --bg: #0B2027;
    --bg-soft: #10262E;
    --ink: #EAF1F2;
    --ink-soft: #C4D3D6;
    --muted: #8FA4A9;
    --line: #1E3841;
    --line-soft: #17313A;
    --petrol-50: #17313A;
    --petrol-100: #1E3841;
    --copper-500: #E0954D;
    --copper-400: #EAA659;
    --copper-100: #3A2A17;
    --copper-50: #2A1F13;
    --good: #6FCB9E;
    --good-bg: #12332A;
    --bad: #E38A73;
    --bad-bg: #3A2019;
    --card-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 10px 24px -14px rgba(0,0,0,0.6);
  }

  *{ box-sizing: border-box; }
  html,body{ margin:0; padding:0; }
  body{
    background: var(--bg);
    color: var(--ink);
    font-family: "Vazirmatn", Tahoma, sans-serif;
    direction: rtl;
    text-align: right;
    padding-inline: 0;
    line-height: 1.85;
    font-size: 16px;
  }
  .num{ font-family:"Fira Code","Vazirmatn",monospace; font-variant-numeric: tabular-nums; }
  img{ max-width:100%; }
  [hidden]{ display:none !important; }

  .wrap{ max-width: 1040px; margin: 0 auto; padding-inline: 20px; }

  .hero{
    background:
      radial-gradient(1100px 420px at 85% -10%, rgba(201,118,46,0.16), transparent 60%),
      linear-gradient(160deg, var(--petrol-900) 0%, var(--petrol-700) 100%);
    color: var(--hero-ink);
    padding-block: 52px 40px;
    border-bottom: 4px solid var(--copper-500);
  }
  .eyebrow{
    display:inline-flex; align-items:center; gap:8px;
    font-size: 13px; letter-spacing: .04em; font-weight:600;
    color: var(--copper-300);
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    padding: 5px 14px; border-radius: 999px;
    margin-bottom: 18px;
  }
  .hero h1{
    font-family:"Vazirmatn"; font-weight:800; font-size: clamp(24px,3.6vw,36px);
    margin: 0 0 12px; text-wrap: balance; letter-spacing: -0.01em;
  }
  .hero p.lead{
    color: var(--hero-ink-soft); font-size: 17px; max-width: 70ch; margin: 0 0 22px;
  }
  .hero .meta{ color: var(--petrol-300); font-size: 13.5px; display:flex; gap:18px; flex-wrap:wrap; }

  .kpi-row{
    display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;
    margin-top: 30px;
  }
  @media (max-width:700px){ .kpi-row{ grid-template-columns: repeat(2, 1fr); } }
  .kpi{
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 12px;
    padding: 14px 12px;
  }
  .kpi .v{ font-family:"Fira Code"; font-variant-numeric:tabular-nums; font-weight:600; font-size: 20px; color:#fff; }
  .kpi .v small{ font-size:12px; font-weight:500; color:var(--petrol-200,#D7E2E4); }
  .kpi .l{ font-size: 12px; color: var(--petrol-300); margin-top: 4px; }

  main{ padding-block: 44px 30px; }
  section{ margin-bottom: 46px; }
  .sec-head{
    display:flex; align-items:baseline; gap:12px;
    border-bottom: 2px solid var(--line);
    padding-bottom: 10px; margin-bottom: 18px;
  }
  .sec-num{
    font-family:"Fira Code"; font-weight:600; font-size:13px;
    color: var(--bg-soft); background: var(--copper-500);
    border-radius: 7px; padding: 3px 9px; flex-shrink:0;
  }
  h2{ font-size: 21px; font-weight:800; margin:0; color: var(--petrol-700); }
  :root[data-theme="dark"] h2, @media (prefers-color-scheme:dark){ :root:not([data-theme="light"]) h2{ color: var(--copper-400); } }
  h3{ font-size:16px; font-weight:700; margin: 20px 0 10px; color: var(--petrol-600); }
  :root[data-theme="dark"] h3, @media (prefers-color-scheme:dark){ :root:not([data-theme="light"]) h3{ color: var(--copper-300); } }
  p{ margin: 0 0 12px; color: var(--ink-soft); max-width: 78ch; }
  strong{ color: var(--ink); font-weight:700; }
  ul.bullets{ margin: 0 0 14px; padding-inline-start: 20px; color: var(--ink-soft); max-width: 78ch; }
  ul.bullets li{ margin-bottom: 8px; }

  .callout{
    background: var(--petrol-50); border: 1px solid var(--line-soft);
    border-inline-start: 4px solid var(--petrol-500);
    border-radius: 10px; padding: 14px 16px; margin: 16px 0;
  }
  .callout p, .callout ul{ margin:0; color: var(--ink-soft); max-width: none; }
  .callout ul{ padding-inline-start: 20px; }
  .callout ul li{ margin-bottom: 8px; }
  .callout ul li:last-child{ margin-bottom: 0; }
  .callout.copper{ border-inline-start-color: var(--copper-500); background: var(--copper-50); }
  .callout.bad{ border-inline-start-color: var(--bad); background: var(--bad-bg); }

  .pill-row{ display:flex; flex-wrap:wrap; gap:8px; margin: 10px 0 16px; }
  .pill{
    display:inline-flex; align-items:center; gap:6px;
    font-size:12.5px; font-weight:600; color: var(--petrol-700);
    background: var(--petrol-50); border:1px solid var(--line-soft);
    border-radius: 999px; padding: 5px 12px;
  }
  :root[data-theme="dark"] .pill, @media (prefers-color-scheme:dark){ :root:not([data-theme="light"]) .pill{ color: var(--copper-300); } }

  .chart-box{
    background: var(--bg-soft); border:1px solid var(--line); border-radius: 14px;
    padding: 18px 18px 8px; margin: 18px 0; box-shadow: var(--card-shadow);
  }
  .chart-box .cap{ font-size:12.5px; color:var(--muted); text-align:center; margin-top:6px; padding-bottom:10px; }
  .chart-h{ position:relative; width:100%; }

  .table-wrap{ overflow-x:auto; border:1px solid var(--line); border-radius: 12px; margin: 14px 0; box-shadow: var(--card-shadow); }
  table{ width:100%; border-collapse: collapse; font-size: 13.5px; min-width: 560px; }
  thead th{
    background: var(--petrol-700); color: #fff; font-weight:700; text-align:right;
    padding: 10px 12px; white-space: nowrap; font-size: 13px;
  }
  tbody td{ padding: 9px 12px; border-top: 1px solid var(--line-soft); color: var(--ink-soft); vertical-align:top; }
  tbody tr:nth-child(even){ background: var(--petrol-50); }
  tbody tr.hl td{ background: var(--copper-50); font-weight:700; color: var(--ink); }
  tbody td:first-child{ font-weight:700; color: var(--ink); white-space:nowrap; }
  .num-cell{ font-family:"Fira Code"; font-variant-numeric:tabular-nums; }

  footer{
    border-top:1px solid var(--line); margin-top: 30px; padding-block: 26px 46px;
    color: var(--muted); font-size: 13px;
  }
  footer p{ margin:0; max-width:none; }

  a{ color: var(--copper-600); }
  :root[data-theme="dark"] a, @media (prefers-color-scheme:dark){ :root:not([data-theme="light"]) a{ color: var(--copper-400); } }
`;
