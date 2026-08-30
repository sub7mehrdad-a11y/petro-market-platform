"""
ربات روزانه‌ی اخبار و تحلیل بازار جوش شیرین/پتروشیمی.

منطق کار:
  1. متن خام چند صفحه‌ی خبری/تجاری تأییدشده (بعد از حذف تگ HTML) رو با یک
     درخواست HTTP ساده می‌گیره (نه از طریق ابزار جست‌وجوی گوگل — دلیلش رو
     توی price_intelligence_bot.py بخون: آزمایش شد و روی کلیدهای رایگان تازه‌ساز
     با خطای quota مواجه می‌شه).
  2. از Gemini می‌خواد بر اساس همون متن‌ها **چند آیتم خبری کوتاه (فارسی)** بنویسه —
     هر آیتم در یک «موضوع» متفاوت (بازار سودا اش / صنعت و رقبا / ترانزیت و کرایه /
     انرژی و ژئوپلیتیک) — که:
       - خلاصه‌ی خبر رو به زبان خودش بیان کنه (نه کپی مستقیم از متن اصلی)
       - ربطش به وضعیت شرکت (قیمت پایه‌ی FOB ۲۵۰ دلار، رقیب اصلی ترکیه) رو توضیح بده
       - منبع هر نکته رو ذکر کنه (نام رسانه + لینک)
  3. تکراری‌ها **در همین اسکریپت (نه توسط مدل)** حذف می‌شن، و بقیه به‌صورت رکوردهای
     جداگانه توی فایل JSON ذخیره می‌شن تا سایت ازشون بخونه.

تاریخچه‌ی یک باگ مهم (۲۰۲۶-۰۸-۲۳):
  نسخه‌ی قبلی روزی فقط **یک** تحلیل تولید می‌کرد و تصمیم «تکراری‌بودن» رو کامل به
  خود مدل سپرده بود (فیلد has_new_content). چون شاخص سودا اش TradingEconomics چند
  روز روی همون عدد ثابت مونده بود، مدل هر روز کل روز رو تکراری اعلام می‌کرد و
  خروجی صفر می‌شد — یعنی خبرهای واقعاً تازه‌ی حمل‌ونقل/انرژی/صنعت هم قربانی
  ثابت‌موندن یک عدد می‌شدن. از ۱۹ تا ۲۳ اوت هیچ خبری ثبت نشد و صفحه‌ی اخبار و
  صفحه‌ی ترانزیت (که از همین فایل فیلتر می‌شه) هر دو یخ زدن.
  راه‌حل: تشخیص تکرار «به‌ازای هر آیتم» و با اثرانگشت عددی، داخل پایتون.

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
from datetime import datetime, timezone, date

from google import genai

from fetch_utils import (
    fetch_sources, build_sources_block, fetch_rss_sources, build_rss_block,
)

# کنسول ویندوز پیش‌فرضش cp1252 هست که فارسی رو نمی‌تونه چاپ کنه؛ لینوکس/گیت‌هاب
# اکشنز این مشکل رو نداره ولی این خط بی‌ضرره و روی هر پلتفرمی امنه.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GEMINI_MODEL = "gemini-3.6-flash"

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "news_analysis_log.json")

# موضوع‌های خبری. هدف این تفکیک فقط دسته‌بندی نیست — تضمین می‌کنه ثابت‌موندن یک
# موضوع (مثلاً شاخص سودا اش) بقیه‌ی موضوع‌ها رو خفه نکنه، و صفحه‌ی /transit هم
# مستقیم از روی topic فیلتر بشه (نه فقط با جست‌وجوی کلیدواژه در متن).
TOPICS = [
    "بازار سودا اش و کربنات سدیم",
    "صنعت جوش شیرین و رقبا",
    "ترانزیت، کرایه‌ی حمل و لجستیک",
    "انرژی، ارز و ژئوپلیتیک",
]

MAX_ITEMS_PER_RUN = 4          # حداکثر یک آیتم به‌ازای هر موضوع
DEDUP_LOOKBACK_DAYS = 12       # پنجره‌ی مقایسه برای تشخیص تکرار

# منابع seed برای اخبار/تحلیل — نقطه‌ی شروع، نه فهرست بسته. هر منبع جدید معتبر
# و بدون‌لاگینی که پیدا کردید همین‌جا اضافه کنید.
SEED_NEWS_SOURCES = [
    "https://www.dailysabah.com/business",  # اقتصاد/صادرات ترکیه
    "https://tradingeconomics.com/commodity/soda-ash",  # سیگنال قیمت + تحلیل کوتاه
    "https://chemxplore.com/countries/turkey",  # اخبار صنعت شیمیایی ترکیه
    "https://www.chemeurope.com/en/news/",  # اخبار عمومی صنعت شیمی (رایگان، تست‌شده)
    "https://oilprice.com/Latest-Energy-News/World-News/",  # انرژی/کشتیرانی/ژئوپلیتیک جهانی (خیلی فعال، رایگان)
    # نکته‌ی ۲۰۲۶-۰۸-۲۱: آدرس قدیمی freightos.com/freight-index/ به ۴۰۴ خورده بود
    # (تازه کشف‌شده — قبلاً fetch مستقیمش تست نشده بود چون پراکسی این جلسه
    # دسترسی خروجی رو می‌بست). آدرس درست رو مستقیم از منوی سایت پیدا کردم.
    "https://www.freightos.com/freightos-baltic-index/",  # FBX - شاخص جهانی کرایه‌ی کانتینری، صفحه‌ی عمومی رایگان (تأیید مستقیم: عدد واقعی $3,562.75 آورد)
    "https://www.drewry.co.uk/world-container-index",  # Drewry WCI - گزارش هفتگی با نرخ مسیرهای اصلی (Shanghai-LA/NY/Rotterdam/Genoa)، رایگان (تأیید مستقیم ۲۰۲۶-۰۸-۲۱)
    "https://tradingeconomics.com/commodity/baltic",  # Baltic Dry Index (BDI) - کرایه‌ی حمل فله خشک (مرتبط با گرید سنگین سودا اش)، رایگان (تأیید مستقیم ۲۰۲۶-۰۸-۲۱، سایت رسمی Baltic Exchange خودش پشت چالش امنیتیه)
    # --- منابع اخبار روسیه (اضافه‌شده ۲۰۲۶-۰۸-۳۰) ---
    # کاربر فهرستی از منابع خبری روسی (از جمینای) داد؛ همه مستقیم fetch و تست شدند.
    # اکثرشون (Хим-Курьер بخش تخصصی، RZD-Partner، RCC Group، سایت‌های افشای مالی
    # مثل e-disclosure/checko/rusprofile) یا پی‌وال داشتن، یا ۴۰۳/۵۰۳ برگردوندن،
    # یا اصلاً قابل‌اتصال نبودن — رد شدن.
    "https://rupec.ru/",  # RUPEC - پرتال تحلیلی پتروشیمی/شیمیایی معدنی روسیه، اخبار تاریخ‌دار رایگان بدون پی‌وال (تأیید end-to-end در خود ربات، ۲۰۲۶-۰۸-۳۰)
]

# بررسی شد و عمداً اضافه نشد: ХимОнлайн (himonline.ru) و PortNews (portnews.ru).
# با ابزار WebFetch جواب می‌دن، ولی وقتی از fetch_page_text واقعیِ همین فایل
# (urllib خام) تست شدن، هر دو تایم‌اوت دادن (himonline: SSL handshake timeout،
# portnews: read timeout) — به‌احتمال زیاد سیستم ضدربات روسی (شبیه Qrator) که
# مرورگر واقعی/httpx رو رد می‌کنه ولی urllib ساده رو معطل نگه می‌داره. اگه بعداً
# fetch_utils.py به httpx مهاجرت کرد (مثل groq_utils.py)، دوباره امتحان کن.

# --- فیدهای RSS تخصصی حمل‌ونقل دریایی/لجستیک ---
#
# هر پنج فید در ۲۰۲۶-۰۸-۲۳ مستقیم تست شدند: همه HTTP 200، XML سالم، بدون نیاز به
# لاگین یا اشتراک، و همه با خلاصه‌ی واقعی (نه فقط تیتر). این‌ها منبع «رویداد» هستند
# (بستن کانال، تحریم، ازدحام بندر، لغو سفر)، در حالی که منابع HTML بالا منبع «عدد»
# هستند (FBX، WCI، BDI) — این دو مکمل هم‌اند، نه جایگزین.
RSS_NEWS_SOURCES = [
    # تازه‌ترین و پرحجم‌ترین فید در تست؛ تخصصی کانتینر و ترمینال — نزدیک‌ترین
    # فید به کاری که ما می‌کنیم (صادرات کیسه‌ای/کانتینری).
    {"name": "Container News", "url": "https://container-news.com/feed/"},
    # اخبار جامع لجستیک و تعرفه‌های تجاری؛ بلندترین خلاصه‌ها (میانه ~۵۹۰ کاراکتر).
    {"name": "The Loadstar", "url": "https://theloadstar.com/feed/"},
    # دریایی/بنادر؛ در همان تست خبر کانال پاناما و جابه‌جایی جریان تانکرها را داشت.
    {"name": "Splash247", "url": "https://splash247.com/feed/"},
    # شاخص‌محور: گزارش هفتگی Xeneta و اخبار کشتیرانی — مکمل عددهای FBX/WCI.
    {"name": "Hellenic Shipping News", "url": "https://www.hellenicshippingnews.com/feed/"},
    # دریانوردی عمومی؛ نسبت نویزش از بقیه بیشتر است (خبرهای نجات دریایی و نظامی)،
    # ولی برای رویدادهای ژئوپلیتیک مسیرها ارزش دارد — به همین دلیل غربال کلیدواژه‌ای
    # روی همه‌ی فیدها اعمال می‌شود.
    {"name": "gCaptain", "url": "https://gcaptain.com/feed/"},
]

# غربال اولیه‌ی ربط. عمداً سخاوتمند است (نام کشورها/تنگه‌ها/شاخص‌ها + واژگان کرایه)
# و اگر برای یک فید کمتر از سه آیتم بماند، سه خبر تازه‌ی همان فید بدون فیلتر
# فرستاده می‌شود — قضاوت نهایی با مدل است.
RSS_RELEVANCE_KEYWORDS = [
    "freight", "container", "rate", "tariff", "port", "terminal", "congestion",
    "canal", "suez", "hormuz", "red sea", "panama", "strait", "tanker", "bulk",
    "chemical", "soda", "bicarbonate", "sanction", "blank sailing", "teu",
    "index", "shipping line", "carrier", "rail", "corridor", "transit",
    "iran", "turkey", "türkiye", "russia", "china", "caspian", "black sea",
    "georgia", "armenia", "gulf", "middle east",
]

# بررسی شد و عمداً اضافه نشد: UN Comtrade / WITS / ITC MacMap. این‌ها API/جدول
# داده‌ی ساختاریافته‌ن (حجم تجارت، تعرفه)، نه صفحه‌ی متنی/خبری قابل «خلاصه‌سازی
# روایی» — با معماری این ربات (fetch متن + تحلیل روایی Gemini) هم‌خوان نیستن.
# اگه بعداً خواستید، این‌ها باید یک اسکریپت جدا (شبیه enrich_countries.py، با
# فراخوانی API ساختاریافته به‌جای fetch متن) بشن، نه یک URL دیگه توی همین لیست.

# آرگوس (argusmedia.com) عمداً اینجا نیست: صفحه‌ی اخبارش کاملاً با جاوااسکریپت
# رندر می‌شه (fetch مستقیم فقط منوی ناوبری رو برمی‌گردونه، نه مقاله)، RSS هم نداره،
# و پشت همون سیستم ضدربات Incapsula هست که ICIS رو هم بلاک کرده — یعنی واقعاً غیرقابل‌
# دسترسیه با fetch ساده، نه فقط یک محدودیت فرضی.

COMPANY_CONTEXT = """
شرکت ما تولیدکننده‌ی جوش شیرین (سدیم بی‌کربنات، برند "جوش شیرین پارس"، کد تعرفه HS 283630)،
سود پرک، و کود آمونیوم سولفات است.
قیمت پایه‌ی مرجع FOB برای جوش شیرین صادراتی حدود ۲۵۰ دلار بر تن است.

رقبای صادراتی تحت رصد ما: **ترکیه** (رقیب نزدیک لجستیکی در بازارهای منطقه‌ای)،
**چین** (بزرگ‌ترین تولیدکننده‌ی جهان، رقیب قیمتی در بازارهای دوردست)، و **روسیه**
(تولیدکننده‌ی عمده با انرژی ارزان، اخیراً به رصد اضافه شده؛ به‌خاطر تحریم‌ها، در
بازارهای CIS/آسیای میانه/قفقاز رقیب مهمی برای ما محسوب می‌شود — پروفایل کامل تولیدکنندگانش
هنوز در حال تکمیل است).
هر جا از «رقبا» حرف می‌زنی، فقط ترکیه را نام نبر — اگر خبر به چین یا روسیه مربوط
است، همان را نام ببر؛ اگر به چند کشور مربوط است، همه را.
"""

# اصطلاحات فنی که مدل مستعد ترجمه‌ی غلط آن‌هاست — تور ایمنی بعد از تولید متن،
# چون فقط تذکر در پرامپت تضمینی نیست.
#
# «foot» در «40-foot container» واحد طول (فوت) است، نه «قدم»؛ «کانتینر ۴۰ قدمی»
# در متن تخصصی حمل‌ونقل غلط است. عمداً فقط الگوی «عدد + قدمی» اصلاح می‌شود، نه
# هر «قدمی»: عبارت‌های سالم فارسی مثل «قدمی مثبت» یا «در چند قدمی» نباید خراب شوند.
TERMINOLOGY_FIXES = [
    (re.compile(r"([0-9۰-۹]+)\s*قدمی"), r"\1 فوتی"),
]


def fix_terminology(text: str) -> str:
    if not text:
        return text
    for pattern, replacement in TERMINOLOGY_FIXES:
        text = pattern.sub(replacement, text)
    return text

_TOPICS_BLOCK = "\n".join("  - " + t for t in TOPICS)

SYSTEM_PROMPT = f"""
تو یک تحلیلگر بازار محصولات پتروشیمی/شیمیایی برای بخش تحقیق و توسعه‌ی بازرگانی یک
شرکت تولیدکننده‌ی جوش شیرین هستی.

زمینه‌ی شرکت:
{COMPANY_CONTEXT}

من متن خام چند صفحه‌ی خبری/تجاری (بعد از حذف تگ HTML) رو در اختیارت می‌ذارم، به‌همراه
تیتر خبرهای چند روز اخیر (فقط برای اینکه بدونی چی قبلاً پوشش داده شده).

وظیفه‌ات: بین ۱ تا {MAX_ITEMS_PER_RUN} **آیتم خبری مجزا** به فارسی بنویس. هر آیتم باید
دقیقاً یکی از این موضوع‌ها باشه و از هر موضوع حداکثر یک آیتم بیار:
{_TOPICS_BLOCK}

قواعد هر آیتم:
- فقط بر اساس متن‌های خام داده‌شده (نه دانش قبلی خودت). چیزی اختراع نکن.
- خلاصه با زبان خودت (هرگز جمله‌ی کامل از منبع کپی نکن؛ نقل‌قول مستقیم فقط اگر
  ضروریه و زیر ۱۵ کلمه باشه).
- حداکثر ۱۲۰ کلمه، و حتماً یک جمله درباره‌ی تاثیرش بر استراتژی صادراتی شرکت
  (نسبت به قیمت پایه‌ی ۲۵۰ دلار و رقابت با رقبای مربوط به همان خبر).
- یک تیتر کوتاه (حداکثر ۱۲ کلمه).
- فیلد key_facts: فهرست کوتاه اعداد/رویدادهای کلیدی که آیتم روشون بنا شده
  (مثل "سودا اش ۱۰۳۰ یوآن بر تن"، "FBX معادل ۳۵۶۲ دلار"). این فیلد برای تشخیص
  خودکار تکرار استفاده می‌شه، پس اعداد رو دقیق بنویس.
- فقط منابعی که واقعاً ازشون استفاده کردی رو در sources فهرست کن (نام رسانه + لینک).
  برای خبرهایی که از فیدها برداشتی، **لینک مستقیم همان مقاله** رو بذار (که کنار هر
  آیتم آمده)، نه آدرس خود فید. خلاصه‌ی فیدها متن شخص ثالثه — بازنویسی کن، کپی نکن.

اصطلاحات فنی (ترجمه‌ی تحت‌اللفظی نکن):
- «40-foot container» یعنی «کانتینر ۴۰ فوتی» — فوت واحد طول است، هرگز «۴۰ قدمی» ننویس.
  همین‌طور ۲۰ فوتی و ۴۵ فوتی. TEU و FEU را هم به همین شکل انگلیسی نگه دار.
- «dry bulk» یعنی «فله‌ی خشک»، «tonne/metric ton» یعنی «تن»، «freight rate» یعنی
  «نرخ کرایه‌ی حمل».

قواعد کل خروجی:
- اگر برای یک موضوع خبر تازه‌ای در متن‌ها نبود، **فقط همون موضوع رو حذف کن** —
  نه اینکه کل خروجی رو خالی برگردونی. حتی یک آیتم تازه هم ارزش ثبت داره.
- اگر عدد/رویداد یک موضوع دقیقاً همون چیزیه که در تیترهای اخیر پایین می‌بینی و
  هیچ تغییری نکرده، اون موضوع رو نیار و سراغ موضوع‌های دیگه برو.
- اگر در هیچ موضوعی چیز تازه‌ای نبود، آرایه‌ی items رو خالی برگردون.

خروجی رو دقیقاً به این شکل JSON بده (بدون markdown fence، بدون توضیح اضافه):
{{
  "items": [
    {{
      "topic": "یکی از موضوع‌های بالا، عیناً",
      "headline_fa": "تیتر کوتاه...",
      "analysis_fa": "...",
      "key_facts": ["...", "..."],
      "sources": [{{"name": "...", "url": "..."}}]
    }}
  ]
}}
"""

# ------------------------------------------------------------------ ورودی/خروجی


def load_log() -> list[dict]:
    if not os.path.exists(OUTPUT_FILE):
        return []
    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def load_recent_entries(log: list[dict], days: int = DEDUP_LOOKBACK_DAYS) -> list[dict]:
    """رکوردهای پنجره‌ی اخیر — مبنای هم پرامپت و هم تشخیص تکرار."""
    today = date.today()
    recent = []
    for e in log:
        try:
            d = date.fromisoformat(e.get("date", ""))
        except ValueError:
            continue
        if (today - d).days <= days:
            recent.append(e)
    return recent


def build_recent_block(recent_entries: list[dict]) -> str:
    if not recent_entries:
        return "(هنوز خبری ثبت نشده.)"
    parts = []
    for e in recent_entries[-12:]:
        topic = e.get("topic", "—")
        parts.append(f"- {e.get('date')} [{topic}]: {e.get('headline_fa')}")
    return "\n".join(parts)


def save_log(log: list[dict]):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)


# ------------------------------------------------------------- تشخیص تکرار

PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

# کلمه‌های پرتکرار فارسی که در سنجش شباهت تیتر نویز ایجاد می‌کنن.
STOPWORDS = {
    "قیمت", "بازار", "جهانی", "برای", "بر", "به", "از", "با", "در", "که", "این",
    "روی", "شرکت", "صادرات", "صادراتی", "کاهش", "افزایش", "چالش", "چالش‌های",
    "تحلیل", "خبر", "روند", "نرخ", "تن", "دلار", "و",
}


def _normalize(text: str) -> str:
    return (text or "").translate(PERSIAN_DIGITS)


def extract_numbers(*texts: str) -> set[str]:
    """همه‌ی اعداد متن (با ارقام فارسی نرمال‌شده) — اثرانگشت واقعی یک خبر."""
    nums = set()
    for t in texts:
        for raw in re.findall(r"\d+(?:[.,٫]\d+)?", _normalize(t)):
            nums.add(raw.replace(",", "").replace("٫", ".").rstrip("."))
    # عددهای تک‌رقمی تمایزی ایجاد نمی‌کنن (شماره‌ی بند، تاریخ کوتاه و…)
    return {n for n in nums if len(n) >= 2}


def headline_tokens(headline: str) -> set[str]:
    words = re.findall(r"[^\s،؛؟.,:;!?()«»\-–—]+", _normalize(headline))
    return {w for w in words if len(w) > 2 and w not in STOPWORDS}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def is_duplicate(item: dict, recent_entries: list[dict]) -> bool:
    """
    یک آیتم وقتی تکراریه که در همون موضوع، هم اعدادش تازه نباشن و هم تیترش شبیه
    یکی از خبرهای اخیر باشه. اگر آیتم اصلاً عدد نداره (خبر رویدادی)، فقط شباهت
    تیتر با آستانه‌ی سخت‌گیرانه‌تر ملاکه.
    """
    topic = item.get("topic", "")
    facts = " ".join(item.get("key_facts") or [])
    item_nums = extract_numbers(item.get("headline_fa", ""), facts, item.get("analysis_fa", ""))
    item_tokens = headline_tokens(item.get("headline_fa", ""))

    for e in recent_entries:
        # رکوردهای قدیمی topic ندارن؛ عمداً از مقایسه کنارشون نمی‌ذاریم.
        if e.get("topic") and e.get("topic") != topic:
            continue
        e_facts = " ".join(e.get("key_facts") or [])
        e_nums = extract_numbers(e.get("headline_fa", ""), e_facts, e.get("analysis_fa", ""))
        e_tokens = headline_tokens(e.get("headline_fa", ""))
        title_sim = _jaccard(item_tokens, e_tokens)

        if item_nums:
            fresh = item_nums - e_nums
            # هیچ عدد تازه‌ای نسبت به این رکورد نداره و تیتر هم هم‌خانواده‌ست
            if not fresh and title_sim >= 0.30:
                return True
        elif title_sim >= 0.55:
            return True
    return False


# ------------------------------------------------------------------- اجرا


def run_daily_analysis(client: genai.Client, sources_block: str, recent_block: str) -> str:
    query_text = (
        f"تیتر خبرهای چند روز اخیر (قبلاً پوشش داده شده — تکرارشون نکن):\n{recent_block}\n\n"
        f"بر اساس متن‌های زیر آیتم‌های خبری امروز رو بنویس:\n\n{sources_block}"
    )

    interaction = client.interactions.create(
        model=GEMINI_MODEL,
        system_instruction=SYSTEM_PROMPT,
        input=query_text,
    )

    return interaction.output_text


def parse_output(raw_text: str) -> list[dict]:
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
    raw = fence_match.group(1) if fence_match else raw_text

    obj_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not obj_match:
        print("[WARN] خروجی مدل JSON نبود؛ چیزی ثبت نشد.")
        return []

    try:
        parsed = json.loads(obj_match.group(0))
    except json.JSONDecodeError:
        print("[WARN] JSON خروجی مدل قابل تجزیه نبود؛ چیزی ثبت نشد.")
        return []

    items = parsed.get("items")
    if isinstance(items, list):
        return [i for i in items if isinstance(i, dict) and i.get("analysis_fa")]

    # عقب‌گرد سازگاری: اگه مدل به فرمت قدیمی (تک‌آیتم) جواب داد، دورش نریز.
    if parsed.get("analysis_fa"):
        return [parsed]
    return []


def main():
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY تنظیم نشده است.")

    log = load_log()
    recent = load_recent_entries(log)

    fetched = fetch_sources(SEED_NEWS_SOURCES)
    feeds = fetch_rss_sources(RSS_NEWS_SOURCES, keywords=RSS_RELEVANCE_KEYWORDS)

    if not any(f["ok"] for f in fetched) and not any(f["ok"] for f in feeds):
        raise SystemExit("[ERROR] هیچ‌کدام از منابع خبری در دسترس نبودند؛ اجرا متوقف شد.")

    sources_block = (
        build_sources_block(fetched)
        + "\n\n=== فیدهای خبری تخصصی حمل‌ونقل (تیتر + تاریخ + خلاصه + لینک) ===\n"
        + build_rss_block(feeds)
    )
    recent_block = build_recent_block(recent)

    client = genai.Client(api_key=api_key)
    raw_text = run_daily_analysis(client, sources_block, recent_block)
    items = parse_output(raw_text)
    print(f"[INFO] مدل {len(items)} آیتم برگرداند.")

    now = datetime.now(timezone.utc)
    today_iso = now.date().isoformat()
    seen_topics = set()
    added = 0

    for item in items:
        topic = (item.get("topic") or "").strip() or TOPICS[0]
        if topic in seen_topics:
            print(f"[SKIP] بیش از یک آیتم برای موضوع «{topic}» — دومی ثبت نشد.")
            continue
        if is_duplicate(item, recent):
            print(f"[SKIP] تکراری نسبت به {DEDUP_LOOKBACK_DAYS} روز اخیر: {item.get('headline_fa')}")
            continue

        record = {
            "date": today_iso,
            "generated_at": now.isoformat(),
            "topic": topic,
            "headline_fa": fix_terminology(item.get("headline_fa", "")),
            "analysis_fa": fix_terminology(item.get("analysis_fa", "")),
            "key_facts": [fix_terminology(f) for f in item.get("key_facts", [])],
            "sources": item.get("sources", []),
        }
        log.append(record)
        recent.append(record)   # تا آیتم بعدی همین اجرا هم با این مقایسه بشه
        seen_topics.add(topic)
        added += 1
        print(f"[OK] ثبت شد [{topic}]: {record['headline_fa']}")

    if added:
        save_log(log)
        print(f"[OK] مجموعاً {added} خبر تازه‌ی {today_iso} ذخیره شد.")
    else:
        print("[SKIP] هیچ خبر تازه‌ای نسبت به روزهای اخیر پیدا نشد؛ فایل دست‌نخورده ماند.")


if __name__ == "__main__":
    main()
