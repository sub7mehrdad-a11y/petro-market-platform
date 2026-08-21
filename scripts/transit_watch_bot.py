"""
ایجنت رصد کانال‌های تلگرامی اعلام‌بار/کرایه‌ی ترانزیت — برای بخش «تحلیل ترانزیت»
سایت. کانال‌ها را می‌خواند (پیش‌نمایش وب عمومی t.me/s/...، بدون نیاز به لاگین)
و با Groq پست‌های واقعی حاوی مسیر/کرایه را به یک ساختار داده‌ای تبدیل می‌کند.

چرا فقط این دو کانال (نه هر ۶ تایی که کاربر پیشنهاد داده بود): بقیه یا اصلاً
پیش‌نمایش عمومی ندارن، یا سال‌ها غیرفعال بودن (بررسی مستقیم، ۲۰۲۶-۰۸-۲۱) —
فقط amintara50 و jadeh_app واقعاً فعال و به‌روز بودن.

چرا Groq (نه Gemini): این کار پردازش متنی سنگین و مکرره (ده‌ها پست هر بار)،
از سهمیه‌ی جدا و مستقل Groq استفاده می‌کنه تا فشاری به سهمیه‌ی Gemini
(ایجنت‌های قیمت/خبر/رصد رقبا) اضافه نکنه.

صداقت داده: هر پستی که مبلغ کرایه‌ی صریح نداشت، با price_amount=null ذخیره
می‌شه (نه حدس زده می‌شه، نه حذف می‌شه — همچنان به‌عنوان یک «مسیر فعال» ارزشمنده).

خروجی: data/transit_log.json
"""

import os
import re
import sys
import json
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from fetch_utils import fetch_page_text
from transit_geo import distance_between_places
from groq_utils import groq_generate

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "transit_log.json")

CHANNELS = [
    {"handle": "amintara50", "name": "اعلام بار آسیای میانه و روسیه", "url": "https://t.me/s/amintara50"},
    {"handle": "jadeh_app", "name": "اعلام بار سراسری جاده", "url": "https://t.me/s/jadeh_app"},
]

SYSTEM_PROMPT = """
تو یک استخراج‌کننده‌ی داده برای بخش تحلیل ترانزیت و باربری یک شرکت صادراتی
ایرانی هستی. من متن خام یک کانال تلگرامی «اعلام بار» رو می‌دم (چند پست پشت
سر هم، شامل مبدأ/مقصد/تناژ/نوع بار و گاهی کرایه). فقط بر اساس همین متن یک
آرایه‌ی JSON از پست‌های واقعی «اعلام بار» بساز — تبلیغات، پیام‌های عمومی،
دعوت به عضویت، یا محتوای بی‌ربط رو نادیده بگیر.

قوانین اجباری:
1. فقط پست‌هایی که واقعاً یک مبدأ و مقصد مشخص دارن رو بردار.
2. اگه کرایه/قیمت توی پست نبود، price_amount را null بگذار — چیزی حدس نزن.
3. واحد پول را از خود متن تشخیص بده («تومان»→IRR، «$» یا «دلار»→USD)؛ اگه
   نامشخص بود null بگذار.
4. تناژ را فقط عدد بگذار (بدون واحد)؛ اگه نبود null.
5. حداکثر ۱۵ پست برجسته‌ترین/کامل‌ترین رو بردار، نه همه‌چیز.

خروجی دقیقاً این شکل (بدون markdown fence، بدون توضیح اضافه):
[
  {
    "origin": "...",
    "destination": "...",
    "cargo_type": "...",
    "vehicle_type": "...",
    "tonnage": number|null,
    "price_amount": number|null,
    "price_currency": "IRR"|"USD"|null,
    "note": "..."
  }
]
"""


def extract_json_array(text: str) -> list:
    fence = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
    raw = fence.group(1) if fence else text
    arr = re.search(r"\[.*\]", raw, re.DOTALL)
    if not arr:
        raise ValueError("پاسخ مدل شامل JSON array نبود:\n" + text[:500])
    return json.loads(arr.group(0))


def enrich_with_distance(entry: dict) -> dict:
    km = distance_between_places(entry.get("origin"), entry.get("destination"))
    entry["distance_km"] = km
    if km and entry.get("price_amount") and entry.get("tonnage"):
        entry["rate_per_ton_km"] = round(entry["price_amount"] / entry["tonnage"] / km, 4)
    else:
        entry["rate_per_ton_km"] = None
    return entry


def append_to_log(record: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    log = []
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            log = json.load(f)
    log.append(record)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)


def main():
    if not os.environ.get("GROQ_API_KEY"):
        raise SystemExit("GROQ_API_KEY تنظیم نشده است.")

    all_entries = []
    for ch in CHANNELS:
        try:
            text = fetch_page_text(ch["url"], max_chars=3500)
        except Exception as e:
            print(f"[WARN] {ch['handle']}: خطا در fetch: {e}")
            continue

        try:
            raw = groq_generate(system_instruction=SYSTEM_PROMPT, input=text, max_tokens=8000)
            entries = extract_json_array(raw)
        except Exception as e:
            print(f"[WARN] {ch['handle']}: خطا در استخراج: {e}")
            continue

        for e in entries:
            e["source_channel"] = ch["handle"]
            e["source_channel_name"] = ch["name"]
            e = enrich_with_distance(e)
            all_entries.append(e)

        print(f"[OK] {ch['handle']}: {len(entries)} پست استخراج شد")

    record = {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "entries": all_entries,
    }
    append_to_log(record)
    with_price = sum(1 for e in all_entries if e.get("price_amount"))
    print(f"\n[DONE] {len(all_entries)} پست ({with_price} با قیمت صریح) در {OUTPUT_FILE} ذخیره شد.")


if __name__ == "__main__":
    main()
