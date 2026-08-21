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
import json

from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
SRC_DIR = os.path.join(BASE_DIR, "گزارش", "تجارت جهانی")
NAME_MAP_FILE = os.path.join(os.path.dirname(__file__), "country_name_map.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "trade_map_2025.json")

EXPORTERS_FILE = "Trade_Map_-_List_of_exporters_for_the_selected_product_in_2025_(Sodium_hydrogencarbonate__sodium_bicarbonate_).xls"
IMPORTERS_FILE = "Trade_Map_-_List_of_importers_for_the_selected_product_in_2025_(Sodium_hydrogencarbonate__sodium_bicarbonate_).xls"

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

    print(f"[OK] {len(exp_rows)} صادرکننده، {len(imp_rows)} واردکننده از فایل‌ها خونده شد")

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
