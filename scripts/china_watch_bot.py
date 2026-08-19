"""
ایجنت روزانه‌ی رصد اختصاصی چین (بزرگ‌ترین تولیدکننده و صادرکننده‌ی جهانی جوش شیرین).

دقیقاً هم‌ساختار با scripts/turkey_watch_bot.py — رصد جدا از ایجنت خبری عمومی
(news_analysis_bot.py)، با خروجی دسته‌بندی‌شده برای بخش «تحلیل رقبا ← چین»:

  1. company_updates  — اطلاعیه/خبر منتشرشده در سایت خود تولیدکنندگان چینی
  2. logistics_updates — اخبار حمل‌ونقل دریایی، کرایه‌ی کانتینر و صادرات چین
  3. market_note       — یادداشت تحلیلی کوتاه درباره‌ی معنای این‌ها برای ما

منابع (همه با fetch مستقیم تست شدند، بدون نیاز به لاگین):
  - shandong-haihua.net/news.html : وب‌سایت شاندونگ های‌هوا (Shandong Haihua Group،
    نماد بورسی 000822.SZ)، بزرگ‌ترین تولیدکننده‌ی دولتی سودا اش/جوش شیرین با
    پروژه‌ی جدید ۲۰۰ هزار تنی جوش شیرین در حال ساخت. صفحه‌ی اخبار واقعی و به‌روز دارد.
  - en.haihua.com.cn : دامنه‌ی رسمی دیگر همین شرکت — نسخه‌ی HTTPS‌اش گواهی نامعتبر
    داره (cert mismatch با cloudfront)، ولی خود سایت روی HTTP ساده (بدون https)
    با کد ۲۰۰ در دسترسه؛ عمداً با http:// (نه https://) فراخوانی می‌شه.
  - en.chinayuhuagroup.com : وب‌سایت رسمی گروه یوهوا/آیجی (Hunan Yuhua / Aijie)،
    یکی از دو تولیدکننده‌ی موجود در data/competitors.json['china']. همین مشکل
    گواهی HTTPS رو داره (expired)، پس با http:// فراخوانی می‌شه.
  - globaltimes.cn/business : اقتصاد/تجارت چین به انگلیسی (رسانه‌ی دولتی، ولی
    بدون لاگین و با محتوای واقعی).
  - gcaptain.com/tag/container-freight-rates : اخبار نرخ کرایه‌ی کانتینری جهانی،
    با پوشش منظم مسیرهای صادراتی چین.
  - container-news.com : اخبار صنعت کشتیرانی/لجستیک، شامل به‌روزرسانی‌های نرخ و
    شاخص‌های حمل کانتینری (SCFI/CCFI) که مستقیماً به صادرات چین مربوطن.

نکته: برخلاف تصور اولیه، بازار چین هم مثل ترکیه متمرکزه — «شیمیایی بویان» (ex-یوان‌شینگ
انرژی، کد بورسی SZ:000683) به‌تنهایی ~۴۰-۵۰٪ ظرفیت جوش شیرین چین رو داره (تحقیق کاربر،
۲۰۲۶-۰۸-۱۹؛ ثبت شده توی data/competitors.json). هنوز توی این رصد نیست چون فقط صفحه‌ی
«درباره‌ی ما»ش (yuanxing.chinacoal.com/col/col2412) تست fetch شد، نه یک صفحه‌ی اخبار/
اطلاعیه‌ی واقعی — قبل از افزودنش به COMPANY_SOURCES، باید صفحه‌ی اخبار واقعی سایت پیدا
و fetch‌پذیریش تأیید بشه. این مهم‌ترین آیتم بعدی برای تکمیل این رصده.

خروجی: data/china_watch_log.json
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
OUTPUT_FILE = os.path.join(DATA_DIR, "china_watch_log.json")

# سایت خود تولیدکنندگان چینی — دو موردی که https‌شون مشکل گواهی داره عمداً با
# http:// فراخوانی می‌شن (fetch_utils از urllib ساده استفاده می‌کنه، نه یک
# کلاینت که خودش http رو به https ارتقا بده، پس این‌جا مشکلی پیش نمی‌آد).
COMPANY_SOURCES = [
    "https://www.shandong-haihua.net/news.html",
    "http://en.haihua.com.cn/product_1/4.html",
    "http://www.en.chinayuhuagroup.com/",
]

# حمل‌ونقل دریایی / کرایه‌ی کانتینر / اقتصاد صادراتی چین
LOGISTICS_SOURCES = [
    "https://www.globaltimes.cn/business/",
    "https://gcaptain.com/tag/container-freight-rates/",
    "https://www.container-news.com/",
]

COMPANY_CONTEXT = """
شرکت ما (سپهران شیمی) تولیدکننده‌ی ایرانی جوش شیرین (سدیم بی‌کربنات، برند «جوش شیرین پارس»،
کد تعرفه HS 283630) است. قیمت پایه‌ی مرجع FOB صادراتی ما حدود ۲۵۰ دلار بر تن است.

چین بزرگ‌ترین تولیدکننده و صادرکننده‌ی جهانی جوش شیرین است (~۲۲۴ میلیون دلار صادرات
در ۲۰۲۴، حدود ۲۰٪ بازار جهانی)، ولی برخلاف ترکیه رقیب لجستیکی نزدیک ما نیست:
  - عمدتاً از فرآیندهای سنتتیک (سُلوِه/هو) با انرژی زغال‌سنگ استفاده می‌کند — ردپای
    کربن بالا، در معرض هزینه‌های آتی CBAM اتحادیه اروپا.
  - زمان حمل دریایی چین به اروپا/خاورمیانه ۳۰ تا ۴۵ روز است (در برابر ۱ تا ۲ هفته
    برای ترکیه)، و در بازارهای مرزی مثل عراق عملاً حضور ندارد.
  - بازیگران قابل‌ردیابی: شاندونگ های‌هوا (Shandong Haihua Group، دولتی، نماد
    000822.SZ، ظرفیت فعلی ~۸۰ هزار تن + پروژه‌ی جدید ۲۰۰ هزار تنی در حال ساخت)،
    گروه یوهوا/آیجی (Hunan Yuhua / Aijie، هنگ‌یانگ، استان هونان).
رقابت واقعی ما با چین بیشتر در بازارهای دوردست و حساس به قیمت (آسیای جنوبی،
آفریقای شرقی، آمریکای لاتین) رخ می‌دهد، نه در بازارهای مرزی که ترکیه در آن مسلط است.
"""

SYSTEM_PROMPT = f"""
تو یک تحلیلگر رقابتی برای بخش تحقیق و توسعه‌ی بازرگانی یک تولیدکننده‌ی ایرانی جوش شیرین هستی
و وظیفه‌ات رصد اختصاصی چین (بزرگ‌ترین تولیدکننده و صادرکننده‌ی جهانی) است.

زمینه:
{COMPANY_CONTEXT}

من متن خام چند صفحه‌ی وب (سایت خود تولیدکنندگان چینی + منابع حمل‌ونقل دریایی و
اقتصاد صادراتی چین، بعد از حذف تگ HTML) را در اختیارت می‌گذارم. فقط بر اساس همین
متن‌ها (نه دانش قبلی خودت) یک خروجی JSON بساز.

قوانین اجباری:
1. فقط چیزی را گزارش کن که واقعاً در متن‌ها هست. اگر دسته‌ای خالی بود، آرایه‌ی خالی برگردان —
   چیزی از خودت اختراع نکن.
2. هرگز جمله‌ی کامل از منبع کپی نکن؛ با زبان خودت خلاصه کن (نقل‌قول مستقیم فقط اگر ضروری
   و زیر ۱۵ کلمه).
3. هر آیتم باید source_url داشته باشد — دقیقاً همان URL که متنش زیرش آمده.
4. در دسته‌ی company_updates فقط خبر/اطلاعیه‌ی مربوط به تولیدکنندگان چینی جوش شیرین/سودا اش
   را بیاور (توسعه‌ی ظرفیت، پروژه‌های جدید، نتایج مالی، سرمایه‌گذاری، پایداری/کربن).
5. در دسته‌ی logistics_updates فقط چیزهای مرتبط با حمل‌ونقل دریایی، کرایه‌ی کانتینر،
   بنادر و صادرات چین را بیاور — اخبار عمومی غیرمرتبط (مثلاً سیاسی صرف) را نیاور.

خروجی را دقیقاً به این شکل JSON بده (بدون markdown fence، بدون توضیح اضافه):
{{
  "headline_fa": "تیتر کوتاه (حداکثر ۱۲ کلمه) از مهم‌ترین یافته‌ی امروز درباره‌ی چین",
  "company_updates": [
    {{"company": "نام شرکت", "headline": "تیتر کوتاه", "summary": "خلاصه با زبان خودت", "source_url": "..."}}
  ],
  "logistics_updates": [
    {{"headline": "تیتر کوتاه", "summary": "خلاصه با زبان خودت", "source_url": "..."}}
  ],
  "market_note": "یادداشت تحلیلی حداکثر ۲۰۰ کلمه: این یافته‌ها برای استراتژی صادراتی ما (قیمت پایه‌ی ۲۵۰ دلار، رقابت با چین در بازارهای دوردست) چه معنایی دارند؟ اگر امروز خبر مهمی نبود، صادقانه همین را بگو.",
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
    print("--- منابع لجستیک/اقتصاد صادراتی ---")
    logistics_fetched = fetch_sources(LOGISTICS_SOURCES, max_chars=5000)

    block = (
        "### بخش الف — سایت تولیدکنندگان چینی ###\n"
        + build_sources_block(company_fetched)
        + "\n\n### بخش ب — حمل‌ونقل دریایی و صادرات چین ###\n"
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
        f"\n[OK] رصد چین {record['date']} ذخیره شد — "
        f"{len(record['company_updates'])} خبر شرکتی، "
        f"{len(record['logistics_updates'])} خبر لجستیکی."
    )


if __name__ == "__main__":
    main()
