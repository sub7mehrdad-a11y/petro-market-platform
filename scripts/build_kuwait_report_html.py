"""گزارش جامع تحلیلی کویت: docx کاربر → HTML خودبسنده (همان سیستم طراحی گزارش‌های امارات/عربستان).

متن عیناً از docx می‌آید (فقط: زیرعنوان‌ها شماره‌ی «بخش٫ردیف» می‌گیرند، «منابع» که بی‌شماره بود شماره‌ی ۱۴ می‌گیرد، و ارقام لاتین
داخل جدول‌ها فارسی می‌شوند). جدول‌ها از خود docx؛ ۴ نمودار از روی جدول‌های همان گزارش؛ نقشه‌ی تعاملی کاربر (Leaflet) به‌جای
ارجاع جدا، خودبسنده (iframe srcdoc) در پایان بخش ۸. قالب (CSS) از گزارش امارات گرفته می‌شود.

اجرا:  python scripts/build_kuwait_report_html.py <docx> <map.html> <out.html>
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import docx_blocks  # noqa: E402

TEMPLATE = ROOT / "reports" / "امارات" / "گزارش_تحلیلی_بازار_جوش_شیرین_امارات.html"
FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
esc = html.escape


def fa_num(s: str) -> str:
    """ارقام لاتین → فارسی، با جداکننده‌ی هزارگان و اعشار فارسی (فقط بین ارقام)."""
    s = re.sub(r"(?<=\d),(?=\d)", "٬", s)
    s = re.sub(r"(?<=\d)\.(?=\d)", "٫", s)
    return s.translate(FA)


def cell(s: str) -> str:
    # سلول‌هایی که حروف لاتین دارند (نام منبع/کد) دست‌نخورده می‌مانند؛ بقیه ارقامشان فارسی می‌شود.
    return esc(s if re.search(r"[A-Za-z]", s) else fa_num(s))


def table_html(b: dict) -> str:
    head = "".join(f"<th>{cell(h)}</th>" for h in b["headers"])
    rows = []
    for r in b["rows"]:
        tds = []
        for i, c in enumerate(r):
            numeric = i > 0 and re.fullmatch(r"[\d\s,.٬٫%/—–\-()]+", c.strip() or "—") is not None
            tds.append(f'<td class="num-cell">{cell(c)}</td>' if numeric else f"<td>{cell(c)}</td>")
        rows.append("<tr>" + "".join(tds) + "</tr>")
    return f'<div class="table-wrap t-wrap"><table><thead><tr>{head}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>'


def callout_html(text: str) -> str:
    title, _, body = text.partition("\n")
    ps = f"<p><strong>{esc(title.strip())}</strong></p>"
    if body.strip():
        ps += "".join(f"<p>{esc(x.strip())}</p>" for x in body.split("\n") if x.strip())
    return f'<div class="callout copper">{ps}</div>'


def num(s: str) -> float:
    return float(s.replace("٬", "").replace(",", "").strip())


def main(docx_path: str, map_path: str, out_path: str) -> None:
    blocks = docx_blocks.extract_blocks(docx_path)
    tables = [b for b in blocks if b["type"] == "table" and len(b["headers"]) > 1]

    # ----- داده‌ی نمودارها (از جدول‌های خود گزارش)
    t_imp, t_sup, t_sec = tables[0], tables[1], tables[4]
    imp = {"years": [int(r[0]) for r in t_imp["rows"] if re.fullmatch(r"\d{4}", r[0]) and re.fullmatch(r"[\d,]+", r[1])],
           "tons": [num(r[1]) for r in t_imp["rows"] if re.fullmatch(r"\d{4}", r[0]) and re.fullmatch(r"[\d,]+", r[1])],
           "flag": [("bad" if r[0] == "2022" else "est" if r[0] == "2024" else "ok") for r in t_imp["rows"] if re.fullmatch(r"\d{4}", r[0]) and re.fullmatch(r"[\d,]+", r[1])]}
    sup = [{"name": r[0], "tons": num(r[1].replace("٬", ",")), "unit": num(r[3])} for r in t_sup["rows"]]
    sec = [{"name": r[0], "share": int(re.sub(r"\D", "", fa_to_en(r[1]))), "tons": num(fa_to_en(r[2]))} for r in t_sec["rows"]]
    cif = [  # از جدول‌های ۹ و ۱۰ گزارش (CIF شویخ) و ارزش واحد ثبت‌شده‌ی کویت ۲۰۲۵ (جدول ۲-۲)
        {"name": "پارس از خرمشهر (پیشنهاد ۲۵۵ دلار FOB)", "lo": 276, "hi": 291, "kind": "pars"},
        {"name": "پارس از بندرعباس (عادی)", "lo": 290, "hi": 310, "kind": "pars"},
        {"name": "پارس از بندرعباس (پیک و پرریسک)", "lo": 330, "hi": 350, "kind": "war"},
    ] + [{"name": f"{s['name']} (ارزش واحد ثبت‌شده ۲۰۲۵)", "lo": s["unit"], "hi": s["unit"], "kind": "cmp"} for s in sup if s["name"] in ("پاکستان", "چین", "هند", "ترکیه")]
    cif.sort(key=lambda x: x["lo"])
    D = {"imp": imp, "sup": [s for s in sup if s["tons"] >= 3], "sec": sec, "cif": cif}

    # ----- بدنه
    title = blocks[0]["text"]
    sub = blocks[1]["text"].strip("() ")
    meta = [m.strip() for m in blocks[2]["text"].split("|")]
    body: list[str] = []
    sec_no = 0
    sub_no = 0
    in_sources = False
    bullets: list[str] = []
    chart_no = 0
    srcs: list[str] = []
    map_inserted = False

    def flush_bullets() -> None:
        nonlocal bullets
        if bullets:
            body.append('<ul class="pts">\n' + "\n".join(f"<li>{esc(x)}</li>" for x in bullets) + "\n</ul>")
            bullets = []

    def chart(canvas: str, height: int, caption: str) -> None:
        nonlocal chart_no
        chart_no += 1
        body.append(f'<div class="chart-box"><div class="chart-h" style="height:{height}px"><canvas id="{canvas}"></canvas></div><div class="cap">نمودار {fa_num(str(chart_no))}: {esc(caption)}</div></div>')

    def close_section() -> None:
        flush_bullets()
        nonlocal map_inserted
        if sec_no == 8 and not map_inserted:
            srcdoc = html.escape(Path(map_path).read_text(encoding="utf-8"), quote=True)
            body.append(f'<div class="map-box"><iframe title="نقشه‌ی تعاملی گذرگاه‌های ورود کویت" loading="lazy" style="width:100%;height:680px;border:0;border-radius:12px;background:#fff" srcdoc="{srcdoc}"></iframe><div class="cap">نقشه‌ی تعاملی: دروازه‌ها، مراکز مصرف و مبدأ تأمین‌کنندگان (فاصله‌ها: OSRM و OpenStreetMap)</div></div>')
            map_inserted = True
        if sec_no:
            body.append("</section>")

    table_i = 0
    for i, b in enumerate(blocks):
        if i < 3:
            continue
        t = b["type"]
        if t == "heading":
            text = b["text"]
            m = re.match(r"^([۰-۹]+)\.\s*(.+)$", text)
            if m or text == "منابع":
                close_section()
                sec_no += 1
                sub_no = 0
                in_sources = text == "منابع"
                label = fa_num(str(sec_no))
                name = m.group(2) if m else text
                body.append(f'<section id="s{sec_no}">\n<div class="sec-head"><span class="sec-num">{label}</span><h2>{esc(name)}</h2></div>')
            else:
                flush_bullets()
                sub_no += 1
                body.append(f"<h3><bdi>{fa_num(str(sec_no))}٫{fa_num(str(sub_no))}</bdi> {esc(text)}</h3>")
        elif t == "paragraph":
            text = b["text"]
            if in_sources:
                srcs.append(text.lstrip("• ").strip())
            elif text.startswith("• "):
                bullets.append(text[2:].strip())
            else:
                flush_bullets()
                body.append(f"<p>{esc(text)}</p>")
        elif t == "table":
            flush_bullets()
            if len(b["headers"]) == 1 and not b["rows"]:
                body.append(callout_html(b["headers"][0]))
                continue
            body.append(table_html(b))
            table_i += 1
            # نمودارها بعد از جدول مربوطه
            if table_i == 1:
                chart("chImp", 360, "واردات ثبت‌شده‌ی کویت، ۲۰۱۶ تا ۲۰۲۵ (تن؛ جدول بالا). ۲۰۲۲ نامعتبر برای روند و ۲۰۲۴ برآورد سازمان ملل است.")
            elif table_i == 2:
                chart("chSup", 320, "واردات ۲۰۲۵ کویت به تفکیک کشور صادرکننده (تن؛ جدول بالا)")
            elif table_i == 5:
                chart("chSec", 300, "تفکیک بخش‌های مصرف، برآورد مدلی (تن در سال؛ آمار رسمی نیست)")
            elif table_i == 14:
                chart("chCif", 360, "هزینه رسیده‌ی برآوردی پارس به شویخ در برابر ارزش واحد ثبت‌شده‌ی کویت برای هر مبدأ در ۲۰۲۵ (دلار بر تن؛ مقایسه‌ی تقریبی، نه همه‌جا CIF)")
    if srcs:
        body.append('<ol class="srcs">\n' + "\n".join(f'<li><span class="n">{fa_num(str(n))}</span>{esc(s)}</li>' for n, s in enumerate(srcs, 1)) + "\n</ol>")
    body.append("</section>")

    kpis = [
        ("۱٬۲۱۳ <small>تن</small>", "واردات ثبت‌شده ۲۰۲۵ (۱٬۱۳۹ تن در ۲۰۲۳؛ کف مستند ≈ ۹۹۷ تن)"),
        ("≈ ۱٬۶۰۰ <small>تن</small>", "برآورد مدلی مصرف سالانه (دامنه ۱٬۳۰۰ تا ۲٬۲۰۰؛ ≈ ۳۳۰ گرم برای هر نفر؛ آمار رسمی نیست)"),
        ("۲۰۴ / ۱۱۰ / ۰ <small>تن</small>", "صادرات ایران به کویت در ۱۴۰۲ / ۱۴۰۳ / ده‌ماهه ۱۴۰۴ (گمرک ایران)"),
        ("۲۹۰–۳۰۵ <small>دلار</small>", "هزینه رسیده‌ی پارس از خرمشهر به انبار شویخ (هر تن؛ سناریوی پیشنهاد ۲۵۵ دلار FOB)"),
    ]
    kpi_html = '<div class="kpi-row">' + "".join(f'<div class="kpi"><div class="v">{v}</div><div class="l">{esc(l)}</div></div>' for v, l in kpis) + "</div>"

    tpl = TEMPLATE.read_text(encoding="utf-8")
    head = tpl[: tpl.index('<div class="hero">')]
    head = re.sub(r"<title>.*?</title>", f"<title>{esc(title)}</title>", head, count=1, flags=re.S)
    hero = (
        '<div class="hero">\n  <div class="wrap">\n    <span class="eyebrow">تحقیق و توسعه بازرگانی &middot; جوش شیرین پارس</span>\n'
        f"    <h1>{esc(title)}</h1>\n    <p class=\"lead\">{esc(sub)}</p>\n"
        f'    <div class="meta">{"".join(f"<span>{esc(m)}</span>" for m in meta)}</div>\n    {kpi_html}\n  </div>\n</div>\n\n<main class="wrap">\n\n'
    )
    date_line = next((m for m in meta if "۱۴۰۵" in m), meta[-1])
    footer = f'\n</main>\n\n<footer class="wrap">\n  <p>تحقیق و توسعه بازرگانی &middot; جوش شیرین پارس &middot; {esc(date_line)}</p>\n</footer>\n\n'
    script = SCRIPT.replace("__DATA__", json.dumps(D, ensure_ascii=False))
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(head + hero + "\n".join(body) + footer + script, encoding="utf-8")
    print(f"{out_path}: {chart_no} نمودار، {table_i} جدول، {sec_no} بخش، {len(srcs)} منبع، نقشه={'بله' if map_inserted else 'خیر'}")


def fa_to_en(s: str) -> str:
    return s.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٬٫", "0123456789,."))


SCRIPT = r"""<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script>
(function(){
  "use strict";
  var D = __DATA__;
  var FA = "۰۱۲۳۴۵۶۷۸۹";
  function toFa(n){ return String(n).replace(/[0-9]/g, function(d){ return FA[+d]; }); }
  function fmt(n){ return toFa(Number(n).toLocaleString("en-US").replace(/,/g, "٬")); }
  function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  var charts = [];
  function colors(){
    return { ink: cssVar('--ink-soft'), grid: cssVar('--line-soft'), petrol: cssVar('--petrol-500'), petrolDark: cssVar('--petrol-700'),
             copper: cssVar('--copper-500'), copperLight: cssVar('--copper-300'), bad: cssVar('--bad'), good: cssVar('--good'), bg: cssVar('--bg-soft') };
  }
  function tip(fn){ return { rtl: true, textDirection: 'rtl', callbacks: { label: fn } }; }
  function el(id){ return document.getElementById(id); }
  function mk(id, cfg){ if (el(id)) charts.push(new Chart(el(id), cfg)); }

  function build(){
    var c = colors();
    Chart.defaults.font.family = "Vazirmatn, Tahoma, sans-serif"; Chart.defaults.color = c.ink; Chart.defaults.borderColor = c.grid;
    charts.forEach(function(ch){ ch.destroy(); }); charts = [];

    // ۱) واردات ثبت‌شده ۲۰۱۶ تا ۲۰۲۵؛ سال‌های نامعتبر/برآوردی کم‌رنگ
    var I = D.imp, fill = { ok: c.petrolDark, est: c.copper, bad: c.bad + '88' };
    mk('chImp', { type: 'bar',
      data: { labels: I.years.map(toFa), datasets: [{ label: 'تن', data: I.tons, backgroundColor: I.flag.map(function(f){ return fill[f]; }), borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: tip(function(x){ var f = I.flag[x.dataIndex]; return fmt(x.parsed.y) + ' تن' + (f === 'bad' ? ' (نامعتبر برای روند)' : f === 'est' ? ' (برآورد سازمان ملل)' : ''); }) },
        scales: { x: { grid: { display: false }, ticks: { color: c.ink } },
                  y: { grid: { color: c.grid }, ticks: { color: c.ink, callback: function(v){ return fmt(v); } }, title: { display: true, text: 'تن', color: c.ink } } } } });

    // ۲) تأمین‌کنندگان ۲۰۲۵ (تن)
    var S = D.sup;
    mk('chSup', { type: 'bar',
      data: { labels: S.map(function(s){ return s.name; }), datasets: [{ label: 'تن', data: S.map(function(s){ return s.tons; }), backgroundColor: S.map(function(s){ return s.name === 'ایران' ? c.copper : c.petrol; }), borderRadius: 4 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: tip(function(x){ return fmt(x.parsed.x) + ' تن؛ ارزش واحد ' + fmt(S[x.dataIndex].unit) + ' دلار بر تن'; }) },
        scales: { x: { grid: { color: c.grid }, ticks: { color: c.ink, callback: function(v){ return fmt(v); } }, title: { display: true, text: 'تن (۲۰۲۵)', color: c.ink } },
                  y: { grid: { display: false }, ticks: { color: c.ink } } } } });

    // ۳) تفکیک بخش‌های مصرف (تن، برآورد مدلی)
    var T = D.sec;
    mk('chSec', { type: 'bar',
      data: { labels: T.map(function(s){ return s.name; }), datasets: [{ label: 'تن (برآورد)', data: T.map(function(s){ return s.tons; }), backgroundColor: c.petrol, borderRadius: 4 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: tip(function(x){ return fmt(x.parsed.x) + ' تن (' + toFa(T[x.dataIndex].share) + '٪)'; }) },
        scales: { x: { grid: { color: c.grid }, ticks: { color: c.ink, callback: function(v){ return fmt(v); } }, title: { display: true, text: 'تن در سال', color: c.ink } },
                  y: { grid: { display: false }, ticks: { color: c.ink } } } } });

    // ۴) هزینه رسیده‌ی پارس در برابر ارزش واحد ثبت‌شده‌ی رقبا (بازه)
    var P = D.cif, col = { cmp: c.petrolDark, pars: c.good, war: c.bad };
    var labels = { id: 'cifLabels', afterDatasetsDraw: function(chart){
      var ctx = chart.ctx, meta = chart.getDatasetMeta(1), xs = chart.scales.x;
      ctx.save(); ctx.font = '600 12px Vazirmatn, Tahoma'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.fillStyle = c.ink;
      meta.data.forEach(function(bar, i){ var p = P[i]; ctx.fillText(p.lo === p.hi ? fmt(p.lo) : fmt(p.lo) + ' – ' + fmt(p.hi), xs.getPixelForValue(p.hi) + 8, bar.y); });
      ctx.restore(); } };
    mk('chCif', { type: 'bar', plugins: [labels],
      data: { labels: P.map(function(p){ return p.name; }), datasets: [
        { label: 'کران پایین', data: P.map(function(p){ return p.lo; }), backgroundColor: P.map(function(p){ return col[p.kind]; }), borderRadius: 3 },
        { label: 'دامنه', data: P.map(function(p){ return p.hi - p.lo; }), backgroundColor: P.map(function(p){ return col[p.kind] + '55'; }), borderRadius: 3 } ] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: tip(function(x){ var p = P[x.dataIndex]; return p.lo === p.hi ? fmt(p.lo) + ' دلار بر تن' : fmt(p.lo) + ' تا ' + fmt(p.hi) + ' دلار بر تن'; }) },
        scales: { x: { stacked: true, suggestedMax: 640, grid: { color: c.grid }, ticks: { color: c.ink, callback: function(v){ return toFa(v); } }, title: { display: true, text: 'دلار بر تن', color: c.ink } },
                  y: { stacked: true, grid: { display: false }, ticks: { color: c.ink } } } } });
  }
  build();
  if (window.matchMedia){ window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', build); }
})();
</script>

</body>
</html>
"""

if __name__ == "__main__":
    main(*sys.argv[1:4])
