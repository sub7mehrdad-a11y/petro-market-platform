"""
ایجنت روزانه‌ی جمع‌آوری قیمت جوش شیرین (سدیم بی‌کربنات) از منابع عمومی وب.

چرا این‌طوری طراحی شده (به‌جای اسکرپینگ مستقیم HTML با regex):
  اسکرپینگ regex روی یک صفحه‌ی ثابت شکننده‌ست — هر بار سایت ظاهرش رو عوض کنه
  اسکریپت می‌شکنه، و برای هر کشور/منبع جدید باید دستی regex نوشت. به‌جاش از
  Claude API + ابزار web_search استفاده می‌کنیم: همون کاری که وقتی مستقیم از
  Claude گزارش بازار می‌خوای انجام می‌ده — چند منبع رو هم‌زمان جست‌وجو می‌کنه،
  عدد قیمت رو با نوع (FOB/CIF/داخلی) و منبعش استخراج می‌کنه، و چون بر پایه‌ی
  جست‌وجوی زنده‌ست نه selectors ثابت، در برابر تغییر ساختار سایت‌ها مقاوم‌تره.

قوانین سخت (این‌ها توی پرامپت هم تکرار شده‌ن تا مدل رعایت کنه):
  - فقط از سایت‌هایی که بدون لاگین/پولی در دسترسن استفاده کن.
  - هیچ‌وقت قیمت داخلی (ارز محلی) رو بدون برچسب با FOB/CIF دلاری قاطی نکن.
  - هر عدد باید دقیقاً به یک URL منبع وصل باشه؛ عدد بدون منبع رد می‌شه.

نیازمندی‌ها:
  - ANTHROPIC_API_KEY (متغیر محیطی، هرگز داخل کد یا کامیت ننویس)
  - pip install anthropic

خروجی: data/price_history.json — هر اجرا یک batch جدید (تاریخ + لیست رکوردها) اضافه می‌کنه.
"""

import os
import re
import json
from datetime import datetime, timezone

from anthropic import Anthropic

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
HISTORY_FILE = os.path.join(DATA_DIR, "price_history.json")

# منابع seed — نقطه‌ی شروع جست‌وجو، نه فهرست بسته. مدل اجازه داره منبع معتبر
# رایگان دیگه‌ای هم که پیدا کرد اضافه کنه، به شرط ذکر URL.
SEED_SOURCES = [
    "https://www.echemi.com/productsInformation/pd20150901033-sodium-bicarbonate.html",  # چین - قیمت داخلی یوان/تن
    "https://www.chemanalyst.com/Pricing-data/sodium-bicarbonate-1186",  # snapshot منطقه‌ای رایگان (FAQ)
    "https://www.procurementresource.com/resource-center/sodium-bicarbonate-price-trends",  # هند - CIF دلار/تن
    "https://tradingeconomics.com/commodity/soda-ash",  # سیگنال سود اش چین (ماده‌ی اولیه‌ی مرتبط)
]

PRODUCTS = ["sodium bicarbonate", "soda ash"]
PRIORITY_COUNTRIES = ["China", "India", "Turkey"]

SYSTEM_PROMPT = """
تو یک تحلیلگر داده‌ی قیمت محصولات پتروشیمی هستی. وظیفه‌ات جمع‌آوری قیمت روز
جوش شیرین (سدیم بی‌کربنات) از منابع عمومیِ رایگانِ وب (بدون لاگین، بدون پرداخت) است.

قوانین اجباری:
1. فقط از صفحاتی استفاده کن که واقعاً بدون لاگین/اشتراک قابل مشاهده‌ن.
2. هرگز قیمت داخلی (ارز محلی مثل یوان) رو با قیمت FOB/CIF دلاری قاطی نکن؛
   هر رکورد باید یکی از این برچسب‌ها رو داشته باشه: "domestic" یا "FOB" یا "CIF".
3. هر رکورد باید یک source_url مشخص و واقعی داشته باشه (لینکی که واقعاً در نتایج
   جست‌وجو دیدی، نه حدس زده).
4. اگر برای کشوری (مثلاً ترکیه) هیچ عدد رایگانی پیدا نشد، به‌جای حدس زدن، اون کشور
   رو با "value": null و یک یادداشت کوتاه در "note" ثبت کن.
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


def build_user_prompt() -> str:
    sources_block = "\n".join(f"- {s}" for s in SEED_SOURCES)
    return f"""
امروز {datetime.now(timezone.utc).date().isoformat()} است. با استفاده از web_search
قیمت امروز/آخرین قیمت منتشرشده‌ی محصولات {", ".join(PRODUCTS)} رو برای کشورهای
{", ".join(PRIORITY_COUNTRIES)} (اولویت با چین، هند، ترکیه) پیدا کن.

این منابع رو حتماً به‌عنوان نقطه‌ی شروع بررسی کن (ولی اگه منبع رایگان معتبر دیگه‌ای
هم پیدا کردی، اضافه‌ش کن):
{sources_block}

طبق قوانین بالا، فقط یک JSON array خروجی بده.
"""


def call_agent(client: Anthropic) -> str:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_prompt()}],
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
    )
    return "\n".join(
        block.text for block in response.content if getattr(block, "type", None) == "text"
    )


def extract_json_array(text: str):
    """مدل گاهی با وجود دستور 'بدون markdown fence' بازم fence می‌ذاره؛ هر دو حالت رو پوشش بده."""
    fence_match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
    raw = fence_match.group(1) if fence_match else text

    array_match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not array_match:
        raise ValueError("پاسخ مدل شامل JSON array نبود:\n" + text[:500])

    return json.loads(array_match.group(0))


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
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise SystemExit("ANTHROPIC_API_KEY تنظیم نشده است.")

    client = Anthropic(api_key=api_key)
    raw_text = call_agent(client)

    try:
        records = extract_json_array(raw_text)
    except ValueError as e:
        print(f"[ERROR] {e}")
        raise SystemExit(1)

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
