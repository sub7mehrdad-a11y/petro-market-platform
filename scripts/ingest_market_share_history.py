# -*- coding: utf-8 -*-
"""
ETL برای «روند چندساله‌ی سهم بازار» — یعنی سهم هر کشور مبدأ از بازار واردات
یک کشور مقصد (یا از صادرات جهانی)، سال به سال. برخلاف ingest_import_suppliers.py
(که فقط یک سال/عکس لحظه‌ای می‌دهد)، این اسکریپت چند سال را کنار هم می‌گذارد تا
معلوم شود سهم کدام رقیب دارد رشد/افت می‌کند و آن سهمِ ازدست‌رفته را چه کسی
می‌گیرد.

منبع داده: WITS — World Integrated Trade Solution (wits.worldbank.org)، آینه‌ی
عمومی و رایگان UN Comtrade. چرا WITS و نه ITC Trade Map (منبع import_suppliers.json):
ITC نیاز به دانلود دستی/اشتراک دارد و فقط آخرین سال را می‌دهد؛ WITS برای هر
سال دلخواه یک صفحه‌ی مجزا و قابل‌پیش‌بینی دارد (بدون نیاز به دانلود دستی)،
یعنی دقیقاً همان چیزی که برای ساختن یک سری زمانی لازم است.

الگوی URL (تأییدشده با تست واقعی، شهریور ۱۴۰۵):
  واردات یک کشور به تفکیک مبدأ:
    https://wits.worldbank.org/trade/comtrade/en/country/{ISO3}/year/{YEAR}/tradeflow/Imports/partner/all/product/283630
  صادرات جهانی به تفکیک کشور (برای روند سهم صادرکنندگان بزرگ):
    https://wits.worldbank.org/trade/comtrade/en/country/all/year/{YEAR}/tradeflow/Exports/partner/wld/product/283630

چرا Groq برای استخراج (نه یک پارسر HTML دستی مثل ingest_import_suppliers.py):
صفحه‌ی WITS برخلاف فایل‌های خروجی ITC، یک HTML قابل‌پیش‌بینی و مستند نیست (ساختار
جدول را رسماً منتشر نکرده)؛ fetch_utils.fetch_page_text آن را به متن ساده تبدیل
می‌کند و Groq از همان متن، ردیف‌های واقعی جدول را استخراج می‌کند — دقیقاً همان
الگوی صداقت‌محور transit_watch_bot.py: چیزی که در متن نبود، حدس زده نمی‌شود.

⚠️ نکته‌ی حیاتی درباره‌ی سهمیه‌ی Groq (TPM=۸۰۰۰ توکن/دقیقه، مشترک با بقیه‌ی
ربات‌ها — نگاه کنید به groq_utils.py): هر فراخوان این اسکریپت باید مستقل و کوچک
بماند. به همین دلیل:
  - برای «بازار جهانی» فقط یک فهرست ثابت و کوچک از رقبای بزرگ استخراج می‌شود
    (GLOBAL_WATCH_COUNTRIES)، نه کل جدول ۹۰+ کشوری — چون آن‌قدر توکن لازم دارد
    که به‌تنهایی سقف TPM را پر می‌کند.
  - بین فراخوان‌های Groq مکث کوتاه گذاشته شده (RATE_LIMIT_PAUSE_SEC) تا با
    بقیه‌ی ربات‌های همان کلید تداخل نکند.

⚠️ محدودیت شناخته‌شده (حتماً هنگام خواندن نتیجه در نظر بگیرید — دقیقاً همان
نوع نکته‌ای که قرار شد همیشه گوشزد شود): از ۲۰۲۲ به بعد روسیه و از ۲۰۲۳ به بعد
ایران در جدول «صادرات جهانی به تفکیک کشور» WITS محو می‌شوند (چون آن جدول به
گزارش مستقیم خودِ کشور صادرکننده متکی است، نه تجمیع کامل آمار آینه‌ای). این به
معنای صفر شدن صادرات نیست — همان‌طور که همین اسکریپت برای بازارهای مقصد
(ازبکستان/ارمنستان) با موفقیت صادرات ایران را از آمار *وارداتی* آن کشورها
می‌گیرد. برای تخمین صادرات ایران همیشه به داده‌ی مقصد (import-side) اعتماد کنید،
نه به جدول صادرکنندگان جهانی.

خروجی: data/market_share_history.json — با اجرای دوباره‌ی اسکریپت کامل
بازنویسی می‌شود (نه افزوده)، چون هر بار همه‌ی سال‌های پیکربندی‌شده را دوباره
می‌گیرد — دقیقاً مثل ingest_trade_map.py.

برای افزودن یک بازار مقصد جدید (مثلاً عراق، آذربایجان): فقط یک آیتم به
DESTINATION_MARKETS اضافه کنید؛ کد نیازی به تغییر ندارد.
"""

import os
import re
import sys
import json
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from env_utils import load_env
from fetch_utils import fetch_page_text
from groq_utils import groq_generate

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

load_env()

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "market_share_history.json")
PRODUCT_HS6 = "283630"  # بی‌کربنات سدیم (جوش شیرین)

# بین دو فراخوان Groq پشت‌سرهم مکث کن — سهمیه‌ی TPM مشترک با ربات‌های دیگه‌ست
# (رصد ترکیه/چین/ترانزیت) و این اسکریپت معمولاً دستی/دوره‌ای اجرا می‌شه، نه
# زیر فشار زمانی، پس صبر کردن این‌جا رایگانه.
RATE_LIMIT_PAUSE_SEC = 8

# -----------------------------------------------------------------------
# پیکربندی بازارهای مقصد — هر کدوم به تفکیک مبدأ (همه‌ی تأمین‌کننده‌ها).
# سال‌ها از ۲۰۱۹ تا ۲۰۲۴ چون این بازه برای هر دو کشور در تست واقعی جواب داد؛
# اگه سال جدیدتری در WITS منتشر شد فقط کافیه به این لیست اضافه بشه.
DESTINATION_MARKETS = [
    {"key": "uzbekistan", "iso3": "UZB", "importer_fa": "ازبکستان", "importer_en": "Uzbekistan"},
    {"key": "armenia", "iso3": "ARM", "importer_fa": "ارمنستان", "importer_en": "Armenia"},
    # --- بازارهای مقصد اضافه‌شده ۲۰۲۶-۰۹-۱۳ (بسط اولیه) — هر دو در
    # data/country_profiles.json پروفایل دارن، پس صفحه‌شون از قبل روی سایت هست.
    {"key": "jordan", "iso3": "JOR", "importer_fa": "اردن", "importer_en": "Jordan"},
    {"key": "kenya", "iso3": "KEN", "importer_fa": "کنیا", "importer_en": "Kenya"},
]

# عمداً اضافه نشد (۲۰۲۶-۰۹-۱۳): عراق (IRQ). تست واقعی نشون داد آمار آینه‌ی
# WITS برای عراق تقریباً بی‌ارزشه — کل بازار ثبت‌شده در ۲۰۲۱ فقط ۷۷ هزار دلار
# بود (در برابر بازار واقعی ~۱۳,۰۰۰ تنی که گزارش تحلیلی مفصل عراق برآورد
# کرده)، بخش بزرگی از هر سال هم ردیف‌های تجمیعی بی‌معنا («Other Asia, nes»)
# بود نه کشور واقعی، و روند حاصل (ایران از ۰٪ به ۹۳٫۸٪!) مستقیم با رقم
# دست‌وپاشکسته ولی مستند و دقیق‌تر خودِ گزارش (سهم واقعی ایران ~۴۶٪) در
# تناقض بود. خودِ گزارش عراق هم صریحاً همین مشکل رو برای ITC Trade Map گفته
# («خطای محاسباتی فاحش») — WITS از همون خانواده‌ی داده‌ی آینه‌ایه، پس همون
# مشکل رو داره. نتیجه: برای کشورهایی که گزارش اختصاصی و اصلاح‌شده دارن، قبل
# از افزودن به این لیست، total_usd_k سال آخر رو با اندازه‌ی بازار گزارش
# مقایسه کنید — اگه به‌طرز چشمگیری کوچیک‌تر بود، یعنی WITS برای اون کشور
# داده‌ی قابل‌اعتمادی نداره.
DEST_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]

# پیکربندی «بازار جهانی» — فقط رقبای بزرگ (نه کل جدول، به‌خاطر سقف TPM؛ توضیح
# در باکس بالا). این ۸ کشور در تمام سال‌های تست‌شده (۲۰۱۵-۲۰۲۴) عدد کامل
# داشتن. ایران و روسیه عمداً بیرونن (چون در سال‌های اخیر از جدول محو می‌شن) و
# جدا در GLOBAL_GAP_WATCH ردیابی می‌شن تا محو شدن‌شون به‌جای «صفر» ثبت بشه.
GLOBAL_CORE_COUNTRIES = {
    "China": "چین", "Germany": "آلمان", "Turkey": "ترکیه", "United States": "آمریکا",
    "Spain": "اسپانیا", "France": "فرانسه", "Bosnia and Herzegovina": "بوسنی و هرزگوین",
    "Bulgaria": "بلغارستان",
}
GLOBAL_GAP_WATCH = {"Russian Federation": "روسیه", "Iran, Islamic Rep.": "ایران"}
GLOBAL_YEARS = [2015, 2017, 2019, 2020, 2021, 2022, 2023, 2024]

DEST_SYSTEM_PROMPT = """
تو یک استخراج‌کننده‌ی داده‌ی تجارت جهانی هستی. من متن ساده‌شده‌ی یک صفحه‌ی
WITS (wits.worldbank.org) رو می‌دم که جدول «واردات محصول HS 283630 به تفکیک
کشور مبدأ» رو نشون می‌ده. فقط بر اساس همین متن، آرایه‌ای از ردیف‌های واقعی
جدول (کشور مبدأ + ارزش) بساز.

قوانین اجباری:
1. فقط کشورهای واقعی رو بردار؛ ردیف «World» یا «Total» رو نادیده بگیر (خودِ
   جمع کل رو جدا در کلید world_value_usd_k برگردون).
2. عدد ارزش تجاری («Trade value» یا مشابه، برحسب هزار دلار) رو دقیقاً همون
   عددی که در متن اومده برگردون — گرد نکن، اختراع نکن.
3. اگه مقداری (کمیت/کیلوگرم) هم توی متن بود، توی quantity_kg بذار؛ وگرنه null.
4. اگه صفحه اصلاً هیچ ردیف واقعی نداشت (بازار خالی)، آرایه‌ی خالی برگردون.
5. فقط JSON خروجی بده، بدون markdown fence و بدون توضیح اضافه.

خروجی دقیقاً این شکل:
{"world_value_usd_k": number|null, "rows": [{"country_en": "...", "value_usd_k": number, "quantity_kg": number|null}]}
"""

GLOBAL_SYSTEM_PROMPT = """
تو یک استخراج‌کننده‌ی داده‌ی تجارت جهانی هستی. من متن ساده‌شده‌ی یک صفحه‌ی
WITS می‌دم که جدول «صادرات جهانی محصول HS 283630 به تفکیک کشور» رو نشون
می‌ده، به‌همراه فهرستی از نام‌های دقیقِ کشور که باید پیدا کنی.

قوانین اجباری:
1. فقط برای کشورهایی که در «فهرست هدف» زیر اومدن جواب بده — بقیه‌ی جدول رو
   کامل نادیده بگیر.
2. اگه یکی از کشورهای فهرست هدف اصلاً در متن نبود (نه اینکه مقدارش صفر باشه،
   بلکه اصلاً ردیفش وجود نداشت)، مقدارش را null بگذار — حدس نزن. این حالت
   واقعی و مهمه (مثلاً روسیه/ایران در چند سال اخیر از این جدول محو می‌شن).
3. عدد رو دقیقاً همون‌طور که در متنه (هزار دلار) برگردون.
4. فقط JSON خروجی بده، بدون markdown fence.

فهرست هدف: {targets}

خروجی دقیقاً این شکل:
{{"values": {{"China": number|null, "...": number|null}}}}
"""


# ردیف‌های تجمیعی/نامشخص WITS (نه یک کشور واقعی) — کشف‌شده در تست عراق
# (۲۰۲۶-۰۹-۱۳): «Other Asia, nes» تنها توی سال ۲۰۲۲ عراق ۹۲٪ از کل ردیف‌های
# استخراج‌شده رو تشکیل داده بود. الگوی WITS/Comtrade: هر برچسبی که با
# «, nes» (not elsewhere specified) تموم بشه، یا دقیقاً «Unspecified»/
# «World»/«Bunkers»/«Free Zones» باشه، یک کشور واقعی نیست.
def _is_wits_aggregate(country_en):
    name = (country_en or "").strip().lower()
    return name.endswith(", nes") or name in {"unspecified", "world", "bunkers", "free zones"}


def wits_url(iso3_or_all, year, tradeflow, partner):
    return (
        f"https://wits.worldbank.org/trade/comtrade/en/country/{iso3_or_all}"
        f"/year/{year}/tradeflow/{tradeflow}/partner/{partner}/product/{PRODUCT_HS6}"
    )


def extract_json(text):
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    raw = fence.group(1) if fence else text
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError("پاسخ مدل شامل JSON نبود:\n" + text[:500])
    return json.loads(match.group(0))


def fetch_destination_year(iso3, year):
    url = wits_url(iso3, year, "Imports", "all")
    text = fetch_page_text(url, max_chars=6000, timeout=25)
    raw = groq_generate(
        system_instruction=DEST_SYSTEM_PROMPT, input=text,
        max_tokens=2500, reasoning_effort="low",
    )
    return extract_json(raw)


def fetch_global_year(year, targets_en):
    url = wits_url("all", year, "Exports", "wld")
    text = fetch_page_text(url, max_chars=6000, timeout=25)
    prompt = GLOBAL_SYSTEM_PROMPT.format(targets=json.dumps(targets_en, ensure_ascii=False))
    raw = groq_generate(
        system_instruction=prompt, input=text,
        max_tokens=1200, reasoning_effort="low",
    )
    return extract_json(raw)


def to_year_entry(world_value, rows, name_lookup_fa=None):
    """
    یک ردیف {year, total_usd_k, suppliers:[{value_usd_k, share_pct}, ...]} می‌سازه.
    name_lookup_fa اختیاریه (برای بازار جهانی که فارسی‌ش از پیش مشخصه)؛ برای
    بازارهای مقصد نگاشت رسمی کشور در country_name_map.json چک می‌شه.
    """
    total = world_value if world_value else sum(r["value_usd_k"] for r in rows if r.get("value_usd_k"))
    suppliers = []
    for r in rows:
        v = r.get("value_usd_k")
        if not v or _is_wits_aggregate(r.get("country_en")):
            continue
        fa = (name_lookup_fa or {}).get(r["country_en"], r["country_en"])
        suppliers.append({
            "country_en": r["country_en"],
            "country_fa": fa,
            "value_usd_k": v,
            "quantity_kg": r.get("quantity_kg"),
            "share_pct": round(v / total * 100, 2) if total else None,
        })
    suppliers.sort(key=lambda s: s["value_usd_k"], reverse=True)
    return {"total_usd_k": round(total, 2) if total else None, "suppliers": suppliers}


def compute_movers(years_list):
    """بزرگ‌ترین تغییرات سهم بین اولین و آخرین سالی که داده دارن، برای هر کشور."""
    if len(years_list) < 2:
        return None
    first, last = years_list[0], years_list[-1]
    share_first = {s["country_fa"]: s["share_pct"] for s in first["suppliers"]}
    share_last = {s["country_fa"]: s["share_pct"] for s in last["suppliers"]}
    all_names = set(share_first) | set(share_last)
    ranked = []
    for name in all_names:
        p0 = share_first.get(name, 0) or 0
        p1 = share_last.get(name, 0) or 0
        ranked.append({
            "country_fa": name, "share_first": round(p0, 1), "share_last": round(p1, 1),
            "delta_pct_points": round(p1 - p0, 1),
        })
    ranked.sort(key=lambda r: r["delta_pct_points"], reverse=True)
    return {"first_year": first["year"], "last_year": last["year"], "ranked": ranked}


def build_destination_market(market, name_map):
    print(f"\n=== {market['importer_fa']} ({market['iso3']}) ===")
    years_out = []
    for year in DEST_YEARS:
        try:
            result = fetch_destination_year(market["iso3"], year)
        except Exception as e:
            print(f"[WARN] {market['iso3']} {year}: خطا — {e}")
            time.sleep(RATE_LIMIT_PAUSE_SEC)
            continue
        entry = to_year_entry(result.get("world_value_usd_k"), result.get("rows", []), name_map)
        entry["year"] = year
        years_out.append(entry)
        print(f"[OK] {year}: {len(entry['suppliers'])} تأمین‌کننده، جمع {entry['total_usd_k']} هزار دلار")
        time.sleep(RATE_LIMIT_PAUSE_SEC)

    years_out = [y for y in years_out if y["suppliers"]]
    if not years_out:
        print(f"[ERROR] {market['key']}: هیچ سالی داده‌ی معتبر نداد.")
        return None

    return {
        "importer_fa": market["importer_fa"], "importer_en": market["importer_en"],
        "iso3": market["iso3"], "years": years_out,
        "movers": compute_movers(years_out),
    }


def build_global_market():
    print("\n=== بازار جهانی (سبد هسته‌ی رقبای بزرگ) ===")
    all_targets = list(GLOBAL_CORE_COUNTRIES) + list(GLOBAL_GAP_WATCH)
    name_map = {**GLOBAL_CORE_COUNTRIES, **GLOBAL_GAP_WATCH}
    years_out = []
    gap_log = {}  # {country_en: [year, year, ...]} — سال‌هایی که کشور در جدول نبود

    for year in GLOBAL_YEARS:
        try:
            result = fetch_global_year(year, all_targets)
        except Exception as e:
            print(f"[WARN] global {year}: خطا — {e}")
            time.sleep(RATE_LIMIT_PAUSE_SEC)
            continue

        values = result.get("values", {})
        core_rows = [
            {"country_en": c, "value_usd_k": values.get(c)}
            for c in GLOBAL_CORE_COUNTRIES if values.get(c)
        ]
        entry = to_year_entry(None, core_rows, name_map)
        entry["year"] = year
        years_out.append(entry)

        for c in GLOBAL_GAP_WATCH:
            if not values.get(c):
                gap_log.setdefault(c, []).append(year)

        print(f"[OK] {year}: {len(entry['suppliers'])}/{len(GLOBAL_CORE_COUNTRIES)} کشورِ سبدِ هسته پیدا شد")
        time.sleep(RATE_LIMIT_PAUSE_SEC)

    years_out = [y for y in years_out if y["suppliers"]]
    if not years_out:
        print("[ERROR] global: هیچ سالی داده نداد.")
        return None

    return {
        "importer_fa": None,
        "importer_en": "World exports (comparable core basket, not full world total)",
        "iso3": None,
        "note_fa": (
            "این «سهم بازار جهانی» فقط ۸ صادرکننده‌ی بزرگی است که در تمام سال‌ها "
            "در آمار WITS عدد کامل دارند — نه کل صادرات جهانی. ایران و روسیه عمداً "
            "بیرون از این سبدند چون در سال‌های اخیر از جدول محو می‌شوند (توضیح در "
            "mirror_gaps)، نه چون صادراتشان صفر شده."
        ),
        "years": years_out,
        "movers": compute_movers(years_out),
        "mirror_gaps": {
            GLOBAL_GAP_WATCH[c]: {"missing_years": ys} for c, ys in gap_log.items()
        },
    }


def main():
    name_map = {}
    name_map_path = os.path.join(os.path.dirname(__file__), "country_name_map.json")
    if os.path.exists(name_map_path):
        with open(name_map_path, "r", encoding="utf-8") as f:
            raw_map = json.load(f)
        name_map = {en: info.get("fa", en) for en, info in raw_map.items() if info.get("fa")}

    # WITS اسم بعضی کشورها رو با املای متفاوتی از country_name_map.json می‌ده
    # (که برای نقشه‌ی جهانی/iso2 نگه‌داری می‌شه، نه دقیقاً هم‌راستا با استانداردِ
    # WITS/Comtrade) — بدون این override، این کشورها با نام انگلیسی خام توی
    # نمودار فارسی نمایش داده می‌شدن. فهرست کامل کشف‌شده با تست واقعی
    # (۲۰۲۶-۰۹-۱۳، از میان تأمین‌کننده‌های ازبکستان/ارمنستان/عراق/اردن/کنیا):
    name_map.update({
        "Iran, Islamic Rep.": "ایران",
        "Russia": "روسیه",
        "Turkey": "ترکیه",
        "United States": "آمریکا",
        "Korea, Rep.": "کره جنوبی",
        "Korea, Dem. People's Rep.": "کره شمالی",
        "Vietnam": "ویتنام",
        "Egypt, Arab Rep.": "مصر",
    })

    markets = {}
    for market in DESTINATION_MARKETS:
        built = build_destination_market(market, name_map)
        if built:
            markets[market["key"]] = built

    global_built = build_global_market()
    if global_built:
        markets["global"] = global_built

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "WITS — World Integrated Trade Solution (wits.worldbank.org), آینه‌ی عمومی UN Comtrade",
        "note": "این فایل با scripts/ingest_market_share_history.py ساخته می‌شود؛ با اجرای دوباره‌ی اسکریپت کامل بازنویسی می‌شود.",
        "markets": markets,
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n[DONE] روند سهم بازار {len(markets)} بازار در {OUTPUT_FILE} ذخیره شد.")


if __name__ == "__main__":
    main()
