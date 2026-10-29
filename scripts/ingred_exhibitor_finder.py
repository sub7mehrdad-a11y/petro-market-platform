"""
استخراج غرفه‌داران Global Ingredients Show (مسکو، برگزارکننده MVK) از
https://new.ingred.ru/en-GB/about/exhibitor-list.aspx و فیلتر به خریداران بالقوه‌ی
جوش شیرین (تولیدکننده + بازرگان/توزیع‌کننده‌ی حوزه‌ی غذا و مواد اولیه‌ی غذایی).

چرا اسکریپت جدا (نه همان exhibitor_lead_finder.py): ساختار این سایت با گلفود فرق
دارد. سایت روی Kentico/ASP.NET است؛ فهرست با __doPostBack صفحه‌بندی می‌شود (۲۱ شرکت
در هر صفحه، نه AJAX) و برای هر شرکت یک endpoint رسمی JSON هست:
  /en-GB/about/exhibitor-list/exhibitorpopup.aspx?id=<ItemID>
که خودِ برگزارکننده پر کرده: Name, Description, Email, Site, Country, Region,
Address, Pavilion, Stand. پس ایمیل و وب‌سایت «رسمی»اند، نه حدسی. شماره‌تلفن در
این فهرست نیست؛ از وب‌سایت خودِ شرکت (همان منطق گلفود) گرفته می‌شود.

باقی منطق (طبقه‌بندی Groq با کلید اختصاصی، چک‌پوینت، استخراج تماس از سایت شرکت،
خروجی اکسل) مستقیماً از exhibitor_lead_finder.py استفاده می‌شود.

چک‌پوینت: همه‌چیز در data/exhibition_leads/global-ingredients-show-2026.progress.json
ذخیره می‌شود و اجرای مجدد از همان‌جا ادامه می‌دهد.
"""

import os
import re
import sys
import json
import time
import argparse

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402
from env_utils import load_env  # noqa: E402

LIST_URL = "https://new.ingred.ru/en-GB/about/exhibitor-list.aspx"
POPUP_URL = "https://new.ingred.ru/en-GB/about/exhibitor-list/exhibitorpopup.aspx?id="
EVENT_NAME = "Global Ingredients Show 2026"
SLUG = "global-ingredients-show-2026"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
}
DELAY = 0.4
MAX_PAGES = 60  # سقف ایمنی؛ سایت الان ۹ صفحه دارد

JUNK_DESC_RE = re.compile(r"(just another wordpress|ещ[её] один сайт на wordpress|lorem ipsum|default web site)", re.I)
NOT_COMPANY_NAME_RE = re.compile(r"(NEWS|MAGAZINE|MEDIA|PUBLISHING|PORTAL|ASSOCIATION)", re.I)

# اصلاح دستیِ خروجی مدل (۲۰۲۶-۱۰-۲۳): Groq در چند مورد با توضیح خودِ شرکت در تناقض رد
# کرد (مثلاً BLUE-CHEM که صراحتاً می‌گه «Food Ingredients ... Export»). توضیحات این
# شرکت‌ها را خودم خواندم؛ فقط مواردی که توضیحشان صراحتاً افزودنی/ماده‌ی اولیه‌ی غذایی
# تولید یا توزیع می‌کند اصلاح شد. (نوع، گرید، دلیل، نیاز به بررسی دستی؟)
MANUAL_OVERRIDES = {
    "BLUE-CHEM CO., LIMITED": ("trader", "گرید غذایی/دارویی – بازرگانی مواد اولیه", "بازرگان صادرکننده‌ی Food Ingredients/دارو/افزودنی خوراک در ۳۰+ کشور", False),
    "SICHUAN KINDIA MAY SCIENCE AND TECH CO.,LTD": ("manufacturer", "گرید غذایی – فسفات‌های غذایی (مکمل پودر بکینگ)", "تولیدکننده‌ی فسفات‌های خوراکی (سدیم/پتاسیم فسفات) — همسایه‌ی طبیعی پودر بکینگ", False),
    "JIANGSU TIANJIANG BIOTECHNOLOGY CO., LTD.": ("manufacturer", "گرید غذایی – نشاسته‌ی خوراکی/اصلاح‌شده", "تولیدکننده‌ی نشاسته‌ی خوراکی و اصلاح‌شده", False),
    "JIANGSU LIHONG TECHNOLOGY DEVELOPMENT CO., LTD.": ("manufacturer", "گرید غذایی – امولسیفایر/ضدکف", "تولیدکننده‌ی امولسیفایر (خط تولید فودگرید)", False),
    "SHANDONG KUNDA BIOTECHNOLOGY COMPANY LIMITED": ("manufacturer", "گرید غذایی – سوربات و نشاسته", "تولیدکننده‌ی سوربیک اسید/پتاسیم سوربات/نشاسته‌ی سیب‌زمینی شیرین", False),
    "ZHEJIANG WANGLIN BIO-TECH CO., LTD": ("manufacturer", "گرید غذایی – رنگ خوراکی", "تولیدکننده‌ی کربن‌سیاه گیاهی E153 و پودرهای خوراکی", False),
    "CHONGQING CHUANDONG CHEMICAL (GROUP) CO., LTD.": ("manufacturer", "گرید غذایی – فسفات و نمک‌های معدنی", "گروه نمک‌های معدنی؛ افزودنی غذایی/خوراک دام (سدیم تری‌پلی‌فسفات)", False),
    "HAINAN NICEPAL INDUSTRY CO.,LTD.": ("manufacturer", "گرید غذایی – پودر و پوره‌ی میوه", "تولیدکننده‌ی پودر/پوره‌ی میوه و سبزی برای صنایع غذایی", False),
    "QINGDAO VLAND BIOTECH GROUP CO., LTD": ("manufacturer", "گرید غذایی – آنزیم‌ها", "تولیدکننده‌ی آنزیم برای غذا/خوراک (کوشر و حلال)", False),
    "HUBEI XINGFA CHEMICALS GROUP CO.,LTD.": ("manufacturer", "گرید غذایی – فسفات‌ها", "بزرگ‌ترین تولیدکننده‌ی فسفات‌های تخصصی چین — احتمالاً فودگرید", True),
    "QINGDAO GATHER GREAT OCEAN ALGAE INDUSTRY GROUP CO.,LTD.": ("manufacturer", "گرید غذایی – جلبک/هیدروکلوئید", "فرآورده‌های جلبک دریایی؛ در نمایشگاه مواد افزودنی غذایی", True),
    "CLOUD AND CHEM CO., LTD.": ("trader", "گرید غذایی/دارویی – بازرگانی مواد شیمیایی", "صادرکننده‌ی مواد دارویی/شیمیایی (بازرگان)", True),
    "FIPHARM (GROUP) CO., LTD": ("trader", "گرید غذایی/دارویی – بازرگانی مواد شیمیایی", "صادرکننده‌ی مواد دارویی/شیمیایی (بازرگان)", True),
    "ROBIOS": ("manufacturer", "گرید غذایی/دارویی – مکمل", "تولیدکننده‌ی آرابینوگالاکتان و دی‌هیدروکورسِتین (مکمل/آنتی‌اکسیدان خوراکی)", True),
}

EXTRA_PROMPT = """

نکته‌ی اضافه برای این نمایشگاه (Global Ingredients Show مسکو — مواد اولیه و افزودنی
غذایی). این موارد relevant=true هستند:
  - هر شرکتی که افزودنی/ماده‌ی اولیه‌ی مصرفی در نانوایی، قنادی، لبنیات، گوشت،
    نوشیدنی، اسنک یا مکمل غذایی تولید یا توزیع می‌کند (تولیدکننده یا بازرگان).
  - تولیدکننده‌ی «محصول غذایی نهایی» (نان و شیرینی، اسنک و غلات اکسترود، پنیر و
    لبنیات، فرآورده‌ی گوشتی، پرکن/مربا/شکلات، نوشیدنی) هم مصرف‌کننده‌ی مستقیم
    مواد اولیه است و رد نمی‌شود — «محصول نهایی است» دلیل رد نیست.
  - شرکت بازرگانی/شیمیایی عمومی که مواد اولیه به صنایع غذایی/دارویی هم عرضه می‌کند
    (trader)، حتی اگر توضیح مشخصی از محصولاتش نیست ولی فروش مواد اولیه است.
  - اگر خودش سدیم بی‌کربنات یا نمک‌های قلیایی مشابه می‌فروشد (رقیب یا شریک توزیع)،
    باز هم relevant=true و در reason بنویس «فروشنده‌ی مستقیم بی‌کربنات/رقیب».
فقط این‌ها رد شوند: رسانه/مجله/انتشارات/انجمن/برگزارکننده‌ی نمایشگاه، ماشین‌آلات و
تجهیزات، بسته‌بندی و چاپ، سازنده‌ی کپسول/دارو/آرایشی/عطر که ربطی به غذا ندارد،
و شرکت‌هایی که فعالیتشان کشاورزی خام (بذر/محصول تازه) یا غیرغذایی است.
"""

def _hidden(soup: BeautifulSoup) -> dict:
    return {i["name"]: i.get("value", "") for i in soup.find_all("input", {"type": "hidden"}) if i.get("name")}


def _ids(soup: BeautifulSoup) -> list[str]:
    return [e["data-exib"] for e in soup.select("div.participant[data-exib]")]


def scan_exhibitor_ids(client: httpx.Client) -> list[str]:
    r = client.get(LIST_URL)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    link = soup.select_one("div.pagination a[href*=doPostBack]")
    if not link:
        raise RuntimeError("لینک صفحه‌بندی (__doPostBack) پیدا نشد؛ ساختار سایت عوض شده؟")
    target = re.search(r"__doPostBack\('([^']+)'", link["href"]).group(1)

    all_ids, seen, page = [], set(), 1
    while page <= MAX_PAGES:
        new = [i for i in _ids(soup) if i not in seen]
        if not new:
            break
        seen.update(new)
        all_ids += new
        print(f"  [OK] صفحه {page}: {len(new)} شرکت جدید (جمع: {len(all_ids)})")
        page += 1
        time.sleep(DELAY)
        data = _hidden(soup)
        data["__EVENTTARGET"] = target
        data["__EVENTARGUMENT"] = str(page)
        r = client.post(LIST_URL, data=data)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
    return all_ids


def _clean(v) -> str:
    v = (v or "").strip()
    return "" if v in ("-", "–", "—") else v


def fetch_popup(client: httpx.Client, item_id: str) -> dict | None:
    for attempt in range(3):
        try:
            r = client.get(POPUP_URL + item_id, headers={"X-Requested-With": "XMLHttpRequest"})
            r.raise_for_status()
            d = json.loads(r.text)
            d = d[0] if isinstance(d, list) else d
            d.pop("Logo", None)
            return d
        except Exception:  # noqa: BLE001
            time.sleep(1.5 * (attempt + 1))
    return None


def normalize_site(site: str) -> str:
    site = _clean(site)
    if not site:
        return ""
    site = re.sub(r"[^\x00-\x7F]+", "", site).strip()
    if not site:
        return ""
    return site if site.lower().startswith("http") else "https://" + site


def build_item(d: dict) -> dict:
    stand_parts = []
    for p, s in (("Pavilion", "Stand"), ("Pavilion2", "Stand2"), ("Pavilion3", "Stand3")):
        pav, st = _clean(d.get(p)), _clean(d.get(s))
        if pav or st:
            stand_parts.append(" ".join(x for x in (pav, st) if x))
    place = ", ".join(x for x in (_clean(d.get("Region")), _clean(d.get("Address"))) if x)
    email = _clean(d.get("Email"))
    email = re.split(r"[;,\s]+", email)[0] if email else ""
    return {
        "name": _clean(d.get("Name")),
        "country": _clean(d.get("Country")),
        "profile_url": POPUP_URL + str(d.get("ItemID")),
        "description": re.sub(r"\s+", " ", BeautifulSoup(_clean(d.get("Description")), "html.parser").get_text(" ")).strip(),
        "categories": [x for x in (_clean(d.get("Brands")),) if x],
        "stand": " | ".join(stand_parts),
        "region_address": place,
        "website": normalize_site(d.get("Site")),
        "website_source": "exhibitor_directory" if normalize_site(d.get("Site")) else None,
        "email": email,
        "email_source": "exhibitor_directory" if email else None,
    }


def homepage_blurb(client: httpx.Client, url: str) -> str:
    """برای شرکت‌های بدون توضیح در فهرست: title + meta description صفحه‌ی اصلی."""
    try:
        r = client.get(url, timeout=15, follow_redirects=True)
        if r.status_code >= 400:
            return ""
        s = BeautifulSoup(r.text, "html.parser")
        title = s.title.get_text(" ", strip=True) if s.title else ""
        meta = s.find("meta", attrs={"name": re.compile("^description$", re.I)})
        desc = (meta.get("content") or "").strip() if meta else ""
        if not desc or JUNK_DESC_RE.search(desc):
            for t in s(["script", "style", "nav", "header", "footer"]):
                t.decompose()
            desc = s.get_text(" ", strip=True)[:300]  # متن خودِ صفحه، وقتی meta بی‌محتواست
        return re.sub(r"\s+", " ", f"{title}. {desc}").strip(" .")[:400]
    except Exception:  # noqa: BLE001
        return ""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contact-limit", type=int, default=None,
                        help="فقط این‌قدر شرکت جدید برای تماس بررسی شود (اجرای دسته‌ای)")
    parser.add_argument("--reclassify-rejected", action="store_true",
                        help="شرکت‌های ردشده‌ی قبلی دوباره به مدل داده شوند (بعد از اصلاح پرامپت)")
    parser.add_argument("--no-enrich", action="store_true", help="مرحله‌ی تماس از وب‌سایت شرکت رد شود")
    parser.add_argument("--no-llm", action="store_true")
    args = parser.parse_args()

    load_env()
    os.makedirs(efl.OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.json")
    progress_path = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.progress.json")
    raw_path = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.raw.json")

    # ---- ۱) فهرست + جزئیات رسمی (کش‌شده تا اجرای مجدد دوباره نگیرد)
    if os.path.exists(raw_path):
        with open(raw_path, encoding="utf-8") as f:
            items = json.load(f)
        print(f"[1/4] {len(items)} شرکت از کش خام ({raw_path}) خوانده شد.")
    else:
        print("[1/4] دریافت فهرست غرفه‌داران و جزئیات رسمی هرکدام")
        # trust_env=False: ingred.ru از خروجی پراکسی محلی (۱۲۷.۰.۰.۱:۱۰۸۰۸) قطع می‌کنه؛ مستقیم کار می‌کنه.
        with httpx.Client(headers=HEADERS, timeout=60, follow_redirects=True, trust_env=False) as client:
            ids = scan_exhibitor_ids(client)
            items, fails = [], 0
            for n, i in enumerate(ids, 1):
                d = fetch_popup(client, i)
                if d and _clean(d.get("Name")):
                    items.append(build_item(d))
                else:
                    fails += 1
                time.sleep(DELAY)
            print(f"  {len(items)} شرکت با جزئیات، {fails} شکست.")
            if fails:
                print("  [WARN] چون شکست داشتیم، کش ذخیره نمی‌شود تا اجرای بعدی دوباره امتحان کند.")
            else:
                efl.atomic_write_json(raw_path, items)

    # تکراری‌ها (دو ItemID با یک نام) را یکی کن
    seen, uniq = set(), []
    for it in items:
        k = (it["name"].lower(), it["country"].lower())
        if k not in seen:
            seen.add(k)
            uniq.append(it)
    items = uniq
    print(f"  {len(items)} شرکت یکتا")

    # ---- ۲) شرکت‌های بدون توضیح: از صفحه‌ی اصلی سایتشان یک خلاصه بگیر
    progress = efl.load_progress(progress_path)
    if progress:
        print(f"  [RESUME] {len(progress)} شرکت از اجرای قبلی پیدا شد.")

    if args.reclassify_rejected:
        dropped = [k for k, v in progress.items() if not v.get("relevant")]
        for k in dropped:
            del progress[k]
        efl.save_progress(progress_path, progress)
        print(f"  {len(dropped)} شرکت ردشده برای طبقه‌بندی دوباره از progress برداشته شد.")

    # توضیح‌های بی‌محتوای قالب (مثل «Just another WordPress site») = بدون توضیح
    for it in items:
        if JUNK_DESC_RE.search(it["description"]):
            it["description"] = ""

    todo_blurb = [it for it in items if efl.candidate_key(it) not in progress
                  and len(it["description"]) < 15 and it["website"]]
    if todo_blurb:
        print(f"[2/4] خلاصه از صفحه‌ی اصلی برای {len(todo_blurb)} شرکت بدون توضیح")
        with httpx.Client(headers=efl.HEADERS, follow_redirects=True) as client:
            for it in todo_blurb:
                blurb = homepage_blurb(client, it["website"])
                if blurb:
                    it["description"] = blurb
                    it["description_source"] = "homepage"
                time.sleep(DELAY)

    # ---- ۳) طبقه‌بندی با Groq (کلید اختصاصی)
    def flush() -> int:
        return efl.write_output_from_progress(out_path, EVENT_NAME, LIST_URL, len(items), progress)

    if args.no_llm:
        print("[3/4] رد شد (--no-llm)")
    else:
        print(f"[3/4] طبقه‌بندی با groq روی {len(items)} شرکت")
        efl.LLM_SYSTEM_PROMPT = efl.LLM_SYSTEM_PROMPT + EXTRA_PROMPT
        generate_fn = efl.make_generate_fn("groq")
        ok, fail, quota = efl.llm_refine(items, progress, progress_path, on_batch_done=flush,
                                         generate_fn=generate_fn)
        if quota:
            print("[INFO] سهمیه‌ی روزانه‌ی Groq تمام شد؛ اجرای بعدی ادامه می‌دهد.")
        elif ok == 0 and fail > 0:
            flush()
            print("[FATAL] همه‌ی بچ‌ها با خطای غیرمنتظره رد شدند.")
            sys.exit(1)
    for k, v in progress.items():
        ov = MANUAL_OVERRIDES.get(v.get("name"))
        if ov and not v.get("manual_override"):
            ctype, grade, reason, review = ov
            v.update(relevant=True, company_type=ctype, suggested_grade=grade,
                     llm_reason=reason + " (اصلاح دستی پس از خواندن توضیح شرکت)",
                     manual_override=True)
            if review:
                v["needs_review"] = True
    # شرکت‌هایی که هیچ توضیحی (حتی از صفحه‌ی اصلی) پیدا نشد ولی ایمیل رسمی دارن و اسمشون
    # رسانه/مجله نیست: رد قطعی نمی‌کنیم، با علامت «نیاز به بررسی دستی» نگه می‌داریم —
    # عدم اطلاعات یعنی «نمی‌دونیم»، نه «بی‌ربط».
    for k, v in progress.items():
        if v.get("needs_review") and not v.get("manual_override") and NOT_COMPANY_NAME_RE.search(v.get("name", "")):
            v["relevant"] = False  # رسانه/مجله — اشتباه قبلی همین قاعده را برمی‌گردانیم
            v.pop("needs_review", None)
            v["llm_reason"] = "رسانه/مجله/انجمن (طبق نام) — مرتبط نیست"
        if (not v.get("relevant") and not (v.get("description") or "").strip()
                and v.get("email") and not NOT_COMPANY_NAME_RE.search(v.get("name", ""))):
            v["relevant"] = True
            v["needs_review"] = True
            v["company_type"] = "trader" if re.search(r"TRADING|TRADE", v["name"], re.I) else None
            v["llm_reason"] = "توضیحی از شرکت در دسترس نیست؛ به‌خاطر حضور در نمایشگاه مواد اولیه‌ی غذایی نگه داشته شد — نیاز به بررسی دستی"
    # شرکتِ بدون توضیح که llm_refine آن را «بدون توضیح» رد کرده، دوباره بررسی نمی‌شود؛ اینجا
    # فقط هر ورودی را که هنوز در progress نیست ثبت می‌کنیم تا چیزی گم نشود.
    for it in items:
        k = efl.candidate_key(it)
        if k not in progress and args.no_llm:
            progress[k] = {**it, "relevant": True, "company_type": None, "suggested_grade": None,
                           "llm_reason": None, "_order": len(progress)}
    efl.save_progress(progress_path, progress)
    print(f"  {flush()} شرکت مرتبط تا الان (از {len(progress)} پردازش‌شده از {len(items)})")

    # ---- ۴) تماس: ایمیل/وب‌سایت رسمی از فهرست؛ تلفن/واتساپ (و ایمیل جایگزین) از سایت شرکت
    if args.no_enrich:
        print("[4/4] رد شد (--no-enrich)")
    else:
        todo = [(k, v) for k, v in progress.items() if v.get("relevant") and not v.get("contact_checked")]
        if args.contact_limit:
            todo = todo[:args.contact_limit]
        print(f"[4/4] استخراج تماس از سایت {len(todo)} شرکت مرتبط")
        playwright_ctx, browser = None, None
        try:
            from playwright.sync_api import sync_playwright
            playwright_ctx = sync_playwright().start()
            browser = playwright_ctx.chromium.launch()
        except Exception as e:  # noqa: BLE001
            print(f"  [INFO] Playwright در دسترس نبود ({e}) — فقط httpx.")
        try:
            with httpx.Client(follow_redirects=True) as client:
                for n, (key, rec) in enumerate(todo, 1):
                    try:
                        c = efl.enrich_company_contacts(
                            client, rec.get("profile_url"), name=rec.get("name", ""),
                            country=rec.get("country", ""), browser=browser,
                            known_website=rec.get("website") or None)
                    except Exception as e:  # noqa: BLE001
                        c = {"website": None, "email": None, "whatsapp": None,
                             "contact_note": f"خطای غیرمنتظره: {e}", "website_source": None}
                    # ایمیل/سایت رسمیِ فهرست بر نتیجه‌ی استخراج‌شده از سایت مقدم است.
                    merged = {**rec, **{k: v for k, v in c.items() if v}}
                    for f in ("email", "website", "website_source"):
                        if rec.get(f):
                            merged[f] = rec[f]
                    if c.get("email") and rec.get("email") and c["email"].lower() != rec["email"].lower():
                        merged["email_alt"] = c["email"]
                    merged["contact_checked"] = True
                    progress[key] = merged
                    time.sleep(efl.REQUEST_DELAY_SEC)
                    if n % 5 == 0 or n == len(todo):
                        efl.save_progress(progress_path, progress)
                        flush()
                        print(f"  [OK] {n}/{len(todo)} شرکت بررسی شد")
        finally:
            if browser:
                browser.close()
            if playwright_ctx:
                playwright_ctx.stop()

    total = flush()
    print(f"\n[DONE] {total} شرکت مرتبط در {out_path} ذخیره شد.")


if __name__ == "__main__":
    main()


