"""
اعتبارسنجی واقعی وب‌سایت/ایمیل/تلفن شرکت‌ها — با باز کردن خودِ صفحات شرکت.

چرا این اسکریپت (۲۰۲۶-۱۰-۲۳): استخراج‌گر قبلی ایمیل را با رجکس از HTML برمی‌داشت و هیچ‌چیز را
تأیید نمی‌کرد؛ حدود ۷٪ ایمیل‌های گلفود آشغال (شناسه‌ی ردیابی Wix، placeholder) یا دامنه‌ی
ناموجود بود. وب‌سایت‌های «جست‌وجوی وب (حدسی)» هم هیچ‌وقت بررسی نشده بودند که واقعاً مال همان
شرکت باشند.

قاعده‌ی این اسکریپت: فقط چیزی «تأییدشده» حساب می‌شود که
  وب‌سایت : ۱) از فهرست رسمی نمایشگاه آمده و بالا می‌آید، یا ۲) (اگر حدسی/جست‌وجویی است)
            بالا می‌آید و نام شرکت واقعاً در عنوان/متن/دامنه‌ی صفحه هست.
  ایمیل   : روی یک صفحه‌ی خودِ همان سایت دیده شده (آدرس صفحه‌ی منبع ثبت می‌شود)، آشغال
            نیست، و دامنه‌اش با ≥۲ resolver مستقل MX/A دارد. ایمیل هم‌دامنه با سایت
            «اطمینان بالا»؛ ایمیل رایگان/دامنه‌ی دیگر فقط اگر mailto: صریح باشد «متوسط».
            ایمیلی که فقط در فهرست نمایشگاه هست (و روی سایت دیده نشد) جدا برچسب
            «directory_only» می‌خورد، نه «تأییدشده».
  تلفن    : با کتابخانه‌ی phonenumbers معتبر (is_valid_number) باشد و از tel:/wa.me یا
            متن کنار کلیدواژه‌ی تماس روی همان سایت آمده باشد (آدرس منبع ثبت می‌شود).
  هرچه از این‌ها رد نشود، خالی می‌ماند — عمداً «حدس» برنمی‌گردانیم.

ایمیل‌های محافظت‌شده با Cloudflare (data-cfemail) رمزگشایی می‌شوند؛ صفحات JS-heavy در یک
پاس دوم با Playwright رندر می‌شوند.

استفاده:
  python scripts/verify_company_contacts.py --slug gulfood-2026 --limit 20
  python scripts/verify_company_contacts.py --input platform_invalid_emails.json --out out.json
"""

import os
import re
import sys
import json
import time
import argparse
from html import unescape
from urllib.parse import urlparse, urljoin, unquote, parse_qs
from concurrent.futures import ThreadPoolExecutor

import threading
import httpx
import phonenumbers
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402
import clean_exhibitor_emails as cl  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BROWSER_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

LEGAL_WORDS = set("""llc ltd limited co company corp corporation inc incorporated gmbh ag sa sas srl spa sdn bhd pvt
private pte plc jsc ooo zao oao llp lp dmcc fze fzc fzco group holding holdings international intl global trading
trade industries industry foods food products product manufacturing the and of for general enterprises enterprise est
establishment zoo kft ltda sarl bv nv oy aps pty cv tbk cia lda doo""".split())
GENERIC_WORDS = set("""turkish indian chinese arab arabian egyptian saudi emirates dubai gulf middle east eastern western northern southern
national united asia asian african europe european american german french italian spanish thai malaysian indonesian pakistan
export exports exporter exporters importer importers import distribution distributors supply supplies agro agri agricultural
agriculture trading marketing sourcing commodities commodity premium quality natural organic fresh best royal golden star
super mega new first one""".split())

# پسوند دامنه -> کشور برای phonenumbers (شماره‌ی بدون + را با کشور سایت می‌خوانیم)
TLD_REGION = {
    "ae": "AE", "sa": "SA", "in": "IN", "tr": "TR", "cn": "CN", "ru": "RU", "eg": "EG", "pk": "PK", "jo": "JO",
    "lb": "LB", "kw": "KW", "qa": "QA", "om": "OM", "bh": "BH", "ir": "IR", "uk": "GB", "de": "DE", "fr": "FR",
    "it": "IT", "es": "ES", "nl": "NL", "pl": "PL", "br": "BR", "ar": "AR", "mx": "MX", "id": "ID", "my": "MY",
    "th": "TH", "vn": "VN", "kz": "KZ", "ua": "UA", "gr": "GR", "ma": "MA", "za": "ZA", "ke": "KE", "ng": "NG",
    "lk": "LK", "bd": "BD", "ph": "PH", "kr": "KR", "jp": "JP", "au": "AU", "nz": "NZ", "ca": "CA", "be": "BE",
    "at": "AT", "ch": "CH", "se": "SE", "dk": "DK", "no": "NO", "fi": "FI", "pt": "PT", "ro": "RO", "bg": "BG",
    "hu": "HU", "cz": "CZ", "sk": "SK", "rs": "RS", "hr": "HR", "il": "IL", "iq": "IQ", "ye": "YE", "sy": "SY",
    "tn": "TN", "dz": "DZ", "ly": "LY", "sd": "SD", "et": "ET", "gh": "GH", "tz": "TZ", "ug": "UG", "cy": "CY",
    "uz": "UZ", "ge": "GE", "am": "AM", "az": "AZ", "by": "BY", "lt": "LT", "lv": "LV", "ee": "EE", "sg": "SG",
    "hk": "HK", "tw": "TW", "ie": "IE", "us": "US", "cl": "CL", "pe": "PE", "co": "CO", "ec": "EC", "uy": "UY",
}
COUNTRY_REGION = {
    "united arab emirates": "AE", "uae": "AE", "saudi arabia": "SA", "india": "IN", "turkey": "TR", "türkiye": "TR",
    "china": "CN", "russia": "RU", "egypt": "EG", "pakistan": "PK", "jordan": "JO", "lebanon": "LB", "kuwait": "KW",
    "qatar": "QA", "oman": "OM", "bahrain": "BH", "iran": "IR", "united kingdom": "GB", "germany": "DE",
    "france": "FR", "italy": "IT", "spain": "ES", "netherlands": "NL", "poland": "PL", "brazil": "BR",
    "argentina": "AR", "mexico": "MX", "indonesia": "ID", "malaysia": "MY", "thailand": "TH", "vietnam": "VN",
    "kazakhstan": "KZ", "ukraine": "UA", "greece": "GR", "morocco": "MA", "south africa": "ZA", "kenya": "KE",
    "nigeria": "NG", "sri lanka": "LK", "bangladesh": "BD", "philippines": "PH", "south korea": "KR", "japan": "JP",
    "australia": "AU", "canada": "CA", "united states": "US", "usa": "US", "cyprus": "CY", "uzbekistan": "UZ",
}
PHONE_KEYWORDS = re.compile(
    r"(tel|phone|mobile|mob\b|call|whatsapp|contact|hotline|office|sales|т[её]л|телефон|电话|电話|手机|تلفن|هاتف|جوال)",
    re.I)
# صندوق‌هایی که ایمیل «تماس تجاری» نیستند (استخدام، حریم خصوصی، پشتیبانی مصرف‌کننده...)
NON_BUSINESS_LOCAL = re.compile(
    r"^(careers?|jobs?|hr|recruit\w*|press|media|privacy|legal|abuse|webmaster|postmaster|no-?reply|dpo|gdpr|"
    r"unsubscribe|billing|invoice\w*|complaints?|consumer\w*|customer(care|service)\w*|support|helpdesk|help)$",
    re.I)
# صندوق‌های استخدام/منابع انسانی/شکایت به چند زبان (اسپانیایی، آلمانی، فرانسوی، ایتالیایی...)
NON_BUSINESS_SUBSTR = re.compile(
    r"(selecci|recluta|rrhh|talent|vacan|empleo|trabaj|candidat|karriere|bewerb|recrut|emploi|career|jobs?\b|"
    r"resume|(^|[._-])cvs?($|[._-])|(^|[._-])hr($|[._-])|personale|lavora|stellen|human\.?resources|reclam|"
    r"datenschutz|privacidad|dpo|gdpr)", re.I)
FAX_WORDS = re.compile(r"(fax|факс|传真)", re.I)
SSL_ERRORS = ("SSL", "CERTIFICATE", "certificate")


# ---------------------------------------------------------------- شبکه
class Fetcher:
    """اول مستقیم، بعد با پراکسی محلی (بعضی سایت‌ها فقط از یکی باز می‌شن)، بعد بدون
    بررسی گواهی (گواهی خراب/منقضی روی سایت‌های کوچک زیاده؛ فقط متن عمومی می‌خوانیم)."""

    def __init__(self):
        kw = dict(headers=BROWSER_HEADERS, follow_redirects=True, timeout=httpx.Timeout(14.0, connect=8.0))
        self.direct = httpx.Client(trust_env=False, **kw)
        self.proxied = httpx.Client(trust_env=True, **kw)
        self.insecure = httpx.Client(trust_env=False, verify=False, **kw)

    def get(self, url: str):
        """-> (final_url, status, html|None, error|None)"""
        last_err = None
        urls = [url]
        if url.startswith("https://"):
            urls.append("http://" + url[len("https://"):])
        for u in urls:
            for client in (self.direct, self.proxied, self.insecure):
                try:
                    r = client.get(u)
                    ctype = r.headers.get("content-type", "")
                    if "html" in ctype or "xml" in ctype or not ctype:
                        return str(r.url), r.status_code, r.text, None
                    return str(r.url), r.status_code, None, f"not html ({ctype[:30]})"
                except Exception as e:  # noqa: BLE001
                    last_err = f"{type(e).__name__}"
                    continue
        return None, None, None, last_err


# ---------------------------------------------------------------- تطبیق نام
def _clean_name(name: str) -> str:
    """«I.A.S.» → «IAS»؛ «Dairyhub.lt» → «Dairyhub lt» (نقطه‌ی بین حروف تنها حذف، بقیه فاصله)."""
    name = name or ""
    prev = None
    while prev != name:
        prev = name
        name = re.sub(r"\b([A-Za-z])\.(?=[A-Za-z]\b)", r"\1", name)
    return re.sub(r"[^A-Za-z0-9 ]+", " ", name.replace(".", " "))


def name_tokens(name: str) -> list[str]:
    """واژه‌های متمایزکننده‌ی نام (بدون واژه‌های حقوقی/عمومی). اگر هیچ واژه‌ی متمایزی نماند،
    برمی‌گردد به همه‌ی واژه‌ها ولی تطبیق فقط در دامنه پذیرفته می‌شود (only_generic)."""
    toks = [t.lower() for t in _clean_name(name).split() if len(t) >= 2]
    core = [t for t in toks if t not in LEGAL_WORDS]
    return core or toks


def only_generic(name: str) -> bool:
    toks = [t.lower() for t in _clean_name(name).split() if len(t) >= 2]
    return bool(toks) and not [t for t in toks if t not in LEGAL_WORDS and t not in GENERIC_WORDS]


def domain_equals_name(name: str, host: str) -> bool:
    """دامنه دقیقاً برابر نام (یا چند واژه‌ی اول نام) باشد: andice.com برای «AND ICE ...»."""
    label = re.sub(r"[^a-z0-9]", "", registered_domain(host).split(".")[0])
    words = [w.lower() for w in _clean_name(name).split()]
    return len(label) >= 4 and any("".join(words[:k]) == label for k in range(1, min(len(words), 4) + 1))

def registered_domain(host: str) -> str:
    host = (host or "").lower().split(":")[0].removeprefix("www.")
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in {"co", "com", "org", "net", "gov", "ac", "edu"} and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def page_identity_text(soup: BeautifulSoup) -> str:
    bits = []
    if soup.title:
        bits.append(soup.title.get_text(" ", strip=True))
    for m in soup.find_all("meta"):
        if (m.get("property") in ("og:site_name", "og:title") or m.get("name") in ("description", "application-name")):
            bits.append(m.get("content") or "")
    bits += [h.get_text(" ", strip=True) for h in soup.find_all(["h1", "h2"])[:6]]
    body = soup.get_text(" ", strip=True)
    bits.append(body[:2500])
    bits.append(body[-1500:])  # فوتر: «© نام شرکت»
    return " ".join(bits).lower()


def name_match(tokens: list[str], soup: BeautifulSoup, host: str, name: str = "") -> tuple[float, str]:
    if not tokens:
        return 0.0, "نام لاتین برای تطبیق ندارد"
    text = page_identity_text(soup)
    dom = re.sub(r"[^a-z0-9]", "", registered_domain(host).split(".")[0])
    hits = [t for t in tokens if t in dom] if only_generic(name) else [t for t in tokens if t in text or t in dom]
    return len(hits) / len(tokens), f"{len(hits)}/{len(tokens)} واژه‌ی نام ({', '.join(hits) or '-'}) در عنوان/متن/دامنه"


# ---------------------------------------------------------------- استخراج از صفحه
def _decode_cf(hexstr: str) -> str | None:
    try:
        key = int(hexstr[:2], 16)
        return "".join(chr(int(hexstr[i:i + 2], 16) ^ key) for i in range(2, len(hexstr), 2))
    except Exception:  # noqa: BLE001
        return None


def _deobfuscate(text: str) -> str:
    text = re.sub(r"\s*[\[\(\{]\s*(at|AT)\s*[\]\)\}]\s*", "@", text)
    text = re.sub(r"\s+(at|AT)\s+(?=[A-Za-z0-9-]+\s*(\[dot\]|\(dot\)|\.))", "@", text)
    text = re.sub(r"\s*[\[\(\{]\s*(dot|DOT)\s*[\]\)\}]\s*", ".", text)
    return text


def _clean_email(e: str) -> str | None:
    e = unquote(e).strip().strip(".,;:<>()[]\"'").lower()
    e = re.sub(r"^(mailto:)", "", e)
    return e if cl.SYNTAX_RE.match(e) and not efl.is_junk_email(e) and not efl.EMAIL_JUNK_SUFFIX.search(e) else None


def parse_page(html: str, url: str, regions: list[str]) -> tuple[dict, list[dict]]:
    """-> ({email: kind}, [phone dicts])"""
    soup = BeautifulSoup(html, "html.parser")
    emails: dict[str, str] = {}
    phones: list[dict] = []

    def add_phone(raw: str, kind: str):
        raw = raw.strip()
        if not raw:
            return
        if raw.startswith("+"):
            attempts = [(raw, None)]
        elif raw.startswith("00"):
            attempts = [("+" + raw[2:], None)]
        else:
            attempts = [(raw, r) for r in regions]
        for text, region in attempts:
            try:
                num = phonenumbers.parse(text, region)
            except Exception:  # noqa: BLE001
                continue
            if phonenumbers.is_valid_number(num):
                e164 = phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)
                if all(p["e164"] != e164 for p in phones):
                    phones.append({"e164": e164,
                                   "display": phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.INTERNATIONAL),
                                   "kind": kind, "source_url": url})
                return
    for el in soup.select("[data-cfemail]"):
        dec = _decode_cf(el.get("data-cfemail", ""))
        if dec and (c := _clean_email(dec)):
            emails.setdefault(c, "cfemail")
    for a in soup.find_all("a", href=True):
        h = a["href"].strip()
        low = h.lower()
        if low.startswith("mailto:"):
            for part in re.split(r"[,;]", unquote(h[7:]).split("?")[0]):
                if c := _clean_email(part):
                    emails[c] = "mailto"
        elif "email-protection#" in low:
            dec = _decode_cf(h.split("#", 1)[1])
            if dec and (c := _clean_email(dec)):
                emails.setdefault(c, "cfemail")
        elif low.startswith("tel:"):
            add_phone(unquote(h[4:]).split(";")[0], "tel")
        else:
            m = efl.WHATSAPP_RE.search(h) or efl.WHATSAPP_LINK_RE.search(h)
            if m:
                add_phone("+" + re.sub(r"\D", "", m.group(1)), "whatsapp")

    for t in soup(["script", "style", "noscript"]):
        t.decompose()
    text = _deobfuscate(unescape(soup.get_text(" ", strip=True)))
    for m in efl.EMAIL_RE.findall(text):
        if c := _clean_email(m):
            emails.setdefault(c, "text")

    if len(phones) < 3:
        for region in (regions or [None]):
            try:
                matcher = phonenumbers.PhoneNumberMatcher(text, region, leniency=phonenumbers.Leniency.VALID)
                for mt in matcher:
                    before = text[max(0, mt.start - 40):mt.start]
                    if FAX_WORDS.search(before[-14:]):
                        continue
                    if text[mt.start:mt.start + 1] == "+" or PHONE_KEYWORDS.search(before):
                        add_phone(text[mt.start:mt.end], "text")
            except Exception:  # noqa: BLE001
                continue
            if len(phones) >= 3:
                break
    return emails, phones


# ---------------------------------------------------------------- جست‌وجوی وب
_search_lock = threading.Lock()
_last_search = [0.0]


def _throttle_search():
    """DuckDuckGo زیر درخواست‌های هم‌زمان پاسخ خالی/بلاک می‌دهد؛ حداقل ۲ ثانیه بین جست‌وجوها."""
    with _search_lock:
        wait = 2.0 - (time.time() - _last_search[0])
        if wait > 0:
            time.sleep(wait)
        _last_search[0] = time.time()


def search_candidates(client: httpx.Client, name: str, country: str, n: int = 4) -> list[str]:
    out = []
    for query in (f"{name} {country or ''} official website".strip(), f"{name} {country or ''} contact email".strip()):
        html = None
        for attempt in range(2):
            _throttle_search()
            try:
                r = client.get("https://html.duckduckgo.com/html/", params={"q": query}, headers=BROWSER_HEADERS, timeout=45)
                if r.status_code == 200 and "result__a" in r.text:
                    html = r.text
                    break
            except Exception:  # noqa: BLE001
                pass
            time.sleep(2)
        if not html:
            continue
        for a in BeautifulSoup(html, "html.parser").select("a.result__a")[:10]:
            target = parse_qs(urlparse(a.get("href") or "").query).get("uddg", [None])[0]
            if not target:
                continue
            target = unquote(target)
            domain = urlparse(target).netloc.lower().removeprefix("www.")
            if any(b in domain for b in efl.DIRECTORY_DOMAIN_BLOCKLIST) or any(m in target.lower() for m in efl.DIRECTORY_PATH_MARKERS):
                continue
            root = f"{urlparse(target).scheme}://{urlparse(target).netloc}"
            if root not in out:
                out.append(root)
            if len(out) >= n:
                return out
    return out


# ---------------------------------------------------------------- هسته
def normalize_url(u: str) -> str:
    u = (u or "").strip()
    u = re.sub(r"[^\x00-\x7F]+", "", u)
    if not u or u in ("-", "N/A", "n/a"):
        return ""
    return u if u.lower().startswith("http") else "https://" + u


def verify_company(rec: dict, fetcher: Fetcher, search_client: httpx.Client) -> dict:
    """
    rec: {name, country, website(optional), website_official(bool), directory_email(optional)}
    """
    name, country = rec.get("name", ""), rec.get("country", "")
    tokens = name_tokens(name)
    res = {"name": name, "country": country, "website": None, "website_status": "none", "website_evidence": "",
           "emails": [], "email_best": None, "email_confidence": None, "email_source_url": None,
           "phones": [], "phone_best": None, "phone_source_url": None, "pages_checked": [], "notes": [],
           "needs_render": False}

    # ---- ۱) وب‌سایت
    candidates = []
    given = normalize_url(rec.get("website"))
    if given:
        candidates.append((given, bool(rec.get("website_official"))))

    chosen = None  # (final_url, html, official)
    tried = set()

    def try_site(url: str, official: bool):
        final, status, html, err = fetcher.get(url)
        if not html or (status and status >= 400 and status not in (401, 403)):
            return None, f"{url} → {status or err}"
        soup = BeautifulSoup(html, "html.parser")
        score, evidence = name_match(tokens, soup, urlparse(final).netloc, name)
        if official:
            return (final, html, True, evidence + " (از فهرست رسمی نمایشگاه)", status, "official"), None
        # سایت غیررسمی (حدسی/جست‌وجو): هم ≥۵۰٪ واژه‌های نام و هم «واژه‌ی اصلی نام» (اولین واژه)
        # باید در صفحه باشد — وگرنه مثلاً «Hamle / Pladis» با سایت شرکت مادر (Pladis) یکی
        # گرفته می‌شد و ایمیل خدمات مصرف‌کننده‌ی جهانی‌اش به‌جای ایمیل شرکت قزاقستانی می‌آمد.
        text = page_identity_text(soup)
        dom = re.sub(r"[^a-z0-9]", "", registered_domain(urlparse(final).netloc).split(".")[0])
        primary_hit = bool(tokens) and (tokens[0] in text or tokens[0] in dom)
        if domain_equals_name(name, urlparse(final).netloc):
            return (final, html, False, "دامنه دقیقاً برابر نام شرکت است; " + evidence, status, "strong"), None
        if score >= 0.5 and primary_hit:
            long_hit = any(len(tk) >= 4 and (tk in text or tk in dom) for tk in tokens)
            return (final, html, False, evidence, status, "strong" if (score >= 0.75 and long_hit) else "medium"), None
        return None, f"{final} → نام شرکت با صفحه نمی‌خواند ({evidence})"

    for url, official in candidates:
        tried.add(url)
        got, why = try_site(url, official)
        if got:
            chosen = got
            break
        res["notes"].append(why)

    if not chosen:
        for url in search_candidates(search_client, name, country):
            if url in tried:
                continue
            tried.add(url)
            got, why = try_site(url, False)
            if got:
                chosen = got
                res["notes"].append("وب‌سایت از جست‌وجوی وب پیدا و با تطبیق نام تأیید شد")
                break
            res["notes"].append(why)

    if not chosen:
        res["website_status"] = "unreachable_or_unmatched" if candidates else "not_found"
        # سایت باز نشد: ایمیلی که خودِ نمایشگاه ثبت کرده هنوز می‌تواند «directory_only» باشد
        # (دامنه‌اش باید MX/A داشته باشد)، ولی هرگز «تأییدشده روی سایت» نیست.
        finalize_contacts(res, {}, [], "", rec)
        return res

    final_url, home_html, official, evidence, status, strength = chosen
    res["website_match"] = strength
    root = f"{urlparse(final_url).scheme}://{urlparse(final_url).netloc}"
    res["website"] = root
    res["website_status"] = "verified_official" if official else "verified_name_match"
    res["website_evidence"] = evidence
    if status in (401, 403):
        res["notes"].append(f"سایت کد {status} داد (احتمالاً ضدربات)؛ محتوای تماس ممکنه ناقص باشه")

    # ---- ۲) صفحات تماس
    regions = []
    tld = urlparse(root).netloc.rsplit(".", 1)[-1].lower()
    if tld in TLD_REGION:
        regions.append(TLD_REGION[tld])
    c_region = COUNTRY_REGION.get((country or "").strip().lower())
    if c_region and c_region not in regions:
        regions.append(c_region)

    all_emails: dict[str, dict] = {}
    all_phones: list[dict] = []

    def absorb(html: str, url: str):
        em, ph = parse_page(html, url, regions)
        for e, kind in em.items():
            cur = all_emails.get(e)
            rank = {"mailto": 0, "cfemail": 1, "text": 2}
            if not cur or rank[kind] < rank[cur["kind"]]:
                all_emails[e] = {"email": e, "kind": kind, "source_url": url}
        for p in ph:
            if all(x["e164"] != p["e164"] for x in all_phones):
                all_phones.append(p)

    absorb(home_html, final_url)
    res["pages_checked"].append(final_url)
    site_reg = registered_domain(urlparse(root).netloc)
    # فقط لینک‌های هم‌دامنه با خودِ سایت — لینک «Contact» بعضی سایت‌ها به دموی قالب (مثلاً
    # bracketweb.com/ogenixwp) می‌رود و ایمیل placeholder قالب را به‌جای ایمیل شرکت می‌داد.
    links = [l for l in efl.find_contact_links(home_html, final_url)
             if registered_domain(urlparse(l).netloc) == site_reg]
    for link in links[:4]:
        f2, st2, h2, _ = fetcher.get(link)
        if h2 and st2 and st2 < 400:
            absorb(h2, f2)
            res["pages_checked"].append(f2)
    if not all_emails:
        for path in efl.CONTACT_PATHS[1:7]:
            f2, st2, h2, _ = fetcher.get(root.rstrip("/") + path)
            if h2 and st2 and st2 < 400 and len(h2) > 800:
                absorb(h2, f2)
                res["pages_checked"].append(f2)
                if all_emails:
                    break
    if not all_emails and not all_phones:
        res["needs_render"] = True

    finalize_contacts(res, all_emails, all_phones, root, rec)
    return res


def finalize_contacts(res: dict, all_emails: dict, all_phones: list, root: str, rec: dict):
    site_dom = registered_domain(urlparse(root).netloc)
    free = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "qq.com", "163.com", "126.com", "vip.163.com",
            "mail.ru", "yandex.ru", "live.com", "icloud.com", "foxmail.com", "sina.com", "bk.ru", "list.ru"}
    cands = []
    for e, info in all_emails.items():
        dom = e.rsplit("@", 1)[-1]
        if NON_BUSINESS_LOCAL.match(e.split("@")[0]) or NON_BUSINESS_SUBSTR.search(e.split("@")[0]):
            res["notes"].append(f"{e} نقش غیرتجاری است (کنار گذاشته شد)")
            continue
        st = cl.domain_status(dom)
        same = registered_domain(dom) == site_dom
        info = {**info, "domain_status": st, "same_domain": same, "free_mail": dom in free}
        res["emails"].append(info)
        if st in ("dead",):
            continue
        if st == "unknown":
            continue
        if same:
            conf = 0
        elif (dom in free and (info["kind"] == "mailto" or "contact" in info["source_url"].lower())) or any(
                len(tk) >= 3 and tk not in GENERIC_WORDS
                and re.sub(r"[^a-z0-9]", "", registered_domain(dom).split(".")[0]).startswith(tk)
                or (len(tk) >= 4 and tk not in GENERIC_WORDS and tk in re.sub(r"[^a-z0-9]", "", registered_domain(dom).split(".")[0]))
                for tk in name_tokens(res["name"])):
            conf = 1  # mailto رایگان؛ یا دامنه‌ای که واژه‌ی متمایز نام شرکت را دارد
        else:
            res["notes"].append(f"{e} دامنه‌اش با سایت شرکت یکی نیست و ربطی به نام شرکت ندارد (رد شد)")
            continue
        cands.append((conf, e, info))
    if cands:
        order = efl.rank_emails([e for _, e, _ in cands], root)
        def name_dom(e):  # چند واژه‌ی متمایز نام شرکت در دامنه‌ی ایمیل هست (بیشتر = بهتر)
            lab = re.sub(r"[^a-z0-9]", "", registered_domain(e.rsplit("@", 1)[-1]).split(".")[0])
            return sum(1 for tk in name_tokens(res["name"]) if len(tk) >= 4 and tk not in GENERIC_WORDS and tk in lab)
        # اولویت: دامنه‌ای که واژه‌ی متمایز نام شرکت را دارد (info@vidyaherbs.com) > هم‌دامنه با سایت
        # > بقیه؛ و در هر گروه ایمیل نقش‌دار (info/sales) قبل از ایمیل شخصی.
        keyed = sorted(cands, key=lambda c: (-name_dom(c[1]), c[0], order.index(c[1])))
        best_conf, best = keyed[0][0], keyed[0][1]
        res["email_best"] = best
        res["email_confidence"] = "site_confirmed_same_domain" if best_conf == 0 else "site_confirmed_other_domain"
        res["email_source_url"] = all_emails[best]["source_url"]
    elif rec.get("directory_email"):
        d = rec["directory_email"].strip().lower()
        if cl.SYNTAX_RE.match(d) and not efl.is_junk_email(d):
            st = cl.domain_status(d.rsplit("@", 1)[-1])
            if st in ("mx", "a_only"):
                res["email_best"] = d
                res["email_confidence"] = "directory_only"
                res["email_source_url"] = "فهرست رسمی نمایشگاه (روی سایت شرکت دیده نشد)"
            else:
                res["notes"].append(f"ایمیل فهرست ({d}) رد شد: دامنه {st}")
    if all_phones:
        pr = {"tel": 0, "whatsapp": 1, "text": 2}
        all_phones.sort(key=lambda p: pr[p["kind"]])
        res["phones"] = all_phones
        res["phone_best"] = all_phones[0]["display"]
        res["phone_source_url"] = all_phones[0]["source_url"]


def render_second_pass(res: dict, rec: dict, browser) -> None:
    """برای سایت‌های JS-heavy: صفحه‌ی اصلی + تماس را واقعاً رندر کن."""
    root = res["website"]
    regions = []
    tld = urlparse(root).netloc.rsplit(".", 1)[-1].lower()
    if tld in TLD_REGION:
        regions.append(TLD_REGION[tld])
    all_emails, all_phones = {}, []
    pages = [root] + [root.rstrip("/") + p for p in efl.CONTACT_PATHS[1:4]]
    first_html = None
    for url in pages:
        html = efl.render_with_playwright(browser, url)
        if not html:
            continue
        if first_html is None:
            first_html = html
            for link in efl.find_contact_links(html, url)[:6]:
                if registered_domain(urlparse(link).netloc) == registered_domain(urlparse(root).netloc):
                    pages.append(link)
        em, ph = parse_page(html, url, regions)
        for e, k in em.items():
            all_emails.setdefault(e, {"email": e, "kind": k, "source_url": url})
        for p in ph:
            if all(x["e164"] != p["e164"] for x in all_phones):
                all_phones.append(p)
        if all_emails and all_phones:
            break
    res["emails"], res["phones"] = [], []
    finalize_contacts(res, all_emails, all_phones, root, rec)
    res["needs_render"] = False
    res["notes"].append("با رندر مرورگر (Playwright) بررسی شد")


# ---------------------------------------------------------------- ورودی/خروجی
def records_from_progress(slug: str) -> dict:
    prog = efl.load_progress(os.path.join(efl.OUTPUT_DIR, f"{slug}.progress.json"))
    out = {}
    for key, v in prog.items():
        if not v.get("relevant"):
            continue
        official = v.get("website_source") in ("exhibitor_profile", "exhibitor_directory")
        d_email = v.get("email") if v.get("email_source") == "exhibitor_directory" else None
        out[key] = {"name": v.get("name", ""), "country": v.get("country", ""),
                    "website": v.get("website") if official else None,
                    "website_official": official, "directory_email": d_email,
                    "profile_url": v.get("profile_url")}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--slug")
    ap.add_argument("--input", help="JSON: لیست {id,name,country,website}")
    ap.add_argument("--out")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--no-render", action="store_true")
    args = ap.parse_args()

    if args.slug:
        recs = records_from_progress(args.slug)
        out_path = args.out or os.path.join(efl.OUTPUT_DIR, f"{args.slug}.verified.json")
    else:
        rows = json.load(open(args.input, encoding="utf-8"))
        recs = {r["id"]: r for r in rows}
        out_path = args.out
    store = efl.load_progress(out_path) if os.path.exists(out_path) else {}
    todo = [(k, r) for k, r in recs.items() if k not in store]
    print(f"{len(recs)} شرکت، {len(store)} قبلاً بررسی شده، {len(todo)} مانده")
    if args.limit:
        todo = todo[:args.limit]
    if not todo:
        return

    fetcher = Fetcher()
    search_client = httpx.Client(trust_env=True, follow_redirects=True)

    def work(item):
        k, r = item
        try:
            return k, verify_company(r, fetcher, search_client)
        except Exception as e:  # noqa: BLE001
            return k, {"name": r.get("name"), "website": None, "website_status": "error",
                       "notes": [f"خطای غیرمنتظره: {type(e).__name__}: {e}"], "emails": [], "phones": [],
                       "email_best": None, "phone_best": None, "needs_render": False}

    done = 0
    with ThreadPoolExecutor(args.workers) as ex:
        for k, res in ex.map(work, todo):
            res["checked_at"] = time.strftime("%Y-%m-%d")
            store[k] = res
            done += 1
            if done % 5 == 0 or done == len(todo):
                efl.atomic_write_json(out_path, store)
                print(f"  [OK] {done}/{len(todo)}")

    pending = [(k, store[k]) for k, _ in todo if store[k].get("needs_render") and store[k].get("website")]
    if pending and not args.no_render:
        try:
            from playwright.sync_api import sync_playwright
            pw = sync_playwright().start()
            browser = pw.chromium.launch()
            print(f"  پاس دوم با مرورگر برای {len(pending)} سایت")
            for k, res in pending:
                try:
                    render_second_pass(res, recs[k], browser)
                except Exception as e:  # noqa: BLE001
                    res["notes"].append(f"رندر ناموفق: {type(e).__name__}")
            browser.close()
            pw.stop()
        except Exception as e:  # noqa: BLE001
            print(f"  [INFO] Playwright در دسترس نبود: {e}")
    efl.atomic_write_json(out_path, store)

    n = len(todo)
    ok_site = sum(1 for k, _ in todo if store[k].get("website"))
    ok_mail = sum(1 for k, _ in todo if store[k].get("email_best") and str(store[k].get("email_confidence", "")).startswith("site"))
    dir_mail = sum(1 for k, _ in todo if store[k].get("email_confidence") == "directory_only")
    ok_ph = sum(1 for k, _ in todo if store[k].get("phone_best"))
    print(f"[DONE] {n} شرکت: وب‌سایت تأییدشده {ok_site}، ایمیل تأییدشده از سایت {ok_mail}، "
          f"ایمیل فقط-فهرست {dir_mail}، تلفن معتبر {ok_ph}")


if __name__ == "__main__":
    main()


