"""
ربات روزانه‌ی اخبار و تحلیل بازار جوش شیرین/پتروشیمی.

منطق کار:
  1. متن خام چند صفحه‌ی خبری/تجاری تأییدشده (بعد از حذف تگ HTML) رو با یک
     درخواست HTTP ساده می‌گیره (نه از طریق ابزار جست‌وجوی گوگل — دلیلش رو
     توی price_intelligence_bot.py بخون: آزمایش شد و روی کلیدهای رایگان تازه‌ساز
     با خطای quota مواجه می‌شه).
  2. از Gemini می‌خواد بر اساس همون متن‌ها یک یادداشت تحلیلی کوتاه (فارسی) بنویسه که:
       - خلاصه‌ی خبر رو به زبان خودش بیان کنه (نه کپی مستقیم از متن اصلی)
       - ربطش به وضعیت شرکت (قیمت پایه‌ی FOB ۲۵۰ دلار، رقیب اصلی ترکیه) رو توضیح بده
       - منبع هر نکته رو ذکر کنه (نام رسانه + لینک)
  3. خروجی رو به‌صورت یک رکورد در یک فایل JSON ذخیره می‌کنه تا سایت ازش بخونه.

نیازمندی‌ها:
  - یک GEMINI_API_KEY معتبر (به‌صورت متغیر محیطی تنظیم کن، هرگز داخل کد ننویس —
    از aistudio.google.com رایگان و بدون کارت اعتباری بگیر)
  - pip install -r requirements.txt

نکته‌ی حق‌نشر: این اسکریپت عمداً طوری پرامپت شده که فقط خلاصه/تحلیل تولید کنه،
نه بازتولید کامل متن خبر؛ همیشه لینک منبع رو نگه‌دار تا کاربر نهایی بتونه
به مقاله‌ی اصلی مراجعه کنه.
"""

import os
import re
import sys
import json
from datetime import datetime, timezone

from google import genai

from fetch_utils import fetch_sources, build_sources_block

# کنسول ویندوز پیش‌فرضش cp1252 هست که فارسی رو نمی‌تونه چاپ کنه؛ لینوکس/گیت‌هاب
# اکشنز این مشکل رو نداره ولی این خط بی‌ضرره و روی هر پلتفرمی امنه.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GEMINI_MODEL = "gemini-3.6-flash"

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "news_analysis_log.json")

# منابع seed برای اخبار/تحلیل — نقطه‌ی شروع، نه فهرست بسته. هر منبع جدید معتبر
# و بدون‌لاگینی که پیدا کردید همین‌جا اضافه کنید.
SEED_NEWS_SOURCES = [
    "https://www.dailysabah.com/business",  # اقتصاد/صادرات ترکیه
    "https://tradingeconomics.com/commodity/soda-ash",  # سیگنال قیمت + تحلیل کوتاه
    "https://chemxplore.com/countries/turkey",  # اخبار صنعت شیمیایی ترکیه
    "https://www.chemeurope.com/en/news/",  # اخبار عمومی صنعت شیمی (رایگان، تست‌شده)
    "https://oilprice.com/Latest-Energy-News/World-News/",  # انرژی/کشتیرانی/ژئوپلیتیک جهانی (خیلی فعال، رایگان)
]

# آرگوس (argusmedia.com) عمداً اینجا نیست: صفحه‌ی اخبارش کاملاً با جاوااسکریپت
# رندر می‌شه (fetch مستقیم فقط منوی ناوبری رو برمی‌گردونه، نه مقاله)، RSS هم نداره،
# و پشت همون سیستم ضدربات Incapsula هست که ICIS رو هم بلاک کرده — یعنی واقعاً غیرقابل‌
# دسترسیه با fetch ساده، نه فقط یک محدودیت فرضی.

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

من متن خام چند صفحه‌ی خبری/تجاری (بعد از حذف تگ HTML) رو در اختیارت می‌ذارم.
فقط بر اساس همین متن‌ها (نه دانش قبلی خودت)، یک یادداشت تحلیلی کوتاه (حداکثر
۲۵۰ کلمه) به فارسی بنویس که:
- مهم‌ترین نکته‌ی خبری/قیمتی مرتبط با جوش شیرین/سودا اش/ترکیه رو با زبان خودت
  خلاصه کنه (هرگز جمله‌ی کامل از منبع کپی نکن؛ نقل‌قول مستقیم فقط اگر ضروریه
  و زیر ۱۵ کلمه باشه)
- تاثیر احتمالیش روی استراتژی صادراتی شرکت (نسبت به قیمت پایه‌ی ۲۵۰ دلار و رقابت
  با ترکیه) رو توضیح بده
- اگر توی متن‌ها هیچ خبر مرتبطی نبود، صادقانه همین رو در analysis_fa بگو؛ چیزی
  از خودت اختراع نکن
- در انتها، فقط منابعی که واقعاً ازشون استفاده کردی رو به‌صورت یک آرایه‌ی جدا
  (نه توی متن) با نام رسانه و لینک فهرست کن
- یک تیتر کوتاه (حداکثر ۱۲ کلمه) و خبری برای همین تحلیل هم بساز؛ این تیتر جدا
  از analysis_fa ذخیره می‌شه و توی لیست خبرهای سایت نشون داده می‌شه

خروجی رو دقیقاً به این شکل JSON بده (بدون markdown fence، بدون توضیح اضافه):
{{
  "headline_fa": "تیتر کوتاه...",
  "analysis_fa": "...",
  "sources": [{{"name": "...", "url": "..."}}]
}}
"""


def run_daily_analysis(client: genai.Client, sources_block: str) -> str:
    query_text = f"بر اساس متن‌های زیر تحلیل امروز رو بنویس:\n\n{sources_block}"

    interaction = client.interactions.create(
        model=GEMINI_MODEL,
        system_instruction=SYSTEM_PROMPT,
        input=query_text,
    )

    return interaction.output_text


def parse_output(raw_text: str) -> dict:
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

    fetched = fetch_sources(SEED_NEWS_SOURCES)
    sources_block = build_sources_block(fetched)

    client = genai.Client(api_key=api_key)
    raw_text = run_daily_analysis(client, sources_block)
    parsed = parse_output(raw_text)

    record = {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "headline_fa": parsed.get("headline_fa", ""),
        "analysis_fa": parsed.get("analysis_fa", ""),
        "sources": parsed.get("sources", []),
    }

    append_to_log(record)
    print(f"[OK] تحلیل {record['date']} ذخیره شد.")


if __name__ == "__main__":
    main()
