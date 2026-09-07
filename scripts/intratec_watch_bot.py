"""
ایجنت ماهانه‌ی رصد قیمت نمونه‌ی Intratec برای سدیم بی‌کربنات (جوش شیرین).

چرا ماهانه (نه روزانه مثل بقیه‌ی ربات‌ها): صفحه‌ی رایگان Intratec یک «نمونه‌ی
توضیحی» (illustrative sample) از قیمت ماهانه‌ی ۴ بازار نشان می‌دهد که خودش هم
به‌صورت ماهانه به‌روز می‌شود، نه روزانه — رصد روزانه‌اش فقط سهمیه‌ی Gemini رو
بی‌دلیل مصرف می‌کنه.

چرا با fetch ساده (نه Playwright/مرورگر): تست دستی (WebFetch) نشون داد اعداد
همین جدول توی HTML خام صفحه هم هستن (نیازی به اجرای جاوااسکریپت نیست) — دقیقاً
همون الگوی fetch_page_text که بقیه‌ی ربات‌های این پروژه استفاده می‌کنن.

منطق دوباره‌کاری نکردن: چون این «نمونه»‌ی سایت فقط یک ماه رو در لحظه نشون
می‌ده، هر بار اسکریپت اجرا می‌شه reported_month بررسی می‌شه — اگر از قبل توی
data/intratec_monthly.json بود، رکورد تکراری اضافه نمی‌شه.

نیازمندی‌ها: GEMINI_API_KEY (همون کلید مشترک بقیه‌ی ربات‌ها، چون این ماهی یک‌بار
اجرا می‌شه و فشار محسوسی به سهمیه نمی‌آره).

خروجی: data/intratec_monthly.json
"""

import os
import re
import sys
import json
from datetime import datetime, timezone

from google import genai

from fetch_utils import fetch_page_text
from env_utils import load_env

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GEMINI_MODEL = "gemini-3.6-flash"

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "intratec_monthly.json")

SOURCE_URL = "https://www.intratec.us/solutions/primary-commodity-prices/commodity/sodium-bicarbonate-prices"

SYSTEM_PROMPT = """
تو یک تحلیلگر داده‌ی قیمت محصولات پتروشیمی هستی. من متن خام صفحه‌ی نمونه‌ی رایگان
(illustrative sample) قیمت سدیم بی‌کربنات (جوش شیرین) سایت Intratec رو در اختیارت
می‌ذارم (بعد از حذف تگ HTML) — وظیفه‌ات پیدا کردن قیمت ماهانه‌ی ۴ بازار از داخل
همین متنه، نه دانش قبلی خودت یا حدس‌زدن.

بازارهای مورد نظر (دقیقاً همین ۴ تا، هرکدام به دلار به ازای هر تن متریک):
1. us_fob_export — آمریکا، FOB صادراتی
2. europe_germany_fob_export — اروپا/آلمان، FOB صادراتی
3. china_food_grade_domestic_spot_exw — چین، گرید خوراکی، اسپات داخلی، EXW
4. middle_east_turkey_fob_export — خاورمیانه/ترکیه، FOB صادراتی

قوانین اجباری:
1. فقط چیزی رو گزارش کن که واقعاً توی متن هست. اگه عددی برای یکی از بازارها پیدا
   نشد، مقدار null بذار — هرگز حدس نزن یا میانگین‌گیری نکن.
2. reported_month رو دقیقاً همون‌طور که صفحه نوشته برگردون (مثلاً "November 2025").
   اگه ماه/سال گزارش پیدا نشد، null بذار.
3. mom_change_pct یعنی درصد تغییر نسبت به ماه قبل — اگه توی متن نبود یا "NaN"/نامعتبر
   بود، null بذار.
4. اگه کلاً جدول قیمتی توی متن پیدا نشد (مثلاً صفحه عوض شده، لاگین خواسته، یا خطا
   داده)، همه‌ی مقادیر رو null بذار — چیزی از خودت اختراع نکن.

خروجی رو دقیقاً به این شکل JSON بده (بدون markdown fence، بدون توضیح اضافه):
{
  "reported_month": "November 2025",
  "prices_usd_per_mt": {
    "us_fob_export": 674,
    "europe_germany_fob_export": 577,
    "china_food_grade_domestic_spot_exw": 171,
    "middle_east_turkey_fob_export": 315
  },
  "mom_change_pct": {
    "us_fob_export": -9,
    "europe_germany_fob_export": 1,
    "china_food_grade_domestic_spot_exw": -1,
    "middle_east_turkey_fob_export": -2
  }
}
"""


def extract_json_object(text: str) -> dict:
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    raw = fence.group(1) if fence else text
    obj = re.search(r"\{.*\}", raw, re.DOTALL)
    if not obj:
        raise ValueError("پاسخ مدل شامل JSON object نبود:\n" + text[:500])
    return json.loads(obj.group(0))


def load_existing() -> list:
    if not os.path.exists(OUTPUT_FILE):
        return []
    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save(records: list):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    load_env()
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY تنظیم نشده است.")

    try:
        page_text = fetch_page_text(SOURCE_URL, max_chars=12000)
        print(f"[OK] fetched {SOURCE_URL} ({len(page_text)} chars)")
    except Exception as e:
        print(f"[ERROR] نمی‌شه صفحه رو گرفت: {e}")
        raise SystemExit(1)

    client = genai.Client(api_key=api_key)
    interaction = client.interactions.create(
        model=GEMINI_MODEL,
        system_instruction=SYSTEM_PROMPT,
        input=page_text,
    )

    try:
        parsed = extract_json_object(interaction.output_text)
    except (ValueError, json.JSONDecodeError) as e:
        print(f"[ERROR] {e}")
        raise SystemExit(1)

    reported_month = parsed.get("reported_month")
    if not reported_month:
        print("[WARN] ماه گزارش‌شده پیدا نشد — چیزی ذخیره نمی‌شه.")
        return

    records = load_existing()
    if any(r.get("reported_month") == reported_month for r in records):
        print(f"[SKIP] رکورد «{reported_month}» از قبل ثبت شده — رکورد تکراری اضافه نمی‌شه.")
        return

    record = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "source_url": SOURCE_URL,
        "reported_month": reported_month,
        "prices_usd_per_mt": parsed.get("prices_usd_per_mt", {}),
        "mom_change_pct": parsed.get("mom_change_pct", {}),
    }
    records.append(record)
    save(records)
    print(f"[OK] رکورد جدید «{reported_month}» به {OUTPUT_FILE} اضافه شد.")


if __name__ == "__main__":
    main()
