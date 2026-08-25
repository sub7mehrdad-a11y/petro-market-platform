"""
ETL برای فایل‌های خروجی ITC Trade Map — «فهرست صادرکنندگان» و «فهرست
واردکنندگان» جهانی محصول (HS 283630، بی‌کربنات سدیم) برای سال ۲۰۲۵.

نکته‌ی مهم درباره‌ی فرمت فایل: با اینکه پسوندشون .xls هست، این فایل‌ها واقعاً
جدول HTML هستن (خروجی استاندارد ITC Trade Map) — نیازی به xlrd/openpyxl
نیست، مستقیم با BeautifulSoup پارس می‌شن.

این دو فایل داده‌ی **دوطرفه‌ی کشور-به-کشور ندارن** — فقط رتبه‌بندی کلی
جهانی هر کشورن (چقدر صادر/وارد کرد، نه از/به کدوم کشور). پس «۳ شریک تجاری
اول» فقط برای کشورهایی که از قبل گزارش اختصاصی و country_profiles.json
دارن معنی داره؛ این اسکریپت آمار تراز/قیمت هر کشور رو اضافه می‌کنه، نه
شریک‌های تجاری‌ش رو.

نگاشت نام انگلیسی → فارسی/ISO2 توی scripts/country_name_map.json ذخیره شده
(یک‌بار با Groq ساخته و دستی spot-check شد — چون این صرفاً ترجمه‌ی نام
کشورهاست، نه داده‌ی تجاری قابل‌اختراع). کشورهایی که توی این نگاشت iso2شون
null باشه (مثل "Other Asia, nes"، "Free Zones") یک کشور واقعی نیستن و رد
می‌شن.

خروجی: data/trade_map_2025.json — map از نام فارسی کشور به آمار صادرات/واردات.
"""

import os
import re
import json

from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
SRC_DIR = os.path.join(BASE_DIR, "گزارش", "تجارت جهانی")
NAME_MAP_FILE = os.path.join(os.path.dirname(__file__), "country_name_map.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "trade_map_2025.json")

EXPORTERS_FILE = "Trade_Map_-_List_of_exporters_for_the_selected_product_in_2025_(Sodium_hydrogencarbonate__sodium_bicarbonate_).xls"
IMPORTERS_FILE = "Trade_Map_-_List_of_importers_for_the_selected_product_in_2025_(Sodium_hydrogencarbonate__sodium_bicarbonate_).xls"

# فایل سری زمانی: ارزش صادرات هر کشور در ۲۰۲۱ تا ۲۰۲۵ (هزار دلار). برخلاف دو فایل
# بالا که یک عکس لحظه‌ای از ۲۰۲۵ هستند، این یکی روند چندساله می‌دهد — مبنای محاسبه‌ی
# «رشد سالانه‌ی مرکب» که در صفحه‌ی کشورها و رقبا نشان داده می‌شود.
TREND_FILE = "Trade_Map_-_List_of_exporters_for_the_selected_product_(Sodium_hydrogencarbonate__sodium_bicarbonate_).xls"

# ردیف‌هایی که واقعاً یک کشور نیستن (سرجمع جهانی، یا خط خراب/هدر که موقع
# پارس قبلی به‌اشتباه توی لیست کشورها افتاده بود).
SKIP_ROWS = {"World", "Value imported in 2025 (USD thousand)"}


def parse_trade_table(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        html = f.read()
    soup = BeautifulSoup(html, "html.parser")
    main_table = soup.find_all("table")[5]
    rows = main_table.find_all("tr")
    data = {}
    for row in rows[1:]:
        cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
        if not cells or not cells[0] or cells[0] in SKIP_ROWS:
            continue
        data[cells[0]] = cells
    return data


def parse_trend_table(path):
    """
    فایل سری زمانی را می‌خواند و برای هر کشور {سال: ارزش} برمی‌گرداند.

    ساختارش با دو فایل دیگر فرق دارد (جدول ششم، و سرستون‌هایش «Exported value in
    YYYY» است)، پس پارسر جدا دارد. سال‌ها از خود سرستون خوانده می‌شوند تا اگر
    سال بعد یک ستون اضافه شد، اسکریپت بدون تغییر کار کند.
    """
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    table = soup.find_all("table")[6]
    rows = table.find_all("tr")
    header = [c.get_text(strip=True) for c in rows[0].find_all(["td", "th"])]

    years = []
    for cell in header[1:]:
        match = re.search(r"(\d{4})", cell)
        years.append(int(match.group(1)) if match else None)

    data = {}
    for row in rows[1:]:
        cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
        if not cells or not cells[0]:
            continue
        series = {}
        for year, raw in zip(years, cells[1:]):
            if year is None:
                continue
            value = to_number(raw)
            if value is not None:
                series[year] = value
        if series:
            data[cells[0]] = series
    return data


def build_trend(series):
    """
    از سری {سال: ارزش} یک خلاصه‌ی قابل‌نمایش می‌سازد: سال‌ها، مقادیر، و نرخ رشد
    سالانه‌ی مرکب (CAGR) بین اولین و آخرین سال.

    چرا CAGR و نه «درصد تغییر کل»: بازار این محصول نوسانی است و مقایسه‌ی صرفِ
    اولین و آخرین سال، جهش‌های میانی را پنهان می‌کند. نرخ سالانه‌ی مرکب، رشد را
    به زبان «سالی چند درصد» می‌گوید که برای مقایسه‌ی کشورها با هم معنادار است.

    اگر سال پایه صفر یا منفی باشد CAGR بی‌معنی می‌شود؛ در آن حالت null می‌دهیم
    و چیزی از خودمان نمی‌سازیم.
    """
    if not series or len(series) < 2:
        return None

    years = sorted(series)
    first_year, last_year = years[0], years[-1]
    first_value, last_value = series[first_year], series[last_year]

    cagr = None
    if first_value and first_value > 0 and last_value > 0:
        span = last_year - first_year
        if span > 0:
            cagr = round(((last_value / first_value) ** (1 / span) - 1) * 100, 1)

    total_change = None
    if first_value and first_value > 0:
        total_change = round((last_value / first_value - 1) * 100, 1)

    return {
        "years": years,
        "values_usd_k": [series[y] for y in years],
        "first_year": first_year,
        "last_year": last_year,
        "cagr_pct": cagr,
        "total_change_pct": total_change,
    }


def to_number(s):
    s = (s or "").strip()
    if not s or s.lower() in ("no quantity", "n/a", "-"):
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def main():
    with open(NAME_MAP_FILE, "r", encoding="utf-8") as f:
        name_map = json.load(f)

    exp_rows = parse_trade_table(os.path.join(SRC_DIR, EXPORTERS_FILE))
    imp_rows = parse_trade_table(os.path.join(SRC_DIR, IMPORTERS_FILE))
    trend_rows = parse_trend_table(os.path.join(SRC_DIR, TREND_FILE))

    print(f"[OK] {len(exp_rows)} صادرکننده، {len(imp_rows)} واردکننده، {len(trend_rows)} سری زمانی از فایل‌ها خونده شد")

    profiles = {}
    skipped_no_map = []
    skipped_no_iso = []

    for eng_name in set(exp_rows) | set(imp_rows):
        mapping = name_map.get(eng_name)
        if not mapping:
            skipped_no_map.append(eng_name)
            continue
        if not mapping.get("iso2"):
            skipped_no_iso.append(eng_name)
            continue

        fa_name = mapping["fa"]
        entry = {
            "name_en": eng_name,
            "iso2": mapping["iso2"],
            "exports_2025": None,
            "imports_2025": None,
            "export_trend": build_trend(trend_rows.get(eng_name)),
        }

        er = exp_rows.get(eng_name)
        if er:
            entry["exports_2025"] = {
                "value_usd_k": to_number(er[1]),
                "trade_balance_usd_k": to_number(er[2]),
                "quantity": to_number(er[3]),
                "quantity_unit": er[4] or None,
                "unit_value_usd": to_number(er[5]),
                "growth_value_5y_pct": to_number(er[6]),
                "growth_qty_5y_pct": to_number(er[7]),
                "growth_value_1y_pct": to_number(er[8]),
                "share_world_pct": to_number(er[9]),
            }

        ir = imp_rows.get(eng_name)
        if ir:
            entry["imports_2025"] = {
                "value_usd_k": to_number(ir[1]),
                "trade_balance_usd_k": to_number(ir[2]),
                "quantity": to_number(ir[3]),
                "quantity_unit": ir[4] or None,
                "unit_value_usd": to_number(ir[5]),
                "growth_value_5y_pct": to_number(ir[6]),
                "growth_qty_5y_pct": to_number(ir[7]),
                "growth_value_1y_pct": to_number(ir[8]),
                "share_world_pct": to_number(ir[9]),
                "avg_tariff_pct": to_number(ir[11]) if len(ir) > 11 else None,
            }

        # اگه کشوری هم توی گزارش‌های اختصاصی موجود سایت (عراق/اردن/...) بود،
        # همون‌جا شریک‌های تجاری واقعی‌ش رو داریم؛ این اسکریپت به اون داده
        # دست نمی‌زنه — فقط توی وب لایه‌ی رندر این دو منبع رو کنار هم می‌ذاره.
        profiles[fa_name] = entry

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)

    print(f"\n[DONE] پروفایل تجاری {len(profiles)} کشور در {OUTPUT_FILE} ذخیره شد.")
    if skipped_no_map:
        print(f"[WARN] {len(skipped_no_map)} کشور نگاشت نداشتن: {skipped_no_map}")
    if skipped_no_iso:
        print(f"[INFO] {len(skipped_no_iso)} ردیف کشور واقعی نبودن (رد شدن): {skipped_no_iso}")


if __name__ == "__main__":
    main()
