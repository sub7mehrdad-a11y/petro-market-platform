"""
ایجنت روزانه‌ی رصد اختصاصی ترکیه (مهم‌ترین رقیب صادراتی سپهران شیمی).

با ایجنت خبری عمومی (news_analysis_bot.py) فرق دارد: این یکی فقط ترکیه را رصد
می‌کند و خروجی‌اش دسته‌بندی‌شده است — به‌جای یک یادداشت تحلیلی واحد، سه دسته
جدا تولید می‌کند تا در صفحه‌ی «تحلیل رقبا ← ترکیه» در بخش‌های مجزا نمایش داده شود:

  1. company_updates  — اطلاعیه/خبر منتشرشده در سایت خود شرکت‌های رقیب ترک
  2. logistics_updates — اخبار حمل‌ونقل، کرایه‌ی بار و لجستیک صادراتی ترکیه
  3. market_note       — یادداشت تحلیلی کوتاه درباره‌ی معنای این‌ها برای ما

منابع (همه تست‌شده و بدون لاگین):
  - wesoda.com  : مالک اتی‌سودا و کازان‌سودا؛ تنها منبعی که هزینه‌ی نقدی تولید
                  واقعی ترکیه را رسماً افشا می‌کند (گزارش‌های فصلی).
  - etisoda.com / kazansoda.com : سایت خود دو کارخانه.
  - utikad.org.tr : انجمن حمل‌ونقل و لجستیک بین‌المللی ترکیه.
  - hurriyetdailynews.com : اقتصاد ترکیه به انگلیسی.
  - dailysabah.com/business : اقتصاد/صادرات ترکیه.

نکته: سایت شیشه‌جام (sisecam.com) با خطای 403 دسترسی خودکار را می‌بندد، پس عمداً
در فهرست نیست — به‌جای اینکه هر روز یک fetch شکست‌خورده تولید کند.

خروجی: data/turkey_watch_log.json
"""

import os
import re
import sys
import json
from datetime import datetime, timezone

from google import genai

from fetch_utils import fetch_sources, build_sources_block

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GEMINI_MODEL = "gemini-3.6-flash"

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "turkey_watch_log.json")

# سایت خود شرکت‌های رقیب ترک
COMPANY_SOURCES = [
    "https://www.wesoda.com/media/",
    "https://www.wesoda.com/investors/",
    "https://www.etisoda.com/",
    "https://www.kazansoda.com/",
]

# حمل‌ونقل / لجستیک / اقتصاد ترکیه
LOGISTICS_SOURCES = [
    "https://www.utikad.org.tr/en",
    "https://www.hurriyetdailynews.com/index/economy",
    "https://www.dailysabah.com/business",
]

COMPANY_CONTEXT = """
شرکت ما (سپهران شیمی) تولیدکننده‌ی ایرانی جوش شیرین (سدیم بی‌کربنات، برند «جوش شیرین پارس»،
کد تعرفه HS 283630) است. قیمت پایه‌ی مرجع FOB صادراتی ما حدود ۲۵۰ دلار بر تن است.

ترکیه مهم‌ترین رقیب صادراتی ماست. تولیدکنندگان کلیدی ترک:
  - اتی‌سودا (Eti Soda) و کازان‌سودا (Kazan Soda Elektrik) — هر دو متعلق به WE Soda / گروه سینر،
    با فناوری استخراج محلول ترونای طبیعی و هزینه‌ی نقدی تولید ۸۳.۲ دلار بر تن (۲۰۲۴).
  - سودا سانایی (Soda Sanayii، گروه شیشه‌جام) در مرسین، با فرآیند سنتتیک سُلوِه و هزینه‌ی
    برآوردی ۱۵۰ تا ۱۹۰ دلار بر تن.
ترکیه بیش از ۹۰٪ واردات جوش شیرین عراق را تأمین می‌کند (مزیت لجستیک زمینی از مرز هابور).
"""

SYSTEM_PROMPT = f"""
تو یک تحلیلگر رقابتی برای بخش تحقیق و توسعه‌ی بازرگانی یک تولیدکننده‌ی ایرانی جوش شیرین هستی
و وظیفه‌ات رصد اختصاصی رقیب اصلی، یعنی ترکیه، است.

زمینه:
{COMPANY_CONTEXT}

من متن خام چند صفحه‌ی وب (سایت خود شرکت‌های رقیب ترک + منابع حمل‌ونقل و اقتصاد ترکیه،
بعد از حذف تگ HTML) را در اختیارت می‌گذارم. فقط بر اساس همین متن‌ها (نه دانش قبلی خودت)
یک خروجی JSON بساز.

قوانین اجباری:
1. فقط چیزی را گزارش کن که واقعاً در متن‌ها هست. اگر دسته‌ای خالی بود، آرایه‌ی خالی برگردان —
   چیزی از خودت اختراع نکن.
2. هرگز جمله‌ی کامل از منبع کپی نکن؛ با زبان خودت خلاصه کن (نقل‌قول مستقیم فقط اگر ضروری
   و زیر ۱۵ کلمه).
3. هر آیتم باید source_url داشته باشد — دقیقاً همان URL که متنش زیرش آمده.
4. در دسته‌ی company_updates فقط خبر/اطلاعیه‌ی مربوط به شرکت‌های رقیب ترک را بیاور
   (توسعه‌ی ظرفیت، نتایج مالی، قیمت‌گذاری، سرمایه‌گذاری، پایداری/کربن).
5. در دسته‌ی logistics_updates فقط چیزهای مرتبط با حمل‌ونقل، کرایه‌ی بار، بنادر، گذرگاه‌های
   مرزی و لجستیک صادراتی ترکیه را بیاور.

خروجی را دقیقاً به این شکل JSON بده (بدون markdown fence، بدون توضیح اضافه):
{{
  "headline_fa": "تیتر کوتاه (حداکثر ۱۲ کلمه) از مهم‌ترین یافته‌ی امروز درباره‌ی ترکیه",
  "company_updates": [
    {{"company": "نام شرکت", "headline": "تیتر کوتاه", "summary": "خلاصه با زبان خودت", "source_url": "..."}}
  ],
  "logistics_updates": [
    {{"headline": "تیتر کوتاه", "summary": "خلاصه با زبان خودت", "source_url": "..."}}
  ],
  "market_note": "یادداشت تحلیلی حداکثر ۲۰۰ کلمه: این یافته‌ها برای استراتژی صادراتی ما (قیمت پایه‌ی ۲۵۰ دلار، رقابت با ترکیه) چه معنایی دارند؟ اگر امروز خبر مهمی نبود، صادقانه همین را بگو.",
  "sources": [{{"name": "نام منبع", "url": "..."}}]
}}
"""


def extract_json_object(text: str) -> dict:
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    raw = fence.group(1) if fence else text
    obj = re.search(r"\{.*\}", raw, re.DOTALL)
    if not obj:
        raise ValueError("پاسخ مدل شامل JSON object نبود:\n" + text[:500])
    return json.loads(obj.group(0))


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

    print("--- منابع شرکتی ---")
    company_fetched = fetch_sources(COMPANY_SOURCES, max_chars=5000)
    print("--- منابع لجستیک/اقتصاد ---")
    logistics_fetched = fetch_sources(LOGISTICS_SOURCES, max_chars=5000)

    block = (
        "### بخش الف — سایت شرکت‌های رقیب ترک ###\n"
        + build_sources_block(company_fetched)
        + "\n\n### بخش ب — حمل‌ونقل و اقتصاد ترکیه ###\n"
        + build_sources_block(logistics_fetched)
    )

    client = genai.Client(api_key=api_key)
    interaction = client.interactions.create(
        model=GEMINI_MODEL,
        system_instruction=SYSTEM_PROMPT,
        input=block,
    )

    try:
        parsed = extract_json_object(interaction.output_text)
    except (ValueError, json.JSONDecodeError) as e:
        print(f"[ERROR] {e}")
        raise SystemExit(1)

    record = {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "headline_fa": parsed.get("headline_fa", ""),
        "company_updates": parsed.get("company_updates", []),
        "logistics_updates": parsed.get("logistics_updates", []),
        "market_note": parsed.get("market_note", ""),
        "sources": parsed.get("sources", []),
    }

    append_to_log(record)
    print(
        f"\n[OK] رصد ترکیه {record['date']} ذخیره شد — "
        f"{len(record['company_updates'])} خبر شرکتی، "
        f"{len(record['logistics_updates'])} خبر لجستیکی."
    )


if __name__ == "__main__":
    main()
