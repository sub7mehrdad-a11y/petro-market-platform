"""
کشف خریدار/تاجر بی‌کربنات سدیم با جست‌وجوی وب (خارج از فهرست غرفه‌داران نمایشگاه‌ها).

چرا: غرفه‌داران نمایشگاه بیشتر مصرف‌کننده‌ی نهایی‌اند؛ تاجرها/توزیع‌کننده‌های خودِ بی‌کربنات کمتر در آن‌ها هستند.
روش (همان قاعده‌ی «فقط سایت رسمی خود شرکت»):
  ۱) جست‌وجوی Yahoo با ترکیب «عبارت × شهر»؛ نتیجه‌ای که عنوان/خلاصه‌اش بی‌کربنات یا جوش‌شیرین باشد می‌ماند.
  ۲) نتیجه‌ی سایت خود شرکت → همان دامنه کاندیدای وب‌سایت؛ نتیجه‌ی بازارچه (IndiaMART/TradeIndia/...) → فقط
     «نام شرکت» از آن برداشته می‌شود و سایت رسمی را verify_company_contacts.py جداگانه پیدا و با تطبیق نام تأیید می‌کند.
     هیچ تماسی از آگهی بازارچه گرفته نمی‌شود.
  ۳) شرکت‌هایی که از قبل در پلتفرم یا اکسل نمایشگاه‌ها هستند حذف می‌شوند (جدید = هیچ‌جا نبوده).
  ۴) صحت‌سنجی تماس با verify_company_contacts.py و اکسل با export_verified_xlsx.py.

استفاده:  python scripts/buyer_discovery.py india [--stage discover|verify|export|all] [--limit-queries N]
خروجی‌ها در data/exhibition_leads/buyers-<country>.*.json
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys
import time
from urllib.parse import urlparse, unquote

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402
import verify_company_contacts as vcc  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PY = sys.executable

COUNTRIES = {
    "india": {
        "country": "India", "title": "Buyers India", "dial": "+91", "tlds": ["in"],
        "groups": [(["sodium bicarbonate distributor {p}", "sodium bicarbonate importer {p}",
                     "sodium bicarbonate supplier {p}", "sodium bicarbonate trader {p}",
                     "baking soda wholesale {p}", "sodium bicarbonate manufacturer {p}"],
                    ["Mumbai", "Ahmedabad", "Delhi", "Chennai", "Kolkata", "Hyderabad", "Bangalore", "Pune", "Surat",
                     "Vadodara", "Kanpur", "Jaipur", "Ludhiana", "Kochi", "Indore", "Nagpur", "Coimbatore", "Rajkot",
                     "Visakhapatnam", "Lucknow", "Gujarat", "Maharashtra", "India"])],
    },
    "uae": {
        "country": "United Arab Emirates", "title": "Buyers UAE", "dial": "+971", "tlds": ["ae"],
        "groups": [(["sodium bicarbonate distributor {p}", "sodium bicarbonate importer {p}",
                     "sodium bicarbonate supplier {p}", "sodium bicarbonate trading company {p}",
                     "baking soda wholesale {p}", "food additives chemicals trading {p} sodium bicarbonate"],
                    ["Dubai", "Sharjah", "Abu Dhabi", "Ajman", "Ras Al Khaimah", "Jebel Ali", "Deira", "Al Quoz",
                     "Fujairah", "Umm Al Quwain", "UAE", "United Arab Emirates"]),
                   (["بيكربونات الصوديوم {p}", "موزع بيكربونات الصوديوم {p}", "استيراد بيكربونات الصوديوم {p}",
                     "صودا الخبز جملة {p}"],
                    ["دبي", "الشارقة", "أبوظبي", "الإمارات"])],
    },
    "iraq_bp": {
        "country": "Iraq", "title": "Buyers Iraq BakingPowder", "dial": "+964", "tlds": ["iq", "krd"],
        "groups": [(["baking powder manufacturer {p}", "baking powder factory {p}", "baking powder supplier {p}",
                     "baking powder importer distributor {p}", "baking ingredients bakery mixes manufacturer {p}"],
                    ["Baghdad", "Erbil", "Sulaymaniyah", "Basra", "Mosul", "Najaf", "Karbala", "Kirkuk", "Duhok",
                     "Kurdistan", "Iraq"]),
                   (["مصنع بيكنج باودر {p}", "بيكنج باودر جملة {p}", "منتجات بيكنج باودر شركة {p}",
                     "مسحوق الخبز مصنع {p}", "خميرة كيميائية مصنع {p}", "مواد خبز ومعجنات استيراد وتوزيع {p}"],
                    ["بغداد", "أربيل", "البصرة", "السليمانية", "الموصل", "النجف", "كربلاء", "كركوك", "دهوك", "العراق"])],
    },
    "iraq": {
        "country": "Iraq", "title": "Buyers Iraq", "dial": "+964", "tlds": ["iq"],
        "groups": [(["sodium bicarbonate distributor {p}", "sodium bicarbonate importer {p}",
                     "sodium bicarbonate supplier {p}", "sodium bicarbonate trading company {p}",
                     "baking soda wholesale {p}", "food additives chemicals trading {p} sodium bicarbonate"],
                    ["Baghdad", "Erbil", "Basra", "Sulaymaniyah", "Mosul", "Najaf", "Karbala", "Kirkuk", "Duhok",
                     "Kurdistan", "Iraq"]),
                   (["بيكربونات الصوديوم {p}", "موزع بيكربونات الصوديوم {p}", "استيراد بيكربونات الصوديوم {p}",
                     "تجارة المواد الكيمياوية بيكربونات {p}", "صودا الخبز جملة {p}"],
                    ["بغداد", "أربيل", "البصرة", "السليمانية", "الموصل", "النجف", "كربلاء", "كركوك", "دهوك", "العراق"])],
    },
}

BICARB_RE = re.compile(r"(sodium\s*bi-?\s*carbonate|bicarbonate\s+of\s+soda|baking\s+soda|nahco3|sodium\s+hydrogen\s*carbonate|"
                       r"بيكربونات\s*الصوديوم|بيكاربونات\s*الصوديوم|بايكربونات|صودا\s*الخبز|bicarbonato\s+de\s+sodio|"
                       r"baking\s+powder|بيكنج\s*(باودر|بودر|بوودر)|بكينج\s*(باودر|بودر)|بيكن[كج]\s*باودر|مسحوق\s*(الخبز|الخبيز)|ذرور\s*الخبيز|خميرة\s*كيميائية)", re.I)
NOISE_RE = re.compile(r"(recipe|benefits?\b|\buses?\b|how\s+to|side\s+effects?|health|msds|\bsds\b|safety\s+data|wikipedia|"
                      r"what\s+is|vs\.?|difference|price\s+trend|pdf\b|news|blog|review|buy\s+online|amazon|flipkart)", re.I)
MFR_RE = re.compile(r"(manufacturer|producer|manufacturing|maker|factory|مصنع|منتج)", re.I)
TRADER_RE = re.compile(r"(distributor|importer|trader|trading|wholesal|stockist|dealer|exporter|supplier|agency|agencies|impex|موزع|مستورد|تاجر|تجارة|مورد|جملة)", re.I)
EXTRA_DIRECTORY_RE = re.compile(
    r"(globallinker|exportersindia|tradeindia|indiamart|elchemy|pharmaoffer|justdial|sulekha|amazon|flipkart|ebay|"
    r"walmart|reddit|quora|pinterest|healthline|webmd|medium\.com|scribd|slideshare|alibaba|aliexpress|dhgate|"
    r"made-in-china|tradekey|ec21|go4world|exporthub|tradewheel|ecplaza|indotrading|bigbasket|jiomart|1mg|netmeds|"
    r"pharmeasy|snapdeal|meesho|youtube|facebook|instagram|linkedin|wikipedia|\.gov\.|\.edu|\.ac\.|"
    r"yellowpages|dubaiyellow|connect\.?ae|zawya|kompass|tradeford|noon\.com|souq|carrefour|lulu|dubizzle|"
    r"talabat|iraqbusiness|arabsmarket|arabianfirms|yellow-?pages|opensooq|iqdirect|iraqdirectory|dalilak|"
    r"yaoota|jumia|ubuy|desertcart|pharmacy|supermarket|hypermarket|grocery|webstaurant|bjs\.com|bulkapothecary|"
    r"glorybee|volza|accio|haraj|edarabia|bakersbulk|mounthopewholesale|bulkfoods|info-clipper|sharjahcoop|"
    r"gomruky|importyeti|zauba|seair|panjiva|tridge|made-in|alibaba|1688)")
DIRECT_NAME_STOP = set("sodium bicarbonate baking soda manufacturer manufacturers supplier suppliers exporter exporters "
                       "distributor importer trader price buy india home welcome nahco3 food grade industrial pharma "
                       "wholesale dealer in of and the for best top".split())


def norm_name(s: str) -> str:
    s = re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())
    words = [w for w in s.split() if w not in vcc.LEGAL_WORDS]
    return " ".join(words)


def reg_domain(url_or_host: str) -> str:
    host = urlparse(url_or_host if "//" in url_or_host else "//" + url_or_host).netloc.lower().removeprefix("www.")
    return vcc.registered_domain(host)


def known_sets():
    """دامنه‌ها و نام‌های نرمال‌شده‌ی همه‌ی شرکت‌های موجود (پلتفرم + همه‌ی نمایشگاه‌ها)."""
    domains, names = set(), set()
    try:
        for c in json.load(open(os.path.join(ROOT, "data", "companies.json"), encoding="utf-8")):
            if c.get("website"):
                domains.add(reg_domain(c["website"]))
            for k in ("english_name", "name"):
                if c.get(k):
                    names.add(norm_name(c[k]))
    except Exception as e:  # noqa: BLE001
        print("  [WARN] companies.json:", e)
    for pth in glob.glob(os.path.join(efl.OUTPUT_DIR, "*.progress.json")) + glob.glob(os.path.join(efl.OUTPUT_DIR, "*.verified.json")):
        if os.path.basename(pth).startswith("buyers-"):
            continue
        try:
            for v in json.load(open(pth, encoding="utf-8")).values():
                if v.get("website"):
                    domains.add(reg_domain(v["website"]))
                if v.get("name"):
                    names.add(norm_name(v["name"]))
        except Exception:  # noqa: BLE001
            pass
    domains.discard("")
    names.discard("")
    return domains, names


def yahoo_search(client: httpx.Client, query: str) -> list[dict]:
    for attempt in range(3):
        vcc._throttle_search()
        try:
            r = client.get("https://search.yahoo.com/search", params=({"p": query, "ei": "UTF-8"} if re.search(r"[^\x00-\x7F]", query)
                                   else {"p": query, "ei": "UTF-8", "vl": "lang_en"}),
                           headers=vcc.BROWSER_HEADERS, timeout=30)
            if r.status_code != 200:
                time.sleep(3 * (attempt + 1))
                continue
            out = []
            for blk in BeautifulSoup(r.text, "html.parser").select("div.algo"):
                a = blk.select_one("a[href]")
                if not a:
                    continue
                m = re.search(r"/RU=([^/]+)/RK=", a["href"])
                url = unquote(m.group(1)) if m else a["href"]
                if not url.startswith("http") or "yahoo." in url:
                    continue
                h3 = blk.select_one("h3")
                snip = blk.select_one("div.compText, p")
                out.append({"url": url, "title": (h3 or a).get_text(" ", strip=True),
                            "snippet": snip.get_text(" ", strip=True) if snip else ""})
            return out
        except Exception:  # noqa: BLE001
            time.sleep(3 * (attempt + 1))
    return []


def is_directory(url: str) -> bool:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    return any(b in host for b in efl.DIRECTORY_DOMAIN_BLOCKLIST) or bool(EXTRA_DIRECTORY_RE.search(url.lower()))


def brand_from_title(title: str, domain: str) -> str:
    """نام برند را از عنوان صفحه می‌گیرد: بخشی که واژه‌ی محصول/ادعا نیست؛ وگرنه برچسب دامنه."""
    segs = [s.strip() for s in re.split(r"\s[|\-–—:·»]\s|\s*[|»]\s*", title) if s.strip()]
    best = None
    for s in segs:
        words = re.findall(r"[A-Za-z0-9&.']+", s)
        if not words or len(words) > 5 or not s.isascii() or BICARB_RE.search(s) or re.search(r"\b(CAS|HS|NaHCO)|\d{3}", s):
            continue
        if sum(1 for w in words if w.lower() in DIRECT_NAME_STOP) >= 1:
            continue
        best = s if best is None or len(s) < len(best) else best
    if best:
        return best
    return domain.split(".")[0].replace("-", " ").title()


RETAIL_RE = re.compile(r"(supermarket|hypermarket|co-?operative\s+society|add\s+to\s+cart|online\s+(store|shop)|"
                       r"free\s+shipping|webstaurant|shop\s+now|متجر|مكملات|e-?shop|education|universities|schools)", re.I)

MARKETPLACE_RE = re.compile(r"(b2b\s+(marketplace|portal|platform)|سوق\s+الجملة|موردين\s+ومشترين|suppliers?\s+and\s+buyers|marketplace|market\s*place|(business|suppliers?|company|online|trade|b2b)\s+directory|buyers?\s+and\s+sellers|post\s+(your\s+)?(buy|requirement)|"
                            r"list\s+your\s+(product|compan)|chemicalbook|dial4trade|chembazer|tradeinn|trade\s*portal|sourcing\s+platform)", re.I)

PLACE_WORDS = set("""dubai sharjah abu dhabi ajman ras khaimah jebel ali deira quoz fujairah umm quwain uae united arab emirates
baghdad erbil basra sulaymaniyah mosul najaf karbala kirkuk duhok kurdistan iraq mumbai delhi chennai kolkata hyderabad bangalore bengaluru pune surat vadodara kanpur jaipur ludhiana kochi
indore nagpur coimbatore rajkot visakhapatnam lucknow ahmedabad gujarat maharashtra india new delhi tamil nadu karnataka
kerala punjab haryana rajasthan uttar pradesh west bengal telangana andhra pradesh gujrat""".split())


def _plausible_company(name: str) -> bool:
    words = re.findall(r"[a-z0-9]+", name.lower())
    return bool(words) and not all(w in PLACE_WORDS or w in DIRECT_NAME_STOP for w in words)


def name_from_directory(url: str, title: str) -> str | None:
    n = _name_from_directory(url, title)
    return n if n and _plausible_company(n) else None


def _name_from_directory(url: str, title: str) -> str | None:
    m = re.search(r"\bby\s+([A-Z][\w&.' -]{2,60}?)\s*(?:[|\-–]|$)", title)
    if m:
        return m.group(1).strip()
    p = urlparse(url)
    parts = [x for x in p.path.split("/") if x]
    if "indiamart.com" in p.netloc and parts and parts[0] not in ("impcat", "proddetail", "products", "search.mp"):
        return parts[0].replace("-", " ").title()
    if "globallinker.com" in p.netloc and len(parts) >= 2 and parts[0] == "seller":
        return parts[1].replace("-", " ").title()
    return None


def roles_of(text: str) -> list[str]:
    out = []
    if MFR_RE.search(text):
        out.append("manufacturer")
    if TRADER_RE.search(text):
        out.append("trader")
    return out


# ---------------------------------------------------------------- مراحل
def paths(slug):
    b = os.path.join(efl.OUTPUT_DIR, f"buyers-{slug}")
    return {"disc": b + ".discovered.json", "input": b + ".input.json", "ver": b + ".verified.json", "prog": b + ".progress.json"}


def stage_discover(slug, cfg, limit_q=None):
    P = paths(slug)
    state = json.load(open(P["disc"], encoding="utf-8")) if os.path.exists(P["disc"]) else {"queries_done": [], "found": {}}
    known_dom, known_names = known_sets()
    queries = [t.format(p=pl) for tpls, places in cfg["groups"] for pl in places for t in tpls]
    todo = [q for q in queries if q not in state["queries_done"]]
    if limit_q:
        todo = todo[:limit_q]
    print(f"{len(queries)} پرسش، {len(state['queries_done'])} انجام شده، {len(todo)} مانده؛ "
          f"شناخته‌شده‌ها: {len(known_dom)} دامنه / {len(known_names)} نام")
    client = httpx.Client(trust_env=True, follow_redirects=True)
    for i, q in enumerate(todo, 1):
        for h in yahoo_search(client, q):
            text = f"{h['title']} {h['snippet']} {h['url']}"
            if not BICARB_RE.search(text) or NOISE_RE.search(h["title"]) or h["url"].lower().split("?")[0].endswith(".pdf"):
                continue
            via_dir = is_directory(h["url"])
            if via_dir:
                name = name_from_directory(h["url"], h["title"])
                if not name:
                    continue
                key = "n:" + norm_name(name)
                site = None
            else:
                dom = reg_domain(h["url"])
                if not dom or EXTRA_DIRECTORY_RE.search(dom):
                    continue
                key = "d:" + dom
                site = f"{urlparse(h['url']).scheme}://{urlparse(h['url']).netloc}"
                name = brand_from_title(h["title"], dom)
            if len(key) < 5:
                continue
            e = state["found"].setdefault(key, {"name": name, "website": site, "via": "directory" if via_dir else "own_site",
                                                "roles": [], "title": h["title"], "snippet": h["snippet"][:300],
                                                "queries": [], "hit_urls": []})
            for r in roles_of(f"{h['title']} {h['snippet']}"):
                if r not in e["roles"]:
                    e["roles"].append(r)
            if q not in e["queries"]:
                e["queries"].append(q)
            if h["url"] not in e["hit_urls"] and len(e["hit_urls"]) < 3:
                e["hit_urls"].append(h["url"])
        state["queries_done"].append(q)
        if i % 5 == 0 or i == len(todo):
            efl.atomic_write_json(P["disc"], state)
            print(f"  [{i}/{len(todo)}] کاندیدا تا اینجا: {len(state['found'])}", flush=True)
    efl.atomic_write_json(P["disc"], state)

    # حذف شناخته‌شده‌ها و ساخت ورودی/پیشرفت
    inp, prog, skipped = [], {}, 0
    for key, e in state["found"].items():
        if key.startswith("d:") and key[2:] in known_dom:
            skipped += 1
            continue
        if key.startswith("n:") and key[2:] in known_names:
            skipped += 1
            continue
        if key.startswith("d:"):  # نام را با قاعده‌ی فعلی از عنوان دوباره بساز (نام‌های بد قدیمی اصلاح شوند)
            e["name"] = brand_from_title(e["title"], key[2:])
        idx = f"buyers:{len(inp) + 1}"
        inp.append({"id": idx, "name": e["name"], "country": cfg["country"], "website": e["website"], "website_official": False})
        roles = e["roles"]
        explicit = bool(roles)
        prog[idx] = {
            "name": e["name"], "country": cfg["country"], "relevant": True,
            "company_type": "manufacturer" if roles == ["manufacturer"] else "trader",
            "suggested_grade": "", "fit": "قوی" if explicit else "ضعیف‌تر",
            "fit_reason": "عنوان/خلاصه‌ی نتیجه: " + ("، ".join(roles) if roles else "بدون نقش مشخص") + " بی‌کربنات",
            "llm_reason": f"پیداشده با جست‌وجو: «{e['queries'][0]}» ({'سایت خود شرکت' if e['via'] == 'own_site' else 'نام از بازارچه؛ سایت رسمی جداگانه یافته می‌شود'})",
            "description": e["snippet"], "stand": "", "region_address": "", "needs_review": not explicit,
            "_order": len(inp),
        }
    efl.atomic_write_json(P["input"], inp)
    efl.atomic_write_json(P["prog"], prog)
    print(f"[DISCOVER] کاندیدا {len(state['found'])}؛ از قبل در پلتفرم/نمایشگاه‌ها: {skipped}؛ جدید برای صحت‌سنجی: {len(inp)}")


def run(*args):
    return subprocess.run([PY, "-u", *args], cwd=ROOT).returncode


def stage_verify(slug, cfg):
    P = paths(slug)
    vc = os.path.join(HERE, "verify_company_contacts.py")
    run(vc, "--input", P["input"], "--out", P["ver"], "--workers", "5")
    run(vc, "--input", P["input"], "--out", P["ver"], "--render-only")


def region_re(cfg):
    """کشور هدف + شهرهای فهرست پرسش‌ها (لاتین و عربی) برای دیدن اینکه سایت خود شرکت از آن‌ها نام برده."""
    terms = {cfg["country"], cfg["country"].replace("United Arab Emirates", "UAE")}
    for _tpls, places in cfg["groups"]:
        terms.update(places)
    terms.discard("")
    return re.compile("|".join(re.escape(t) for t in sorted(terms, key=len, reverse=True)), re.I)


def base_country(phones: list) -> str:
    """کشور شرکت از شماره‌های تلفن سایتش (پرتکرارترین)؛ خالی اگر شماره‌ای نباشد."""
    import phonenumbers
    from phonenumbers import geocoder
    names = []
    for ph in phones:
        try:
            n = geocoder.country_name_for_number(phonenumbers.parse(ph["e164"], None), "en")
        except Exception:  # noqa: BLE001
            continue
        if n:
            names.append(n)
    return max(set(names), key=names.count) if names else ""


def stage_export(slug, cfg):
    P = paths(slug)
    ver = json.load(open(P["ver"], encoding="utf-8"))
    prog = json.load(open(P["prog"], encoding="utf-8"))
    known_dom, _ = known_sets()
    for pr in prog.values():  # هر بار از نو فیلتر می‌شود (اجرای قبلی relevant را False نگذارد)
        pr["relevant"] = True
    found = json.load(open(P["disc"], encoding="utf-8"))["found"]
    for k, pr in prog.items():  # نام برند سایت‌های خود شرکت را با قاعده‌ی فعلی از عنوان بساز
        site = (ver.get(k) or {}).get("website")
        e = found.get("d:" + reg_domain(site)) if site else None
        if e:
            pr["name"] = brand_from_title(e["title"], reg_domain(site))
        if site and (not pr["name"].isascii() or BICARB_RE.search(pr["name"])):  # نام کد/محصول است نه شرکت
            pr["name"] = reg_domain(site).split(".")[0].title()
    dropped = dup = nosite = market = unconf = retail = nobicarb = mentioned = 0
    seen = {}
    for k, v in ver.items():
        site = v.get("website")
        if not site:                                  # بدون سایت رسمی تأییدشده = بدون تماس قابل‌اتکا → نیاید
            if k in prog:
                prog[k]["relevant"] = False
                nosite += 1
            continue
        blurb = f"{v.get('site_blurb', '')} {v.get('name', '')} {site}"
        if k in prog and EXTRA_DIRECTORY_RE.search(reg_domain(site)):   # دامنه‌ی دایرکتوری/فروشگاه/غیرشرکتی
            prog[k]["relevant"] = False
            market += 1
            continue
        if k in prog and RETAIL_RE.search(blurb):       # فروشگاه/خرده‌فروش، نه تاجر B2B
            prog[k]["relevant"] = False
            retail += 1
            continue
        if k in prog and MARKETPLACE_RE.search(blurb):  # بازارچه/دایرکتوری B2B است نه شرکت
            prog[k]["relevant"] = False
            market += 1
            continue
        d = reg_domain(site)
        if d in known_dom and k in prog:           # سایت رسمی پیداشده از قبل در داده‌ی ما بود
            prog[k]["relevant"] = False
            dropped += 1
        elif d in seen and k in prog:                # دو نام (مثلاً بازارچه + سایت خود) به یک سایت رسید
            prog[k]["relevant"] = False
            dup += 1
        else:
            seen[d] = k
            # کشور فقط با شواهد تأیید می‌شود: شماره‌ی تلفنِ همان کشور یا دامنه‌ی ملی (.in/.ae/.iq)
            # (نتیجه‌ی جست‌وجوی «Dubai» ممکن است شرکتی از کشور دیگر باشد)
            tld = urlparse(site).netloc.lower().rsplit(".", 1)[-1]
            phones_ok = any(str(ph.get("e164", "")).startswith(cfg["dial"]) for ph in v.get("phones", []))
            if k in prog and not (phones_ok or tld in cfg["tlds"]):
                # کشور هدف تأیید نشد: حذف نمی‌کنیم (شرکت خارجیِ فعال در منطقه هم می‌تواند خریدار باشد)،
                # ولی کشورِ واقعی را از شماره‌ی تلفن سایت می‌نویسیم، نه کشور جست‌وجو را.
                base = base_country(v.get("phones", []))
                prog[k]["country"] = base or "نامشخص"
                if region_re(cfg).search(blurb):
                    # خود سایت از کشور/شهر هدف نام برده (دفتر/فعالیت) → شاهد ضعیف اما واقعی
                    prog[k]["region_address"] = f"کشور از شماره‌ی تلفن سایت؛ روی سایت از {cfg['country']} نام برده شده (دفتر/فعالیت)"
                    prog[k]["needs_review"] = True
                    mentioned += 1
                else:
                    prog[k]["region_address"] = (f"کشور از شماره‌ی تلفن سایت؛ فقط در نتیجه‌ی جست‌وجوی {cfg['country']} آمده، "
                                                 f"دفتر/فعالیت در آن تأیید نشده")
                    prog[k]["needs_review"] = True
                    prog[k]["fit"] = "ضعیف‌تر"           # ته جدول می‌نشیند
                unconf += 1
            elif k in prog:
                prog[k]["country"] = cfg["country"]
                # سایت‌هایی که از جست‌وجو آمدند خودشان در نتیجه بی‌کربنات داشتند؛ برای نام‌های برداشته‌شده از
                # بازارچه، ربط فقط با ذکر بی‌کربنات در صفحه‌ی سایت رسمی تأیید می‌شود
                if "بازارچه" in prog[k].get("llm_reason", "") and not BICARB_RE.search(blurb):
                    prog[k]["needs_review"] = True
                    nobicarb += 1
    efl.atomic_write_json(P["prog"], prog)
    print(f"  بعد از صحت‌سنجی: بدون سایت {nosite}، بازارچه/دایرکتوری {market}، از قبل در داده {dropped}، تکراری {dup} حذف شد؛ کشور تأییدنشده (نگه‌داشته با کشور واقعی و علامت بررسی) {unconf} که {mentioned} تایش روی سایت از کشور هدف نام برده، خرده‌فروشی {retail}، بدون ذکر بی‌کربنات در صفحه‌ی اصلی (علامت بررسی) {nobicarb}")
    run(os.path.join(HERE, "export_verified_xlsx.py"), f"buyers-{slug}", cfg["title"])


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("country", choices=sorted(COUNTRIES))
    ap.add_argument("--stage", default="all", choices=["discover", "verify", "export", "all"])
    ap.add_argument("--limit-queries", type=int)
    a = ap.parse_args()
    cfg = COUNTRIES[a.country]
    if a.stage in ("discover", "all"):
        stage_discover(a.country, cfg, a.limit_queries)
    if a.stage in ("verify", "all"):
        stage_verify(a.country, cfg)
    if a.stage in ("export", "all"):
        stage_export(a.country, cfg)


if __name__ == "__main__":
    main()
