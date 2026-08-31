"""
تولید PDF گزارش هفتگی مدیران — فارسی، راست‌به‌چپ، با هویت بصری سایت (رنگ‌های
petrol/copper از web/app/globals.css، فونت Vazirmatn).

چرا reportlab (نه weasyprint): weasyprint روی ویندوز به نصب جداگانه‌ی GTK3
runtime نیاز داره (نصب دستی، نه فقط pip install) — دقیقاً همون محیطی که این
اسکریپت باید توش محلی تست بشه. reportlab خالص پایتونه، wheel آماده برای ویندوز
داره، بدون هیچ وابستگی سیستمی.

چرا اعداد لاتین (نه فارسی): برای ارقام مالی/درصد در یک گزارش مدیریتی، خوانایی
و بدون‌ابهامی مهم‌تر از یکدست‌بودن رسم‌الخطه؛ سایت هم برای این دسته اعداد از
فونت تبولار (Fira Code) استفاده می‌کنه، نه رقم فارسی.
"""

import os
import re

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.linecharts import HorizontalLineChart
from reportlab.graphics.charts.legends import Legend

import arabic_reshaper
from bidi.algorithm import get_display

# --- رنگ‌ها (عیناً از web/app/globals.css @theme) ---
PETROL_900 = HexColor("#0B2027")
PETROL_700 = HexColor("#123742")
PETROL_500 = HexColor("#2A5860")
PETROL_100 = HexColor("#D7E2E4")
PETROL_50 = HexColor("#EAF1F2")
COPPER_500 = HexColor("#C9762E")
COPPER_400 = HexColor("#DA8C42")
COPPER_100 = HexColor("#FAE4C7")
COPPER_50 = HexColor("#FDF3E7")
SLATE_500 = HexColor("#64748B")
DANGER = HexColor("#9C2B2B")
SUCCESS = HexColor("#2E7D4F")

FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")
_FONTS_REGISTERED = False


def _register_fonts():
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    pdfmetrics.registerFont(TTFont("Vazirmatn", os.path.join(FONTS_DIR, "Vazirmatn-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Vazirmatn-Medium", os.path.join(FONTS_DIR, "Vazirmatn-Medium.ttf")))
    pdfmetrics.registerFont(TTFont("Vazirmatn-Bold", os.path.join(FONTS_DIR, "Vazirmatn-Bold.ttf")))
    _FONTS_REGISTERED = True


# تاریخ‌های ISO («2026-08-31») یا اعداد چندبخشی مشابه، وقتی وسط یک جمله‌ی فارسی
# قرار می‌گیرن، الگوریتم دوجهته (UBA) گاهی ترتیب گروه‌های داخلشون رو برعکس
# می‌کنه (مثلاً «2026-08-31» به‌صورت «31-08-2026» رسم می‌شه) — چون خط‌تیره یک
# جداکننده‌ی خنثاست و بدون یک ایزوله‌ی صریح، جهت رشته‌ی اطرافش رو می‌گیره. با
# ایزوله‌کردن (LRE...PDF) هر بلوک عددی چندبخشی قبل از reshape/bidi، این باگ
# رفع می‌شه؛ کشف شد موقع تست PDF واقعی (فوتر «۳۱-۰۸-۲۰۲۶» به‌جای «۲۰۲۶-۰۸-۳۱»).
_LRE, _PDF = "‪", "‬"
_MULTI_PART_NUMBER_RE = re.compile(r"\d[\d./:-]*\d")


def fa(text) -> str:
    """متن فارسی رو برای رسم درست در reportlab آماده می‌کنه (شکل‌دهی حروف + ترتیب RTL)."""
    if text is None:
        return ""
    text = _MULTI_PART_NUMBER_RE.sub(lambda m: _LRE + m.group(0) + _PDF, str(text))
    return get_display(arabic_reshaper.reshape(text))


def styles():
    _register_fonts()
    return {
        "title": ParagraphStyle(
            "title", fontName="Vazirmatn-Bold", fontSize=20, leading=26,
            textColor=white, alignment=TA_RIGHT,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", fontName="Vazirmatn", fontSize=11, leading=16,
            textColor=PETROL_100, alignment=TA_RIGHT,
        ),
        "h2": ParagraphStyle(
            "h2", fontName="Vazirmatn-Bold", fontSize=14, leading=20,
            textColor=PETROL_900, alignment=TA_RIGHT, spaceBefore=14, spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "body", fontName="Vazirmatn", fontSize=9.5, leading=15,
            textColor=HexColor("#1E293B"), alignment=TA_RIGHT,
        ),
        "small": ParagraphStyle(
            "small", fontName="Vazirmatn", fontSize=8, leading=12,
            textColor=SLATE_500, alignment=TA_RIGHT,
        ),
        "kpi_label": ParagraphStyle(
            "kpi_label", fontName="Vazirmatn", fontSize=8.5, leading=12,
            textColor=PETROL_100, alignment=TA_RIGHT,
        ),
        "kpi_value": ParagraphStyle(
            "kpi_value", fontName="Vazirmatn-Bold", fontSize=15, leading=19,
            textColor=white, alignment=TA_RIGHT,
        ),
        "kpi_hint": ParagraphStyle(
            "kpi_hint", fontName="Vazirmatn", fontSize=7.5, leading=11,
            textColor=COPPER_100, alignment=TA_RIGHT,
        ),
        "table_cell": ParagraphStyle(
            "table_cell", fontName="Vazirmatn", fontSize=8.5, leading=12,
            textColor=HexColor("#1E293B"), alignment=TA_RIGHT,
        ),
        "table_cell_num": ParagraphStyle(
            "table_cell_num", fontName="Vazirmatn-Medium", fontSize=8.5, leading=12,
            textColor=HexColor("#1E293B"), alignment=TA_CENTER,
        ),
    }


def _pct_text(pct):
    if pct is None:
        return "—"
    sign = "+" if pct > 0 else ""
    return f"{sign}{pct}%"


def _pct_color(pct):
    if pct is None or pct == 0:
        return SLATE_500
    return SUCCESS if pct < 0 else DANGER  # کاهش قیمت جهانی برای ما به‌عنوان صادرکننده معمولاً خبر بد است، نه خوب — رنگ را عمداً برعکسِ حس معمول «سبز=خوب» نمی‌گذاریم چون بستگی به جهت دارد؛ اینجا خنثی (فقط جهت را نشان می‌دهد)


def _price_table(rows, s):
    if not rows:
        return None
    header = ["منبع", "تغییر (~۷ روز)", "قیمت فعلی", "نوع", "کشور/منطقه", "محصول"]
    header = [fa(h) for h in header]
    data = [header]
    for r in rows:
        value_txt = f"{r['value']:,.2f} {r['currency']}/{r['unit']}"
        pct_txt = fa(_pct_text(r["pct_change"]))
        data.append([
            Paragraph(fa(r["source_name"] or "—"), s["small"]),
            Paragraph(pct_txt, s["table_cell_num"]),
            Paragraph(value_txt, s["table_cell_num"]),
            Paragraph(fa(r["price_type_fa"]), s["table_cell_num"]),
            Paragraph(fa(r["country"]), s["table_cell"]),
            Paragraph(fa(r["product_fa"]), s["table_cell"]),
        ])

    col_widths = [28 * mm, 22 * mm, 32 * mm, 16 * mm, 28 * mm, 26 * mm]
    t = Table(data, colWidths=col_widths, repeatRows=1)

    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), PETROL_700),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Vazirmatn-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("ALIGN", (0, 0), (-1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, PETROL_100),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i, r in enumerate(rows, start=1):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), PETROL_50))
        style_cmds.append(("TEXTCOLOR", (1, i), (1, i), _pct_color(r["pct_change"])))
    t.setStyle(TableStyle(style_cmds))
    return t


PRODUCT_SHORT = {"sodium bicarbonate": "Bicarb", "soda ash": "Soda Ash"}


def _trend_chart(usd_table, s):
    """نمودار خطی روند قیمت (چند سری اصلی) — با matplotlib/plotly نه، با موتور رسم خودِ
    reportlab، چون برچسب‌های محور همه لاتین‌اند (تاریخ/عدد/نام کشور انگلیسی) و نیازی به
    شکل‌دهی فارسی نداره؛ اضافه‌کردن یک کتابخونه‌ی رسم جدید فقط برای این یک نمودار توجیه نداشت.
    """
    # فقط سری‌هایی که حداقل ۳ نقطه‌ی تاریخی متفاوت دارن، تا نمودار خط قابل‌رسم واقعی باشه.
    plottable = [r for r in usd_table if r["price_type_fa"] == "FOB" and len({d for d, _ in r["history"]}) >= 3]
    if not plottable:
        return None
    plottable = plottable[:4]  # حداکثر ۴ سری تا نمودار شلوغ نشه

    all_dates = sorted({d for r in plottable for d, _ in r["history"]})
    if len(all_dates) < 2:
        return None

    series_data = []
    labels = []
    for r in plottable:
        by_date = {}
        for d, v in r["history"]:
            by_date[d] = v  # اگه یک تاریخ چند رکورد داشت (باگ batch دوتایی هنوز حل‌نشده)، آخری می‌مونه

        # پرکردن نقاط قبل از اولین داده‌ی این سری با «اولین مقدار خودِ همین سری»،
        # نه صفر و نه اولین مقدار یک سری دیگه — وگرنه خط جعلی از صفر بالا می‌پره
        # (دقیقاً همون کلاس باگی که این گزارش قراره نشونش بده، نه تکرارش کنه).
        first_known = next((by_date[d] for d in all_dates if d in by_date), None)
        points = []
        last_val = first_known
        for d in all_dates:
            if d in by_date:
                last_val = by_date[d]
            points.append(last_val)
        series_data.append(points)
        # نام محصول هم توی برچسب می‌آد چون ممکنه دو محصول متفاوت (جوش شیرین/سودا
        # اش) هر دو برای همون کشور FOB داشته باشن — بدون این، هر دو «China FOB»
        # نشون داده می‌شدن و قابل‌تفکیک نبودن (باگی که در تست اول همین امروز دیده شد).
        product_short = PRODUCT_SHORT.get(r["product"], r["product"])
        labels.append(f"{r['country']} · {product_short}")

    drawing = Drawing(480, 190)
    chart = HorizontalLineChart()
    chart.x = 50
    chart.y = 30
    chart.width = 340
    chart.height = 130
    chart.data = series_data
    chart.categoryAxis.categoryNames = [d[5:] for d in all_dates]  # فقط MM-DD تا تنگ نشه
    chart.categoryAxis.labels.fontName = "Vazirmatn"
    chart.categoryAxis.labels.fontSize = 6.5
    chart.categoryAxis.labels.angle = 0
    chart.valueAxis.labels.fontName = "Vazirmatn"
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.valueMin = 0

    palette = [COPPER_500, PETROL_500, HexColor("#0C7DA6"), HexColor("#4C7A3D")]
    for i in range(len(series_data)):
        chart.lines[i].strokeColor = palette[i % len(palette)]
        chart.lines[i].strokeWidth = 2

    legend = Legend()
    legend.x = 400
    legend.y = 140
    legend.dx = 8
    legend.dy = 8
    legend.fontName = "Vazirmatn"
    legend.fontSize = 7
    legend.alignment = "right"
    legend.colorNamePairs = list(zip(
        [palette[i % len(palette)] for i in range(len(series_data))], labels
    ))

    drawing.add(chart)
    drawing.add(legend)
    return drawing


def _kpi_cards(data, s):
    biggest = data.get("biggest_mover")
    lowest = data.get("lowest_fob")

    def card(label, value, hint, accent=False):
        bg = COPPER_500 if accent else PETROL_700
        inner = Table(
            [[Paragraph(fa(label), s["kpi_label"])],
             [Paragraph(value, s["kpi_value"])],
             [Paragraph(fa(hint), s["kpi_hint"])]],
            colWidths=[52 * mm],
        )
        inner.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("TOPPADDING", (0, 0), (-1, 0), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
            ("TOPPADDING", (0, 1), (-1, 1), 2),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 2),
        ]))
        return inner

    cards = [
        card(
            "قیمت پایه‌ی مرجع FOB ما",
            f"${data['base_fob_usd']}",
            "دلار بر تن — مبنای هزینه‌یابی صادراتی",
            accent=True,
        ),
        card(
            "سری‌های قیمتی رصدشده",
            str(data["series_count"]),
            "ترکیب محصول/کشور/نوع قیمت، این هفته",
        ),
    ]
    if lowest:
        cards.append(card(
            "کمترین FOB جهانی جوش شیرین",
            f"${lowest['value']:,.0f}",
            f"{lowest['country']} — در برابر {data['base_fob_usd']}$ ما",
        ))
    if biggest and biggest["pct_change"] not in (None, 0):
        cards.append(card(
            "بیشترین تغییر هفته",
            _pct_text(biggest["pct_change"]),
            f"{biggest['country']} · {biggest['product_fa']} ({biggest['price_type_fa']})",
        ))

    row = Table([cards], colWidths=[56 * mm] * len(cards), hAlign="RIGHT")
    row.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return row


def _news_block(news_items, s):
    if not news_items:
        return [Paragraph(fa("این هفته خبر تحلیلی تازه‌ای ثبت نشده."), s["small"])]

    blocks = []
    for n in news_items[:6]:
        sources = "، ".join(src.get("name", "") for src in (n.get("sources") or []) if src.get("name"))
        head = Paragraph(f"<b>{fa(n.get('headline_fa', ''))}</b>", s["body"])
        topic = Paragraph(fa(f"[{n.get('topic', '')}] — {n.get('date', '')}"), s["small"])
        body = Paragraph(fa(n.get("analysis_fa", "")), s["table_cell"])
        src_line = Paragraph(fa(f"منبع: {sources}") if sources else "", s["small"])
        blocks.append(KeepTogether([topic, head, Spacer(1, 2), body, src_line, Spacer(1, 8)]))
    return blocks


def _watch_block(watch, label, s):
    if not watch:
        return [Paragraph(fa(f"داده‌ی رصد {label} برای این هفته موجود نیست."), s["small"])]

    lines = [
        Paragraph(f"<b>{fa(watch.get('headline_fa', ''))}</b>", s["body"]),
        Paragraph(fa(watch.get("date", "")), s["small"]),
        Spacer(1, 3),
    ]
    if watch.get("market_note"):
        lines.append(Paragraph(fa(watch["market_note"]), s["table_cell"]))
        lines.append(Spacer(1, 4))
    for u in (watch.get("company_updates") or [])[:2]:
        lines.append(Paragraph(
            f"<b>{fa(u.get('company', ''))}</b>: {fa(u.get('headline', ''))}", s["table_cell"]
        ))
        if u.get("summary"):
            lines.append(Paragraph(fa(u["summary"]), s["small"]))
        lines.append(Spacer(1, 3))
    return lines


def _header_footer(canvas, doc, report_date: str):
    canvas.saveState()
    width, height = A4

    # نوار بالای هر صفحه (به‌جز صفحه‌ی اول که هدر کامل خودش رو داره)
    if doc.page > 1:
        canvas.setFillColor(PETROL_900)
        canvas.rect(0, height - 16 * mm, width, 16 * mm, fill=1, stroke=0)
        canvas.setFillColor(white)
        canvas.setFont("Vazirmatn-Bold", 10)
        canvas.drawRightString(width - 15 * mm, height - 10.5 * mm, fa("گزارش هفتگی بازار — سپهران شیمی"))

    # فوتر همه‌ی صفحات
    canvas.setFillColor(SLATE_500)
    canvas.setFont("Vazirmatn", 7.5)
    canvas.drawCentredString(width / 2, 10 * mm, fa(f"تولید خودکار توسط پلتفرم تحقیق و توسعه · {report_date} · صفحه {doc.page}"))
    canvas.restoreState()


def build_pdf(data: dict, output_path: str) -> str:
    _register_fonts()
    s = styles()

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        topMargin=42 * mm, bottomMargin=18 * mm, leftMargin=15 * mm, rightMargin=15 * mm,
        title="گزارش هفتگی بازار جوش شیرین — سپهران شیمی",
    )

    story = []

    # --- هدر برند (فقط صفحه‌ی اول؛ به‌عنوان یک عنصر جریان، نه رسم مستقیم روی کانواس) ---
    header_table = Table(
        [[Paragraph(fa("گزارش هفتگی بازار جوش شیرین و سودا اش"), s["title"])],
         [Paragraph(fa(f"سپهران شیمی · تولید خودکار · {data['generated_date']}"), s["subtitle"])]],
        colWidths=[180 * mm],
    )
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PETROL_900),
        ("TOPPADDING", (0, 0), (-1, 0), 14),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 14),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
    ]))

    story.append(header_table)
    story.append(Spacer(1, 10))
    story.append(_kpi_cards(data, s))
    story.append(Spacer(1, 6))

    story.append(Paragraph(fa("تغییرات قیمت جهانی (دلاری)"), s["h2"]))
    usd_tbl = _price_table(data["usd_table"], s)
    if usd_tbl:
        story.append(usd_tbl)
    else:
        story.append(Paragraph(fa("داده‌ی قیمت دلاری برای این هفته ثبت نشده."), s["small"]))

    chart = _trend_chart(data["usd_table"], s)
    if chart:
        story.append(Spacer(1, 10))
        story.append(Paragraph(fa("روند قیمت FOB (چهار سری اصلی، دلار بر تن)"), s["h2"]))
        story.append(chart)

    if data["local_table"]:
        story.append(Spacer(1, 10))
        story.append(Paragraph(fa("قیمت‌های داخلی (ارز محلی — جدا از دلاری، طبق قانون پروژه قاطی نمی‌شود)"), s["h2"]))
        story.append(_price_table(data["local_table"], s))

    story.append(PageBreak())
    story.append(Paragraph(fa("اخبار و تحلیل هفته"), s["h2"]))
    story.extend(_news_block(data["news"], s))

    story.append(Spacer(1, 6))
    story.append(Paragraph(fa("رصد رقبا — ترکیه"), s["h2"]))
    story.extend(_watch_block(data["turkey_watch"], "ترکیه", s))

    story.append(Spacer(1, 6))
    story.append(Paragraph(fa("رصد رقبا — چین"), s["h2"]))
    story.extend(_watch_block(data["china_watch"], "چین", s))

    doc.build(
        story,
        onFirstPage=lambda c, d: _header_footer(c, d, data["generated_date"]),
        onLaterPages=lambda c, d: _header_footer(c, d, data["generated_date"]),
    )
    return output_path
