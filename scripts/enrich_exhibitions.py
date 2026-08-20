"""
برای هر نمایشگاه توی data/exhibitions.json، یک گزارش کوتاه می‌سازه: چه صنایعی
بیشتر توش حضور دارن + خلاصه‌ای از عملکرد دوره‌های قبل (تعداد بازدیدکننده/غرفه‌دار،
روند رشد) — اگه این اطلاعات واقعاً روی سایت رسمی نمایشگاه پیدا بشه.

چرا یک‌بار اجرا می‌شه، نه روزانه (برخلاف turkey_watch_bot/china_watch_bot):
ترکیب صنایع و عملکرد سال‌های قبل یک نمایشگاه روزانه تغییر نمی‌کنه. این اسکریپت
دستی و هر چند وقت یک‌بار (یا وقتی نمایشگاه جدیدی اضافه شد) اجرا می‌شه، نه با
GitHub Actions — پس فشار روزانه‌ای به سهمیه‌ی Gemini نمی‌ذاره.

صداقت داده: اگه نمایشگاهی وب‌سایت رسمی نداشت، یا سایتش آمار/فهرست صنایع رو
منتشر نکرده بود، گزارش صادقانه «اطلاعات کافی در دسترس نیست» می‌گه — چیزی
اختراع نمی‌کنه.

خروجی: data/exhibition_reports.json (map: exhibition id → گزارش)
"""

import os
import re
import sys
import json

from google import genai

sys.path.insert(0, os.path.dirname(__file__))
from fetch_utils import fetch_sources, build_sources_block

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GEMINI_MODEL = "gemini-3.6-flash"

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
EXHIBITIONS_FILE = os.path.join(BASE_DIR, "data", "exhibitions.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "exhibition_reports.json")

SYSTEM_PROMPT = """
تو یک تحلیلگر نمایشگاه‌های تجاری برای بخش بازرگانی یک تولیدکننده‌ی ایرانی جوش
شیرین (سدیم بی‌کربنات، HS 283630) هستی. من متن خام سایت رسمی یک نمایشگاه رو
می‌دم. فقط بر اساس همین متن (نه دانش قبلی‌ت)، این‌ها رو استخراج کن:

1. industries_present: صنایعی که بیشترین حضور رو توی این نمایشگاه دارن —
   فقط چیزی که واقعاً توی متن به آن اشاره شده (مثلاً «صنایع غذایی»، «خوراک دام»،
   «شیمیایی»، «شوینده»). اگر متن این‌رو مشخص نکرده بود، آرایه‌ی خالی برگردون.
2. past_editions_summary: خلاصه‌ای (حداکثر ۱۰۰ کلمه) از عملکرد دوره‌های قبل —
   تعداد بازدیدکننده، تعداد غرفه‌دار، تعداد کشور شرکت‌کننده، روند رشد نسبت به
   دوره‌ی قبل، اگه توی متن ذکر شده. اگه نبود، دقیقاً بنویس: "اطلاعات کافی در
   سایت رسمی نمایشگاه در دسترس نیست."
3. exhibitor_notes: هر نکته‌ی مفید درباره‌ی نوع غرفه‌داران/خریداران معمول این
   نمایشگاه که برای تصمیم به حضور یا عدم حضور شرکت ما مفید باشه (حداکثر ۶۰ کلمه).
   اگه چیزی نبود، رشته‌ی خالی برگردون.
4. data_availability: "sufficient" اگه هم صنایع هم آمار دوره‌ی قبل پیدا شد،
   "limited" اگه فقط یکی از این دو پیدا شد، "none" اگه هیچ‌کدوم نبود.

قوانین اجباری: هیچ عددی از خودت اختراع نکن. هرگز جمله‌ی کامل از سایت کپی نکن —
با زبان خودت خلاصه کن.

خروجی رو دقیقاً به این شکل JSON بده (بدون markdown fence، بدون توضیح اضافه):
{
  "industries_present": ["..."],
  "past_editions_summary": "...",
  "exhibitor_notes": "...",
  "data_availability": "sufficient" | "limited" | "none"
}
"""


def extract_json_object(text: str) -> dict:
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    raw = fence.group(1) if fence else text
    obj = re.search(r"\{.*\}", raw, re.DOTALL)
    if not obj:
        raise ValueError("پاسخ مدل شامل JSON object نبود:\n" + text[:500])
    return json.loads(obj.group(0))


def normalize_website(raw: str) -> str:
    # بعضی رکوردها بیش از یک دامنه رو با فاصله و "/" جدا کردن (مثلاً
    # "vivasia.nl / viv.net")؛ فقط اولین توکن رو برمی‌داریم. مراقبیم که این
    # کار به آدرس سالم مثل "https://x.com/en" (بدون فاصله دور "/") آسیب نزنه.
    tokens = [t for t in raw.strip().split() if t != "/"]
    first = tokens[0] if tokens else raw.strip()
    if first.startswith("http://") or first.startswith("https://"):
        return first
    return f"https://{first}"


def build_report(exhibition: dict, client: genai.Client) -> dict:
    website = exhibition.get("website")
    if not website:
        return {
            "industries_present": [],
            "past_editions_summary": "این نمایشگاه در بانک اطلاعاتی وب‌سایت رسمی ثبت‌شده‌ای ندارد.",
            "exhibitor_notes": "",
            "data_availability": "none",
            "sources": [],
        }

    url = normalize_website(website)
    fetched = fetch_sources([url], max_chars=6000)
    if not fetched[0]["ok"]:
        return {
            "industries_present": [],
            "past_editions_summary": f"وب‌سایت رسمی ({url}) در دسترس نبود؛ گزارش تولید نشد.",
            "exhibitor_notes": "",
            "data_availability": "none",
            "sources": [],
        }

    block = build_sources_block(fetched)
    interaction = client.interactions.create(
        model=GEMINI_MODEL,
        system_instruction=SYSTEM_PROMPT,
        input=f"نمایشگاه: {exhibition.get('name')}\n\n{block}",
    )
    parsed = extract_json_object(interaction.output_text)
    parsed["sources"] = [{"name": exhibition.get("name"), "url": url}]
    return parsed


def main():
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY تنظیم نشده است.")
    client = genai.Client(api_key=api_key)

    with open(EXHIBITIONS_FILE, "r", encoding="utf-8") as f:
        exhibitions = json.load(f)

    reports = {}
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            reports = json.load(f)

    for ex in exhibitions:
        eid = ex["id"]
        # اگه قبلاً گزارش خوب (نه «none») براش ساخته شده، دوباره fetch/AI صرف
        # نکن — هم در سهمیه صرفه‌جویی می‌کنه، هم اگه اجرای بعدی وسط راه به
        # سهمیه بخوره، گزارش‌های قبلاً موفق رو با یک پیام خطا جایگزین نمی‌کنه.
        existing = reports.get(eid)
        if existing and existing.get("data_availability") in ("sufficient", "limited"):
            print(f"[SKIP] {ex['name']}: قبلاً گزارش موفق داره")
            continue
        try:
            report = build_report(ex, client)
            reports[eid] = report
            print(f"[OK] {ex['name']}: data_availability={report['data_availability']}")
        except Exception as e:
            print(f"[WARN] {ex['name']}: {e}")
            reports[eid] = {
                "industries_present": [],
                "past_editions_summary": "خطا در تولید گزارش؛ دوباره اجرا کنید.",
                "exhibitor_notes": "",
                "data_availability": "none",
                "sources": [],
            }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(reports, f, ensure_ascii=False, indent=2)

    print(f"\n[DONE] گزارش {len(reports)} نمایشگاه در {OUTPUT_FILE} ذخیره شد.")


if __name__ == "__main__":
    main()
