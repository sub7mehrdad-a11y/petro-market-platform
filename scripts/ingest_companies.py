"""
یکدست‌سازی فایل‌های اکسل «لیست شرکت‌ها» (که ستون‌هاشون بین کشورها کمی فرق داره)
به یک اسکیمای مشترک در data/companies.json.

چرا اینجا از هوش مصنوعی استفاده نشده: چون داده از قبل جدولیه (اکسل تمیز)،
فقط اسم ستون‌ها فرق می‌کنه — یک نگاشت دستی ساده کافی و قابل‌اعتمادتر از AI هست.

برای اضافه‌کردن کشور جدید: یک ردیف به SOURCES اضافه کن (مسیر فایل + کشور).
اگه ستون‌های اکسل جدید اسم متفاوتی داشتن، به COLUMN_ALIASES اضافه کن.
"""

import os
import re
import json

import openpyxl

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
REPORTS_SRC_DIR = os.path.join(BASE_DIR, "گزارش", "لیست شرکتها")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "companies.json")

SOURCES = [
    {"file": "Brazil_Companies.xlsx", "country": "برزیل"},
    {"file": "Jordan_Companies.xlsx", "country": "اردن"},
    {"file": "kenya_Companies.xlsx", "country": "کنیا"},
    {"file": "شرکت های عراقی.xlsx", "country": "عراق"},
    {"file": "Syria_companies.xlsx", "country": "سوریه"},
]

# چون سرستون‌ها بین فایل‌ها فرق می‌کنن (مثلاً "آدرس" در فارسی یا "Address" در
# انگلیسی، یا با توضیح فارسی داخل پرانتز)، با کلیدواژه تشخیص می‌دیم نه تطابق دقیق.
FIELD_KEYWORDS = {
    "english_name": ["english name"],
    "arabic_name": ["arabic name"],
    "industry": ["industry", "صنعت"],
    "target_grade": ["target grade", "گرید هدف"],
    "purchasing_potential": ["purchasing potential", "پتانسیل خرید"],
    "action_plan": ["action plan", "برنامه اقدام"],
    "address": ["address", "آدرس"],
    "phone": ["phone", "شماره تماس", "تلفن"],
    "email": ["email", "ایمیل"],
    "website": ["website", "وب‌سایت", "وبسایت"],
}


def map_headers(header_row):
    mapping = {}  # column index -> field name
    for idx, cell in enumerate(header_row):
        if not cell:
            continue
        cell_lower = str(cell).lower()
        for field, keywords in FIELD_KEYWORDS.items():
            if any(kw in cell_lower for kw in keywords):
                mapping[idx] = field
                break
    return mapping


def clean_value(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return str(v).strip()


def load_companies(path, country):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    header_map = map_headers(rows[0])
    companies = []
    for row in rows[1:]:
        if not any(row):
            continue
        record = {"country": country}
        for idx, field in header_map.items():
            if idx < len(row):
                record[field] = clean_value(row[idx])
        if not record.get("english_name"):
            continue
        companies.append(record)
    return companies


def main():
    all_companies = []
    for src in SOURCES:
        path = os.path.join(REPORTS_SRC_DIR, src["file"])
        if not os.path.exists(path):
            print(f"[WARN] فایل پیدا نشد: {path}")
            continue
        companies = load_companies(path, src["country"])
        print(f"[OK] {src['country']}: {len(companies)} شرکت")
        all_companies.extend(companies)

    for i, c in enumerate(all_companies, start=1):
        c["id"] = f"company-{i}"

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_companies, f, ensure_ascii=False, indent=2)

    print(f"\n[DONE] مجموعاً {len(all_companies)} شرکت در {OUTPUT_FILE} ذخیره شد.")


if __name__ == "__main__":
    main()
