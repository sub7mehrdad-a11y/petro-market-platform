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
        html = resp.read().decode("utf-8", errors="ignore")

    text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", "\n", text)

    # خطوطی که بعد از حذف تگ فقط فاصله/خالی موندن (مثل آیتم‌های خالی منوی ناوبری)
    # رو کامل حذف کن، وگرنه سهم زیادی از max_chars صرف خط‌های خالی می‌شه.
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    text = "\n".join(lines)

    return text[:max_chars]


def fetch_sources(urls: list[str], max_chars: int = 6000) -> list[dict]:
    """چند URL رو می‌گیره؛ اگه یکی fail بشه بقیه رو متوقف نمی‌کنه، فقط با خطا ثبت می‌شه."""
    results = []
    for url in urls:
        try:
            text = fetch_page_text(url, max_chars=max_chars)
            results.append({"url": url, "ok": True, "text": text})
            print(f"[OK] fetched {url} ({len(text)} chars)")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
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
