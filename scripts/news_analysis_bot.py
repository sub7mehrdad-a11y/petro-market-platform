"""
ربات روزانه‌ی اخبار و تحلیل بازار جوش شیرین/پتروشیمی.

منطق کار:
  1. با استفاده از ابزار Grounding with Google Search داخل Gemini API، آخرین
     اخبار/تحلیل‌های منابع معتبر تجاری-پتروشیمی رو جست‌وجو می‌کنه (فقط
     عنوان/خلاصه رو می‌بینه، نه متن کامل مقالات پولی).
  2. از مدل می‌خواد یک یادداشت تحلیلی کوتاه (فارسی) بنویسه که:
       - خلاصه‌ی خبر رو به زبان خودش بیان کنه (نه کپی مستقیم از متن اصلی)
       - ربطش به وضعیت شرکت (قیمت پایه‌ی FOB ۲۵۰ دلار، رقیب اصلی ترکیه) رو توضیح بده
       - منبع هر نکته رو ذکر کنه (نام رسانه + لینک)
  3. خروجی رو به‌صورت یک رکورد در یک فایل JSON ذخیره می‌کنه تا سایت ازش بخونه.

نیازمندی‌ها:
  - یک GEMINI_API_KEY معتبر (به‌صورت متغیر محیطی تنظیم کن، هرگز داخل کد ننویس —
    از aistudio.google.com رایگان و بدون کارت اعتباری بگیر)
  - pip install google-genai

نکته‌ی حق‌نشر: این اسکریپت عمداً طوری پرامپت شده که فقط خلاصه/تحلیل تولید کنه،
نه بازتولید کامل متن خبر؛ همیشه لینک منبع رو نگه‌دار تا کاربر نهایی بتونه
به مقاله‌ی اصلی مراجعه کنه.
"""

import os
import json
from datetime import datetime, timezone

from google import genai

GEMINI_MODEL = "gemini-3.6-flash"

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "news_analysis_log.json")

# این کوئری‌ها رو متناسب با محصولات و بازارهای مهم شرکت تنظیم کن
SEARCH_TOPICS = [
    "sodium bicarbonate export price news",
    "Turkey soda ash sodium bicarbonate market",
    "caustic soda flakes price news",
    "ammonium sulfate fertilizer export news",
]

# منابع seed برای اخبار/تحلیل — نقطه‌ی شروع، نه فهرست بسته.
SEED_NEWS_SOURCES = [
    "icis.com",
    "dailysabah.com",
    "chemxplore.com",
    "tradingeconomics.com",
]

COMPANY_CONTEXT = """
شرکت ما تولیدکننده‌ی جوش شیرین (سدیم بی‌کربنات، برند "جوش شیرین پارس"، کد تعرفه HS 283630)،
سود پرک، و کود آمونیوم سولفات است.
قیمت پایه‌ی مرجع FOB برای جوش شیرین صادراتی حدود ۲۵۰ دلار بر تن است.
مهم‌ترین رقیب صادراتی، ترکیه است.
"""

SYSTEM_PROMPT = f"""
تو یک تحلیلگر بازار محصولات پتروشیمی/شیمیایی برای بخش تحقیق و توسعه‌ی بازرگانی یک
شرکت تولیدکننده‌ی جوش شیرین هستی.

زمینه‌ی شرکت:
{COMPANY_CONTEXT}

وظیفه: بر اساس نتایج جست‌وجوی وب که در اختیارت قرار می‌گیره (با اولویت منابع رایگان
و بدون لاگین مثل {", ".join(SEED_NEWS_SOURCES)}، ولی هر منبع معتبر دیگه‌ای هم که پیدا
کردی قابل استفاده‌ست)، یک یادداشت تحلیلی کوتاه (حداکثر ۲۵۰ کلمه) به فارسی بنویس که:
- مهم‌ترین نکته‌ی خبری/قیمتی رو با زبان خودت خلاصه کنه (هرگز جمله‌ی کامل از منبع
  کپی نکن؛ نقل‌قول مستقیم فقط اگر ضروریه و زیر ۱۵ کلمه باشه)
- تاثیر احتمالیش روی استراتژی صادراتی شرکت (نسبت به قیمت پایه‌ی ۲۵۰ دلار و رقابت
  با ترکیه) رو توضیح بده
- در انتها، منابع استفاده‌شده رو به‌صورت یک آرایه‌ی جدا (نه توی متن) با نام رسانه و لینک فهرست کن

خروجی رو دقیقاً به این شکل JSON بده (بدون markdown fence، بدون توضیح اضافه):
{{
  "analysis_fa": "...",
  "sources": [{{"name": "...", "url": "..."}}]
}}
"""


def run_daily_analysis(client: genai.Client) -> str:
    query_text = "خلاصه و تحلیل امروز را بر اساس این موضوعات جست‌وجو کن: " + "، ".join(SEARCH_TOPICS)

    interaction = client.interactions.create(
        model=GEMINI_MODEL,
        system_instruction=SYSTEM_PROMPT,
        input=query_text,
        tools=[{"type": "google_search"}],
    )

    return interaction.output_text


def parse_output(raw_text: str) -> dict:
    import re

    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
    raw = fence_match.group(1) if fence_match else raw_text

    obj_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not obj_match:
        # اگه parsing شکست خورد، لااقل متن خام رو گم نکن
        return {"analysis_fa": raw_text.strip(), "sources": []}

    try:
        return json.loads(obj_match.group(0))
    except json.JSONDecodeError:
        return {"analysis_fa": raw_text.strip(), "sources": []}


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
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY تنظیم نشده است.")

    client = genai.Client(api_key=api_key)
    raw_text = run_daily_analysis(client)
    parsed = parse_output(raw_text)

    record = {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "analysis_fa": parsed.get("analysis_fa", ""),
        "sources": parsed.get("sources", []),
    }

    append_to_log(record)
    print(f"[OK] تحلیل {record['date']} ذخیره شد.")


if __name__ == "__main__":
    main()
