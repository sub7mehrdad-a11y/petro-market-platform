"""
ایجنت روزانه‌ی جمع‌آوری قیمت جوش شیرین (سدیم بی‌کربنات) از منابع عمومی وب.

چرا این‌طوری طراحی شده (به‌جای اسکرپینگ مستقیم HTML با regex):
  اسکرپینگ regex روی یک صفحه‌ی ثابت شکننده‌ست — هر بار سایت ظاهرش رو عوض کنه
  اسکریپت می‌شکنه. به‌جاش خودمون (با یک درخواست HTTP ساده) متن صفحات منابع
  تأییدشده رو می‌گیریم و به Gemini می‌دیم تا عدد قیمت رو با نوع (FOB/CIF/داخلی)
  و منبعش تشخیص بده — چون تشخیص متن با هوش مصنوعیه نه selector ثابت، در برابر
  تغییر جزئی ظاهر سایت‌ها مقاوم‌تره.

چرا خودمون fetch می‌کنیم و از ابزار Grounding with Google Search گوگل استفاده
نمی‌کنیم: چون اون ابزار برای کلیدهای رایگان تازه‌ساز با خطای quota (۴۲۹) مواجه
می‌شه (مشکل شناخته‌شده و گزارش‌شده در فروم رسمی گوگل، نه چیزی که با تنظیمات ما
حل بشه). در عوض، فراخوانی ساده‌ی تولید متن Gemini (بدون ابزار) با کلید رایگان
تست و تأیید شد که کاملاً کار می‌کنه.

قوانین سخت (این‌ها توی پرامپت هم تکرار شده‌ن تا مدل رعایت کنه):
  - فقط از سایت‌هایی که بدون لاگین/پولی در دسترسن استفاده کن.
  - هیچ‌وقت قیمت داخلی (ارز محلی) رو بدون برچسب با FOB/CIF دلاری قاطی نکن.
  - هر عدد باید دقیقاً به یک URL منبع وصل باشه؛ عدد بدون منبع رد می‌شه.

نیازمندی‌ها:
  - GEMINI_API_KEY (متغیر محیطی، هرگز داخل کد یا کامیت ننویس — از
    aistudio.google.com رایگان و بدون کارت اعتباری بگیر)
  - pip install -r requirements.txt

خروجی: data/price_history.json — هر اجرا یک batch جدید (تاریخ + لیست رکوردها) اضافه می‌کنه.
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
HISTORY_FILE = os.path.join(DATA_DIR, "price_history.json")

# منابع seed — نقطه‌ی شروع، نه فهرست بسته. هر منبع جدیدی که پیدا کردید همین‌جا
# اضافه کنید (بدون نیاز به نوشتن selector/regex).
SEED_SOURCES = [
    "https://www.echemi.com/productsInformation/pd20150901033-sodium-bicarbonate.html",  # چین - قیمت داخلی یوان/تن
    "https://www.chemanalyst.com/Pricing-data/sodium-bicarbonate-1186",  # جوش شیرین - snapshot منطقه‌ای رایگان (FAQ)
    "https://www.procurementresource.com/resource-center/sodium-bicarbonate-price-trends",  # جوش شیرین - FOB/CIF چند کشور
    "https://tradingeconomics.com/commodity/soda-ash",  # سودا اش - قیمت داخلی چین + روند
    "https://www.chemanalyst.com/Pricing-data/soda-ash-76",  # سودا اش - snapshot منطقه‌ای رایگان (FAQ)
    "https://www.procurementresource.com/resource-center/soda-ash-price-trends",  # سودا اش - FOB چین + CIF هند/آمریکا/برزیل/کانادا
]

PRODUCTS = ["sodium bicarbonate", "soda ash"]
PRIORITY_COUNTRIES = ["China", "India", "Turkey"]

SYSTEM_PROMPT = """
تو یک تحلیلگر داده‌ی قیمت محصولات پتروشیمی هستی. من متن خام چند صفحه‌ی وب (بعد از
حذف تگ HTML) رو در اختیارت می‌ذارم؛ وظیفه‌ات پیدا کردن قیمت جوش شیرین (سدیم
بی‌کربنات) و سودا اش از داخل همین متن‌هاست — نه جست‌وجوی وب.

قوانین اجباری:
1. فقط از همون متن‌هایی که در اختیارت گذاشته می‌شه استفاده کن؛ چیزی رو حدس نزن
   یا از دانش قبلی خودت اضافه نکن.
2. هرگز قیمت داخلی (ارز محلی مثل یوان) رو با قیمت FOB/CIF دلاری قاطی نکن؛
   هر رکورد باید یکی از این برچسب‌ها رو داشته باشه: "domestic" یا "FOB" یا "CIF".
3. هر رکورد باید دقیقاً همون source_url که متنش زیرش اومده رو داشته باشه.
4. اگر توی متن‌ها برای کشوری (مثلاً ترکیه) هیچ عدد قیمتی نبود، به‌جای حدس زدن،
   اون کشور رو با "value": null و یک یادداشت کوتاه در "note" ثبت کن.
5. خروجی نهایی باید *فقط* یک JSON array باشه (بدون توضیح اضافه، بدون markdown fence)
   با این ساختار برای هر عنصر:
   {
     "product": "sodium bicarbonate" | "soda ash",
     "country_or_region": "...",
     "price_type": "domestic" | "FOB" | "CIF",
     "value": number | null,
     "currency": "USD" | "CNY" | "...",
     "unit": "mt",
     "source_name": "...",
     "source_url": "...",
     "source_reported_date": "...",
     "note": "..."
   }
"""


def build_user_prompt(sources_block: str) -> str:
    return f"""
امروز {datetime.now(timezone.utc).date().isoformat()} است. محصولات مورد نظر:
{", ".join(PRODUCTS)}. کشورهای اولویت‌دار: {", ".join(PRIORITY_COUNTRIES)}.

متن خام صفحات منابع:

{sources_block}

طبق قوانین بالا، فقط یک JSON array خروجی بده.
"""


def call_agent(client: genai.Client, sources_block: str) -> str:
    interaction = client.interactions.create(
        model=GEMINI_MODEL,
        system_instruction=SYSTEM_PROMPT,
        input=build_user_prompt(sources_block),
    )
    return interaction.output_text


def extract_json_array(text: str):
    """مدل گاهی با وجود دستور 'بدون markdown fence' بازم fence می‌ذاره؛ هر دو حالت رو پوشش بده."""
    fence_match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
    raw = fence_match.group(1) if fence_match else text

    array_match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not array_match:
        raise ValueError("پاسخ مدل شامل JSON array نبود:\n" + text[:500])

    return json.loads(array_match.group(0))


# --- رفع باگ ۲۰۲۶-۰۸-۳۱: هم‌پوشانی رکوردها داخل یک اجرا ---
#
# صفحه‌ی یک منبع (مثلاً Procurement Resource) گاهی چند دوره رو با هم نشون
# می‌ده (هم قیمت ماه گذشته هم دو ماه پیش)، و مدل هر دو رو وفادارانه به‌عنوان
# رکورد جدا استخراج می‌کنه. بدون حذف تکراری، دو یا سه رکورد برای یک ترکیب
# (محصول، کشور، نوع قیمت) توی همون batch می‌مونه و هر مصرف‌کننده‌ی داده
# (نمودار داشبورد، کارت‌های هایلایت، صفحه‌ی گزارش‌ها) بسته به ترتیب آرایه —
# نه واقعیت — یکی رو انتخاب می‌کنه؛ نتیجه نوسان قیمت جعلی روی چارته (تأیید
# مستقیم روی data/price_history.json: قیمت CIF آلمان بین ۳۰۲ و ۳۴۱ دلار
# جابه‌جا می‌شد چون دو منبع/دوره‌ی متفاوت رو به‌جای هم می‌نشوندن).
MONTHS_EN = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}
QUARTER_END_MONTH = {1: 3, 2: 6, 3: 9, 4: 12}


def parse_reported_period(text: str):
    """
    'source_reported_date' رو به عددی قابل‌مقایسه (سال×۱۲+ماه) تبدیل می‌کنه تا
    بشه فهمید کدوم رکورد واقعاً دوره‌ی جدیدتری داره — نه صرفاً کدوم دیرتر توی
    خروجی مدل اومده. اگه قابل‌تجزیه نبود None برمی‌گردونه (رشته‌هایی مثل
    "May 2026"، "Q2 2026"، "Q2 ending June 2026" پوشش داده می‌شن).
    """
    if not text:
        return None
    t = text.strip().lower()

    m = re.search(r"q([1-4])\s*(?:ending\s+(\w+)\s+)?(\d{4})", t)
    if m:
        quarter, end_month_name, year = m.groups()
        year = int(year)
        if end_month_name and end_month_name in MONTHS_EN:
            return year * 12 + MONTHS_EN[end_month_name]
        return year * 12 + QUARTER_END_MONTH[int(quarter)]

    m = re.search(r"\b(" + "|".join(MONTHS_EN) + r")\s+(\d{4})", t)
    if m:
        month_name, year = m.groups()
        return int(year) * 12 + MONTHS_EN[month_name]

    m = re.search(r"\b(\d{4})\b", t)
    if m:
        return int(m.group(1)) * 12  # فقط سال، بدون ماه — کمترین اولویت در همون سال

    return None


def dedupe_records(records: list[dict]) -> list[dict]:
    """برای هر (محصول، کشور، نوع قیمت) فقط رکورد با جدیدترین دوره‌ی قابل‌تشخیص رو نگه می‌داره."""
    groups: dict[tuple, list[dict]] = {}
    order = []
    for r in records:
        key = (r.get("product"), r.get("country_or_region"), r.get("price_type"))
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(r)

    deduped = []
    dropped = 0
    for key in order:
        candidates = groups[key]
        if len(candidates) == 1:
            deduped.append(candidates[0])
            continue
        # جدیدترین دوره برنده می‌شه. اگه دو منبع برای همون دوره عدد متفاوت گزارش
        # کرده باشن (اختلاف نظر واقعی، نه تکرار)، تساوی با نام منبع (الفبایی)
        # شکسته می‌شه، نه با ترتیب آرایه — چون مدل هر روز ترتیب خروجی رو عوض
        # می‌کنه و اگه معیار «اولین توی آرایه» باشه، همون منبع برنده هر روز عوض
        # می‌شه و دقیقاً همون نوسان جعلی که داریم حذفش می‌کنیم برمی‌گرده (کشف
        # شد وقتی سری آلمان/CIF رو بعد از حذف تکراری دوباره چک کردم: هنوز هر
        # روز بین Procurement Resource و ChemAnalyst در نوسان بود).
        scored = [(parse_reported_period(r.get("source_reported_date")), r.get("source_name") or "", i, r) for i, r in enumerate(candidates)]
        scored.sort(key=lambda x: (x[0] is None, -(x[0] or 0), x[1], x[2]))
        best = scored[0][3]
        deduped.append(best)
        dropped += len(candidates) - 1
        print(f"[DEDUP] {key}: {len(candidates)} رکورد هم‌پوشان → نگه‌داشتن {best.get('source_name')} ({best.get('source_reported_date')})")

    if dropped:
        print(f"[INFO] {dropped} رکورد هم‌پوشان در همین اجرا حذف شد.")
    return deduped


def load_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_history(history):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def main():
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY تنظیم نشده است.")

    fetched = fetch_sources(SEED_SOURCES)
    sources_block = build_sources_block(fetched)

    client = genai.Client(api_key=api_key)
    raw_text = call_agent(client, sources_block)

    try:
        records = extract_json_array(raw_text)
    except ValueError as e:
        print(f"[ERROR] {e}")
        raise SystemExit(1)

    records = dedupe_records(records)

    batch = {
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "date": datetime.now(timezone.utc).date().isoformat(),
        "records": records,
    }

    history = load_history()
    history.append(batch)
    save_history(history)

    ok_count = sum(1 for r in records if r.get("value") is not None)
    print(f"[OK] {ok_count}/{len(records)} رکورد با عدد واقعی ثبت شد.")


if __name__ == "__main__":
    main()
