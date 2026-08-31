"""
آماده‌سازی داده‌ی گزارش هفتگی مدیران — مستقیم از data/*.json، بدون هیچ فراخوانی
هوش مصنوعی.

چرا بدون AI (عمدی، نه محدودیت): این تنها ربات پروژه‌ست که حتی اگه سهمیه‌ی
Gemini/Groq همون روز تموم شده باشه یا یک منبع خبری از کار افتاده باشه، باز هم
باید سالم به دست مدیرها برسه — چون گزارش هفتگی، برخلاف ربات‌های روزانه، قابل
«فردا دوباره امتحان کن» نیست (فقط شنبه‌هاست). پس فقط داده‌ای که بقیه‌ی ربات‌ها
از قبل جمع‌آوری و اعتبارسنجی کرده‌ن رو می‌خونه و خلاصه می‌کنه.

نکته‌ی مهم: هر رکورد قیمتی همون رکوردیه که price_intelligence_bot.py بعد از
dedupe_records() (رفع باگ ۲۰۲۶-۰۸-۳۱) ذخیره کرده — یعنی حداکثر یک رکورد به‌ازای
هر (محصول، کشور، نوع قیمت) در هر batch، پس مقایسه‌ی هفته‌به‌هفته اینجا دیگه بین
دو منبع/دوره‌ی متفاوت رو به‌جای هم نمی‌ذاره.
"""

import os
import json
from datetime import date, timedelta

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
BASE_FOB_USD = 250

PRODUCT_FA = {"sodium bicarbonate": "جوش شیرین", "soda ash": "سودا اش"}
PRICE_TYPE_FA = {"domestic": "داخلی", "FOB": "FOB", "CIF": "CIF"}

# کشورهای کلیدی گزارش — رقبای تحت رصد (ترکیه، چین، روسیه) + بزرگ‌ترین بازار
# هدفی که گزارش کامل داریم (برزیل). روسیه هنوز در price_intelligence_bot.py
# منبع قیمت نداره؛ به‌جای حذف سطرش، با یادداشت «به‌زودی» نشون داده می‌شه تا
# معلوم باشه عمداً جا نیفتاده، نه فراموش شده.
KEY_COUNTRIES = ["China", "Turkey", "Brazil", "Russia"]

TRANSIT_TOPIC = "ترانزیت، کرایه‌ی حمل و لجستیک"


def _load(name: str, fallback):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return fallback
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _flat_price_rows() -> list[dict]:
    rows = []
    for batch in _load("price_history.json", []):
        for r in batch.get("records", []):
            if r.get("value") is None:
                continue
            rows.append({**r, "batch_date": batch["date"]})
    return rows


def build_price_tables(lookback_days: int = 7) -> tuple[list[dict], list[dict]]:
    """
    برمی‌گردونه: (جدول قیمت‌های دلاری، جدول قیمت‌های ارز محلی) — عمداً دو جدول
    جدا، چون طبق قانون ثابت پروژه هرگز نباید قیمت دلاری و ارز محلی روی یک
    جدول/محور قاطی بشن (مقیاسشون کاملاً فرق می‌کنه).

    برای هر سری (محصول، کشور، نوع قیمت)، جدیدترین رکورد و نزدیک‌ترین رکورد به
    «حدود یک هفته پیش» (نه دقیقاً، چون ربات هر روز تقویمی اجرا نمی‌شه) رو پیدا
    می‌کنه و درصد تغییر بینشون رو حساب می‌کنه.
    """
    rows = _flat_price_rows()
    series: dict[tuple, list[dict]] = {}
    for r in rows:
        key = (r.get("product"), r.get("country_or_region"), r.get("price_type"))
        series.setdefault(key, []).append(r)

    cutoff = (date.today() - timedelta(days=lookback_days)).isoformat()

    usd_table, local_table = [], []
    for entries in series.values():
        entries.sort(key=lambda r: r["batch_date"])
        latest = entries[-1]

        earlier_candidates = [e for e in entries if e["batch_date"] <= cutoff]
        earlier = earlier_candidates[-1] if earlier_candidates else None

        pct_change = None
        if earlier and earlier.get("value"):
            pct_change = round((latest["value"] - earlier["value"]) / earlier["value"] * 100, 1)

        row = {
            "product": latest.get("product"),
            "product_fa": PRODUCT_FA.get(latest.get("product"), latest.get("product")),
            "country": latest.get("country_or_region"),
            "price_type_fa": PRICE_TYPE_FA.get(latest.get("price_type"), latest.get("price_type")),
            "value": latest.get("value"),
            "currency": latest.get("currency"),
            "unit": latest.get("unit"),
            "prev_value": earlier.get("value") if earlier else None,
            "pct_change": pct_change,
            "source_name": latest.get("source_name"),
            "batch_date": latest.get("batch_date"),
            "history": [(e["batch_date"], e["value"]) for e in entries],
        }
        (usd_table if latest.get("currency") == "USD" else local_table).append(row)

    usd_table.sort(key=lambda r: (r["product_fa"], r["country"]))
    local_table.sort(key=lambda r: (r["product_fa"], r["country"]))
    return usd_table, local_table


def biggest_mover(usd_table: list[dict]) -> dict | None:
    candidates = [r for r in usd_table if r["pct_change"] is not None]
    if not candidates:
        return None
    return max(candidates, key=lambda r: abs(r["pct_change"]))


def key_country_prices(usd_table: list[dict]) -> list[dict]:
    """
    قیمت جوش شیرین برای کشورهای کلیدی (KEY_COUNTRIES) — نه «مبنای خودمون»،
    چون گزارش قراره روی قیمت رقبا/بازار تمرکز کنه، نه تکرار عدد ثابتی که خودِ
    مدیرها از قبل حفظن. ترجیح با FOB (قابل‌مقایسه‌ترین با صادرات ما)؛ اگه FOB
    نبود، هر نوع قیمتی که موجوده.
    """
    bicarb = [r for r in usd_table if r["product"] == "sodium bicarbonate"]
    result = []
    for country in KEY_COUNTRIES:
        rows = [r for r in bicarb if r["country"] == country]
        if not rows:
            result.append({"country": country, "available": False})
            continue
        row = next((r for r in rows if r["price_type_fa"] == "FOB"), rows[0])
        result.append({"country": country, "available": True, **row})
    return result


def recent_news(days: int = 7) -> list[dict]:
    log = _load("news_analysis_log.json", [])
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    items = [n for n in log if n.get("date", "") >= cutoff]
    items.sort(key=lambda n: n.get("date", ""), reverse=True)
    return items


def split_news(news_items: list[dict]) -> tuple[list[dict], list[dict]]:
    """اخبار رو به دو دسته جدا می‌کنه: عمومی (بازار/رقبا/انرژی) و ترانزیت — چون
    گزارش عمداً این دو رو در دو بخش پشت‌سرهم و جدا می‌خواد، نه قاطی."""
    transit = [n for n in news_items if n.get("topic") == TRANSIT_TOPIC]
    general = [n for n in news_items if n.get("topic") != TRANSIT_TOPIC]
    return general, transit


def build_report_data() -> dict:
    usd_table, local_table = build_price_tables()
    news = recent_news()
    general_news, transit_news = split_news(news)
    return {
        "generated_date": date.today().isoformat(),
        "base_fob_usd": BASE_FOB_USD,
        "key_prices": key_country_prices(usd_table),
        "usd_table": usd_table,
        "local_table": local_table,
        "biggest_mover": biggest_mover(usd_table),
        "general_news": general_news,
        "transit_news": transit_news,
    }
