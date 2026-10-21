"""تم سند گزارش — نسخه‌ی روشن آبی (طرح بسته‌ی الف/ب، ui/sepehran-package-b/report-theme).

گزارش‌های HTML خودبسته‌ی پلتفرم (۲۵ فایل) همگی از یک قالب مشترک ساخته شده‌اند: متغیرهای CSS
(:root) با پالت «کوره» (نفتی + مسی) و رنگ نمودارهای Chart.js از همان متغیرها خوانده می‌شود.
این ماژول «نسخه‌ی نمایشی» (public/report-html) را به پالت جدید بازرنگ می‌کند؛ فایل اصلی که کاربر
دانلود می‌کند (reports/<کشور>/…) دست‌نخورده می‌ماند.

کارها:
  ۱. نگاشت قطعی رنگ‌های hex/rgba قدیمی (مسی، نفتی، کاغذی) به توکن‌های جدید؛
  ۲. حذف شاخه‌های تیره (prefers-color-scheme / data-theme="dark") — فقط حالت روشن؛
  ۳. فونت و Chart.js از دارایی‌های همین سایت (بدون CDN) تا گزارش آفلاین/بدون گوگل هم کار کند؛
  ۴. رنگ سری‌های نمودار: رقبا خنثی‌آبی، ما آبی اصلی (ایران = chart-iran در نمودارهای برنامه).

استفاده:  python scripts/report_theme.py   ← بازسازی همه‌ی نسخه‌های نمایشی از فایل‌های اصلی
"""
import json
import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# نگاشت hex (بدون حساسیت به حروف) — قدیمی → جدید
HEX_MAP = {
    # بوم و متن
    "#F7F3EC": "#F5F8FC", "#16232A": "#263B50", "#4B5A61": "#52687D", "#7C8A90": "#52687D",
    "#E4DDD0": "#D2DEEB", "#EDE7DA": "#E2EEFB",
    # نفتی → آبی
    "#0B2027": "#193D5B", "#123742": "#205B8A", "#17414A": "#286DA6", "#2A5860": "#478DCA",
    "#7FA3A9": "#A2C7EC", "#D7E2E4": "#E2EEFB", "#EAF1F2": "#F1F7FD", "#EAF4F4": "#F1F7FD",
    # مسی → آبی اصلی
    "#8B4A1C": "#1D4A70", "#AD5F22": "#205B8A", "#C9762E": "#286DA6", "#DA8C42": "#478DCA",
    "#EAA659": "#77ACDE", "#FAE4C7": "#E2EEFB", "#FDF3E7": "#F1F7FD", "#E0954D": "#286DA6",
    # وضعیت
    "#2F7D5A": "#176C4C", "#E7F3EC": "#EAF7EF", "#B4472C": "#A52E4A", "#FBEAE4": "#FFF0F3",
    "#9C2B2B": "#A52E4A", "#4C7A3D": "#6E7131",
}
HEX_RE = re.compile("|".join(re.escape(k) for k in sorted(HEX_MAP, key=len, reverse=True)), re.I)

# rgba مسی/نفتی قدیمی → آبی (فقط RGB؛ آلفا حفظ می‌شود)
RGB_MAP = [
    (re.compile(r"rgba\(\s*201\s*,\s*118\s*,\s*46\s*,"), "rgba(40,109,166,"),
    (re.compile(r"rgba\(\s*11\s*,\s*32\s*,\s*39\s*,"), "rgba(38,59,80,"),
]

# رنگ سری‌های نمودار (Chart.js از cssVar می‌خواند؛ این‌ها را ثابت می‌کنیم تا سری‌ها از هم تفکیک شوند)
CHART_VAR_OVERRIDES = [
    ("cssVar('--petrol-500')", "'#536779'"),
    ("cssVar('--petrol-700')", "'#193D5B'"),
]

FONTS_LINK = '<link rel="stylesheet" href="/report-assets/report-fonts.css">'
CHART_CDN = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
CHART_LOCAL = "/report-assets/chart.umd.min.js"


def _strip_dark(css: str) -> str:
    # ۱) بلوک‌های @media (prefers-color-scheme: dark){ ... } با تطبیق آکولاد
    while True:
        m = re.search(r"@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{", css)
        if not m:
            break
        i = m.end()
        depth = 1
        while i < len(css) and depth:
            depth += {"{": 1, "}": -1}.get(css[i], 0)
            i += 1
        css = css[: m.start()] + css[i:]
    # ۲) :root[data-theme="dark"]{ ... } (بلوک چندخطی ساده، بدون آکولاد تو در تو)
    css = re.sub(r':root\[data-theme="dark"\]\s*\{[^{}]*\}', "", css)
    # ۳) قواعد تک‌خطی خراب/دوگانه‌ای که اشاره به data-theme="dark" دارند
    css = re.sub(r'^[^\n]*data-theme="dark"[^\n]*\n', "", css, flags=re.M)
    css = re.sub(r'^[^\n]*prefers-color-scheme[^\n]*\n', "", css, flags=re.M)
    return css


def reskin_html(text: str) -> str:
    # CSS: حذف تیره‌ها فقط داخل <style>
    text = re.sub(r"(<style[^>]*>)(.*?)(</style>)", lambda m: m.group(1) + _strip_dark(m.group(2)) + m.group(3), text, flags=re.S)
    # رنگ‌ها
    text = HEX_RE.sub(lambda m: HEX_MAP[m.group(0).upper()], text)
    for rx, rep in RGB_MAP:
        text = rx.sub(rep, text)
    for a, b in CHART_VAR_OVERRIDES:
        text = text.replace(a, b)
    # فقط روشن
    if 'name="color-scheme"' not in text:
        text = text.replace("<head>", '<head>\n<meta name="color-scheme" content="light">', 1)
    # منابع بیرونی → دارایی‌های سایت
    text = re.sub(r'<link[^>]*rel="preconnect"[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*', "", text)
    text = re.sub(r'<link[^>]*href="https://fonts\.googleapis\.com/css2[^"]*"[^>]*>', FONTS_LINK, text)
    text = text.replace(CHART_CDN, CHART_LOCAL)
    return text


def rebuild_all(verbose: bool = True) -> int:
    manifest = json.load(open(os.path.join(BASE_DIR, "reports", "manifest.json"), encoding="utf-8"))
    out_dir = os.path.join(BASE_DIR, "web", "public", "report-html")
    n = 0
    for r in manifest:
        out = os.path.join(out_dir, f"{r['id']}.html")
        src = os.path.join(BASE_DIR, "reports", r["relative_path"])
        if not os.path.exists(out) or not os.path.exists(src):
            continue
        raw = open(src, "rb").read().decode("utf-8")
        with open(out, "wb") as f:
            f.write(reskin_html(raw).encode("utf-8"))
        n += 1
    if verbose:
        print(f"بازسازی نسخه‌ی نمایشی {n} گزارش HTML با تم جدید")
    return n


if __name__ == "__main__":
    sys.exit(0 if rebuild_all() else 1)
