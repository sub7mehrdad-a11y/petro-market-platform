"""
ابزار مشترک هر دو ایجنت: گرفتن یک صفحه‌ی وب و تبدیلش به متن ساده (بدون تگ HTML).

چرا این‌جا (نه توی خود Gemini): چون ابزار Grounding with Google Search گوگل برای
کلیدهای رایگان تازه‌ساز با خطای quota (۴۲۹) مواجه می‌شه (مشکل شناخته‌شده در
فروم رسمی گوگل، نه باگ ما). به‌جاش خودمون صفحه رو می‌گیریم و متنش رو به Gemini
می‌دیم تا فقط «تحلیل» کنه، نه «جست‌وجو» — این بخش (تولید متن ساده بدون ابزار)
با کلید رایگان تست و تأیید شده.

هر منبع حداکثر روزی یک‌بار خونده می‌شه (توسط GitHub Actions که روزی یک‌بار اجرا می‌شه)
تا فشار غیرمنطقی به سرور مبدأ وارد نشه.
"""

import re
import ssl
import html
import http.client
import xml.etree.ElementTree as ET
import urllib.request
import urllib.error

import certifi

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}

# روی بعضی نصب‌های ویندوز، فروشگاه گواهی سیستم برای urllib کامل نیست و SSL fail
# می‌شه؛ استفاده‌ی صریح از باندل certifi این مشکل رو روی هر پلتفرمی (ویندوز/لینوکس
# گیت‌هاب اکشنز) حل می‌کنه.
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def fetch_page_text(url: str, max_chars: int = 6000, timeout: int = 20) -> str:
    """HTML رو می‌گیره، تگ/اسکریپت/استایل رو حذف می‌کنه، و به یک متن ساده و کوتاه تبدیل می‌کنه."""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
        # نام raw_html (نه html) چون ماژول html بالا import شده و سایه‌انداختن
        # روی اسمش، اولین کسی که این تابع رو گسترش بده گیج می‌کنه.
        raw_html = resp.read().decode("utf-8", errors="ignore")

    text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw_html)
    text = re.sub(r"(?s)<[^>]+>", "\n", text)

    # خطوطی که بعد از حذف تگ فقط فاصله/خالی موندن (مثل آیتم‌های خالی منوی ناوبری)
    # رو کامل حذف کن، وگرنه سهم زیادی از max_chars صرف خط‌های خالی می‌شه.
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    text = "\n".join(lines)

    return text[:max_chars]


def fetch_sources(urls: list[str], max_chars: int = 6000, retries: int = 1) -> list[dict]:
    """
    چند URL رو می‌گیره؛ اگه یکی fail بشه بقیه رو متوقف نمی‌کنه، فقط با خطا ثبت می‌شه.

    یک‌بار تلاش مجدد با مهلت بلندتر انجام می‌شه: تجربه‌ی ۲۰۲۶-۰۸-۲۳ نشون داد بعضی
    منابع (chemeurope، drewry) گاهی کندتر از ۲۰ ثانیه جواب می‌دن و بی‌دلیل از سبد
    تحلیل روز حذف می‌شدن.
    """
    results = []
    for url in urls:
        try:
            text = None
            for attempt in range(retries + 1):
                try:
                    text = fetch_page_text(url, max_chars=max_chars, timeout=20 + attempt * 20)
                    break
                except urllib.error.HTTPError:
                    raise  # ۴۰۴/۴۰۳ با تلاش مجدد درست نمی‌شه؛ فقط وقت تلف می‌کنه
                except (OSError, http.client.HTTPException):
                    if attempt == retries:
                        raise
                    print(f"[RETRY] {url}")
            results.append({"url": url, "ok": True, "text": text})
            print(f"[OK] fetched {url} ({len(text)} chars)")
        # چرا OSError و HTTPException (نه فقط URLError): اگر یک منبع وسط پاسخ
        # اتصال رو ببنده، پایتون RemoteDisconnected/ConnectionResetError می‌ده که
        # زیرمجموعه‌ی URLError نیست — قبلاً همین باعث می‌شد کل ربات خبر با یک
        # منبع بدقلق crash کنه و هیچ خبری ثبت نشه.
        except (OSError, http.client.HTTPException) as e:
            results.append({"url": url, "ok": False, "text": "", "error": str(e)})
            print(f"[WARN] failed to fetch {url}: {e}")
    return results


def build_sources_block(fetched: list[dict]) -> str:
    """نتیجه‌ی fetch_sources رو به یک بلوک متنی با برچسب URL برای پرامپت مدل تبدیل می‌کنه."""
    parts = []
    for item in fetched:
        if item["ok"]:
            parts.append(f"--- منبع: {item['url']} ---\n{item['text']}\n")
        else:
            parts.append(f"--- منبع: {item['url']} (در دسترس نبود: {item.get('error')}) ---\n")
    return "\n".join(parts)


# ----------------------------------------------------------------- فیدهای RSS
#
# چرا RSS جدا از fetch_page_text: صفحه‌ی HTML یک سایت خبری بعد از حذف تگ، عمدتاً
# منو و فوتر و تبلیغه و فقط تیتر خام می‌ده. فید RSS همون محتوا رو ساختاریافته
# می‌ده — تیتر + تاریخ انتشار + خلاصه + لینک مستقیم مقاله. لینک مستقیم مهمه چون
# پرامپت ما موظفه منبع هر نکته رو با لینک ذکر کنه.

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _clean_html_fragment(text: str) -> str:
    text = _TAG_RE.sub(" ", text or "")
    text = html.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def fetch_rss(url: str, max_items: int = 12, timeout: int = 20) -> list[dict]:
    """
    یک فید RSS/Atom رو می‌گیره و به فهرست {title, date, summary, link} تبدیل می‌کنه.
    خطا رو بالا می‌ده؛ مدیریت خطا با فراخوان (مثل fetch_sources) است.
    """
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
        raw = resp.read()

    root = ET.fromstring(raw)
    nodes = root.findall(".//item")
    atom_ns = "{http://www.w3.org/2005/Atom}"
    if not nodes:
        nodes = root.findall(f".//{atom_ns}entry")

    items = []
    for node in nodes[:max_items]:
        title = node.findtext("title") or node.findtext(f"{atom_ns}title") or ""
        summary = (
            node.findtext("description")
            or node.findtext(f"{atom_ns}summary")
            or node.findtext(f"{atom_ns}content")
            or ""
        )
        link = node.findtext("link") or ""
        if not link:
            link_node = node.find(f"{atom_ns}link")
            link = link_node.get("href", "") if link_node is not None else ""
        date = node.findtext("pubDate") or node.findtext(f"{atom_ns}updated") or ""

        items.append({
            "title": _clean_html_fragment(title),
            "summary": _clean_html_fragment(summary),
            "link": link.strip(),
            "date": date.strip(),
        })
    return items


def _compile_keyword_patterns(keywords: list[str]) -> list[re.Pattern]:
    """
    تطبیق با مرز کلمه، نه زیررشته. بدون این کار «port» داخل «opportunity» و
    «important»، و «rate» داخل «corporate» می‌افتاد و خبرهای بی‌ربط از غربال
    رد می‌شدند (در تست ۲۳ اوت، خبر ساخت کشتی تفریحی همین‌طور رد شده بود).
    حالت جمع ساده (s/es) هم پوشش داده می‌شود تا «ports» و «rates» جا نمانند.
    """
    patterns = []
    for kw in keywords:
        escaped = re.escape(kw.lower())
        suffix = r"(?:e?s)?" if " " not in kw else ""
        patterns.append(re.compile(rf"\b{escaped}{suffix}\b"))
    return patterns


def fetch_rss_sources(
    feeds: list[dict], keywords: list[str] | None = None,
    max_items_per_feed: int = 5, summary_chars: int = 320,
) -> list[dict]:
    """
    چند فید رو می‌گیره و اگر keywords داده بشه، فقط آیتم‌های مرتبط رو نگه می‌داره.

    چرا فیلتر: این فیدها اخبار عمومی دریانوردی‌ان و کنارِ خبر مهمِ کرایه و بندر،
    خبرهای کاملاً بی‌ربط هم دارن (کشتی تفریحی، نجات پرنده در دریا). بدون فیلتر،
    بخش زیادی از بودجه‌ی پرامپت صرف نویز می‌شه.

    اگر فیلتر برای یک فید کمتر از سه آیتم بذاره، سه آیتم تازه‌ی همون فید بدون
    فیلتر برگردونده می‌شه — تصمیم نهایی درباره‌ی ربط داشتن با خود مدله، این فقط
    یک غربال اولیه‌ست، نه سانسور منبع.
    """
    results = []
    for feed in feeds:
        try:
            items = fetch_rss(feed["url"])
        except (OSError, http.client.HTTPException, ET.ParseError) as e:
            results.append({**feed, "ok": False, "items": [], "error": str(e)})
            print(f"[WARN] failed to fetch RSS {feed['url']}: {e}")
            continue

        chosen = items
        if keywords:
            patterns = _compile_keyword_patterns(keywords)
            matched = [
                i for i in items
                if any(p.search(f"{i['title']} {i['summary']}".lower()) for p in patterns)
            ]
            chosen = matched if len(matched) >= 3 else items[:3]

        for item in chosen[:max_items_per_feed]:
            item["summary"] = item["summary"][:summary_chars]

        results.append({**feed, "ok": True, "items": chosen[:max_items_per_feed]})
        print(f"[OK] RSS {feed['name']}: {len(items)} آیتم خوانده شد، {len(chosen[:max_items_per_feed])} آیتم مرتبط")
    return results


def build_rss_block(fetched_feeds: list[dict]) -> str:
    """خروجی fetch_rss_sources رو به یک بلوک متنی فشرده برای پرامپت تبدیل می‌کنه."""
    parts = []
    for feed in fetched_feeds:
        if not feed.get("ok"):
            parts.append(f"--- فید {feed['name']} (در دسترس نبود: {feed.get('error')}) ---\n")
            continue
        lines = [f"--- فید {feed['name']} ({feed['url']}) ---"]
        for item in feed["items"]:
            lines.append(f"• {item['title']}")
            if item["date"]:
                lines.append(f"  تاریخ: {item['date']}")
            if item["summary"]:
                lines.append(f"  خلاصه: {item['summary']}")
            if item["link"]:
                lines.append(f"  لینک: {item['link']}")
        parts.append("\n".join(lines) + "\n")
    return "\n".join(parts)
