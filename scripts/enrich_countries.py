"""
ساخت data/country_profiles.json: برای هر کشوری که گزارش داره، از متن همون
گزارش‌ها (نه دانش قبلی مدل) میزان کل واردات و سه شریک تجاری اصلی رو استخراج
می‌کنه، و فاصله‌ی بندر ورودی اون کشور تا بندر مرجع ایران/چین/ترکیه (همیشه) و
هند/روسیه (فقط اگه جزو سه شریک اصلی باشن) رو حساب می‌کنه.

چرا اینجا از AI فقط برای استخراج «متن‌های ساختاریافته» استفاده می‌شه، نه برای
محاسبه‌ی فاصله: فاصله‌ی جغرافیایی یک محاسبه‌ی ریاضی قطعیه (haversine روی
مختصات واقعی بنادر)، نه چیزی که باید حدس زده بشه.
"""

import os
import re
import sys
import json
import glob

from google import genai

from geo_data import PORTS, distance_between

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GEMINI_MODEL = "gemini-3.6-flash"

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
PARSED_DIR = os.path.join(BASE_DIR, "reports", "parsed")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "country_profiles.json")

# فقط این کشورها اجازه دارن به‌عنوان «شریک تجاری با فاصله‌ی نمایش‌داده‌شده»
# شناسایی بشن (چون فقط برای این‌ها مختصات بندر مرجع داریم).
KNOWN_PARTNER_COUNTRIES = ["چین", "ترکیه", "هند", "روسیه"]
ALWAYS_SHOW_DISTANCE_TO = ["ایران", "چین", "ترکیه"]
CONDITIONAL_DISTANCE_TO = ["هند", "روسیه"]

EXTRACTION_SYSTEM_PROMPT = f"""
تو یک استخراج‌کننده‌ی داده هستی. من متن کامل گزارش(های) بازار یک کشور رو می‌دم.
فقط بر اساس همین متن (نه دانش قبلی خودت)، این اطلاعات رو استخراج کن:

1. میزان کل واردات محصول (جوش شیرین/سدیم بی‌کربنات) این کشور — عدد، واحد، و سال/دوره.
2. سه شریک تجاری اصلی (کشورهای مبدأ تأمین) به ترتیب اهمیت، با سهم بازار یا توضیح کوتاه.
   اسم کشور رو دقیقاً با همون املای فارسی رایج بنویس (مثلاً "چین"، "ترکیه"، "روسیه"، "هند"،
   "ایتالیا"، "اسپانیا"، "آمریکا"، "آلمان").
3. اسم بندر ورودی اصلی این کشور، اگه در متن ذکر شده.

اگه چیزی توی متن نبود، null بذار — چیزی اختراع نکن.

خروجی رو دقیقاً به این شکل JSON بده (بدون markdown fence، بدون توضیح اضافه):
{{
  "total_import_volume": {{"value": number|null, "unit": "...", "period": "..."}},
  "top_trade_partners": [{{"country": "...", "note": "..."}}],
  "main_port_name": "..." | null
}}
"""


def extract_json_object(text: str) -> dict:
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    raw = fence_match.group(1) if fence_match else text
    obj_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not obj_match:
        raise ValueError("پاسخ مدل شامل JSON object نبود:\n" + text[:500])
    return json.loads(obj_match.group(0))


def load_country_reports_text(country: str) -> str:
    texts = []
    for path in glob.glob(os.path.join(PARSED_DIR, "*.json")):
        with open(path, "r", encoding="utf-8") as f:
            report = json.load(f)
        if report.get("country") != country:
            continue
        texts.append(json.dumps(report, ensure_ascii=False))
    return "\n\n---\n\n".join(texts)


def build_profile(country: str, client: genai.Client) -> dict:
    text = load_country_reports_text(country)
    if not text:
        return None

    interaction = client.interactions.create(
        model=GEMINI_MODEL,
        system_instruction=EXTRACTION_SYSTEM_PROMPT,
        input=text,
    )
    extracted = extract_json_object(interaction.output_text)

    distances = {}
    if country in PORTS:
        for ref in ALWAYS_SHOW_DISTANCE_TO:
            km = distance_between(country, ref)
            if km is not None:
                distances[ref] = km

        partner_names = {p.get("country") for p in extracted.get("top_trade_partners", [])}
        for ref in CONDITIONAL_DISTANCE_TO:
            if ref in partner_names:
                km = distance_between(country, ref)
                if km is not None:
                    distances[ref] = km

    port_info = PORTS.get(country)

    return {
        "country": country,
        "port": {"name": port_info[2], "lat": port_info[0], "lon": port_info[1]} if port_info else None,
        "total_import_volume": extracted.get("total_import_volume"),
        "top_trade_partners": extracted.get("top_trade_partners", []),
        "distances_km": distances,
    }


def main():
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY تنظیم نشده است.")

    client = genai.Client(api_key=api_key)

    countries = sorted({
        json.load(open(p, encoding="utf-8")).get("country")
        for p in glob.glob(os.path.join(PARSED_DIR, "*.json"))
    })

    profiles = {}
    for country in countries:
        if not country:
            continue
        profile = build_profile(country, client)
        if profile:
            profiles[country] = profile
            print(f"[OK] {country}: {len(profile['distances_km'])} فاصله، {len(profile['top_trade_partners'])} شریک تجاری")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)

    print(f"\n[DONE] پروفایل {len(profiles)} کشور در {OUTPUT_FILE} ذخیره شد.")


if __name__ == "__main__":
    main()
