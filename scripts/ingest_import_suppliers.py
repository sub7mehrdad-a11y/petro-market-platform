"""
ETL برای فایل‌های «فهرست بازارهای تأمین‌کننده» ITC Trade Map — یعنی واردات یک
کشور مشخص، به تفکیک کشور مبدأ.

تفاوتش با ingest_trade_map.py: آن اسکریپت فقط سرجمع جهانی هر کشور را دارد
(چقدر صادر/وارد کرد)، ولی این یکی رابطه‌ی **دوطرفه** می‌دهد — چه کسی به این
کشور می‌فروشد، با چه سهمی، چه قیمتی و با چه تعرفه‌ای. همان چیزی که تا امروز
فقط از متن گزارش‌های تحلیلی (با استخراج هوش مصنوعی) داشتیم و حالا مستقیم از
منبع رسمی می‌آید.

نام‌گذاری فایل‌ها: هر فایل مربوط به یک کشور واردکننده است و اسم کشور از خود
نام فایل خوانده می‌شود:
    Trade_Map_-_List_of_supplying_markets_for_the_product_imported_by_<کشور>_in_<سال>.xls
برای اضافه‌کردن کشور جدید فقط فایلش را در همان پوشه بگذارید — نیازی به تغییر
کد نیست.

نکته‌ی مهم درباره‌ی ستون تعرفه: «میانگین تعرفه‌ی اعمالی توسط کشور واردکننده بر
آن مبدأ» است. برای ارمنستان، روسیه ۰٪ و ایران ۵٪ می‌دهد — یعنی مزیت تعرفه‌ای
روسیه (عضویت در اتحادیه‌ی اقتصادی اوراسیا) که در گزارش تحلیلی توضیح داده شده،
این‌جا با عدد رسمی تأیید می‌شود.

خروجی: data/import_suppliers.json
"""

import os
import re
import json
import glob

from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
SRC_DIR = os.path.join(BASE_DIR, "گزارش", "تجارت جهانی")
NAME_MAP_FILE = os.path.join(os.path.dirname(__file__), "country_name_map.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "import_suppliers.json")

FILE_PATTERN = "Trade_Map_-_List_of_supplying_markets_for_the_product_imported_by_*.xls"
NAME_RE = re.compile(r"imported_by_(.+?)_in_(\d{4})", re.IGNORECASE)

# ستون‌های جدول (اندیس صفرمبنا، بعد از نام کشور در ستون ۰)
COL = {
    "value_usd_k": 1,
    "share_pct": 3,
    "quantity": 4,
    "quantity_unit": 5,
    "unit_value_usd": 6,
    "growth_value_5y_pct": 7,
    "growth_value_1y_pct": 9,
    "tariff_pct": 15,
}


def to_number(s):
    s = (s or "").strip()
    if not s or s.lower() in ("no quantity", "n/a", "-"):
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def parse_supplier_table(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    table = soup.find_all("table")[5]
    rows = table.find_all("tr")

    data = {}
    for row in rows[1:]:
        cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
        # ردیف سرستون دوم (که با «Value imported…» شروع می‌شود) کشور نیست
        if not cells or not cells[0] or cells[0].startswith("Value imported"):
            continue
        data[cells[0]] = cells
    return data


def build_supplier(cells, name_map):
    eng = cells[0]
    mapping = name_map.get(eng) or {}
    return {
        "name_en": eng,
        "country": mapping.get("fa") or eng,
        "iso2": mapping.get("iso2"),
        "value_usd_k": to_number(cells[COL["value_usd_k"]]) if len(cells) > COL["value_usd_k"] else None,
        "share_pct": to_number(cells[COL["share_pct"]]) if len(cells) > COL["share_pct"] else None,
        "quantity": to_number(cells[COL["quantity"]]) if len(cells) > COL["quantity"] else None,
        "quantity_unit": (cells[COL["quantity_unit"]] or None) if len(cells) > COL["quantity_unit"] else None,
        "unit_value_usd": to_number(cells[COL["unit_value_usd"]]) if len(cells) > COL["unit_value_usd"] else None,
        "growth_value_5y_pct": to_number(cells[COL["growth_value_5y_pct"]]) if len(cells) > COL["growth_value_5y_pct"] else None,
        "growth_value_1y_pct": to_number(cells[COL["growth_value_1y_pct"]]) if len(cells) > COL["growth_value_1y_pct"] else None,
        "tariff_pct": to_number(cells[COL["tariff_pct"]]) if len(cells) > COL["tariff_pct"] else None,
    }


def main():
    with open(NAME_MAP_FILE, "r", encoding="utf-8") as f:
        name_map = json.load(f)

    files = sorted(glob.glob(os.path.join(SRC_DIR, FILE_PATTERN)))
    if not files:
        raise SystemExit(f"هیچ فایلی با الگوی «{FILE_PATTERN}» در {SRC_DIR} پیدا نشد.")

    profiles = {}
    for path in files:
        match = NAME_RE.search(os.path.basename(path))
        if not match:
            print(f"[WARN] نام کشور از فایل خوانده نشد: {os.path.basename(path)}")
            continue

        importer_en = match.group(1).replace("_", " ")
        year = int(match.group(2))
        importer_mapping = name_map.get(importer_en) or {}
        importer_fa = importer_mapping.get("fa") or importer_en

        rows = parse_supplier_table(path)
        world = rows.pop("World", None)

        suppliers = []
        for cells in rows.values():
            s = build_supplier(cells, name_map)
            # ردیف‌هایی که اصلاً ارزش واردات ندارند (فقط ستون‌های جانبی پرشده)
            # یک تأمین‌کننده‌ی واقعی نیستند.
            if s["value_usd_k"]:
                suppliers.append(s)

        suppliers.sort(key=lambda s: s["value_usd_k"], reverse=True)

        profiles[importer_fa] = {
            "importer_en": importer_en,
            "year": year,
            "total": {
                "value_usd_k": to_number(world[COL["value_usd_k"]]) if world else None,
                "quantity": to_number(world[COL["quantity"]]) if world else None,
                "quantity_unit": (world[COL["quantity_unit"]] or None) if world else None,
                "unit_value_usd": to_number(world[COL["unit_value_usd"]]) if world else None,
            },
            "suppliers": suppliers,
        }
        print(f"[OK] {importer_fa} ({year}): {len(suppliers)} تأمین‌کننده")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)

    print(f"\n[DONE] تفکیک مبدأ واردات {len(profiles)} کشور در {OUTPUT_FILE} ذخیره شد.")


if __name__ == "__main__":
    main()
