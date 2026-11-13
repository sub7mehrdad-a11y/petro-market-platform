"""
غرفه‌داران Indusfood (نمایشگاه غذا و کشاورزی هند) از https://indusfood.co.in/exhibitor-directory

ساختار سایت: صفحه‌ی لیست با JavaScript از یک API عمومی JSON می‌خواند:
  POST /api/exhibitor-list.php    {stall_no, company_name, product_zone, featured, country_name,
                                   hall_no, page, limit}  → company_name, country, industry,
                                   website, stall_no, hall_no, product_zone, product_list, ...
  POST /api/exhibitor-detail.php  {id} → nature_of_company (Manufacturer/Trader...), whatsapp_no,
                                   products[{productName, description}], city/state، آدرس، ...
هیچ‌کدام ایمیل ندارند. وب‌سایت و واتساپ را خودِ شرکت هنگام ثبت‌نام در نمایشگاه وارد کرده
(«رسمی»)، ولی ایمیل و تلفن تأییدشده باید از سایت خودِ شرکت (verify_company_contacts.py) بیاید.

مراحل: ۱) فهرست + جزئیات (کش در <slug>.raw.json، قابل ادامه) ۲) طبقه‌بندی Groq با کلید
اختصاصی (llm_refine مشترک؛ چک‌پوینت در .progress.json) — صنعت‌های بی‌ربط واضح (IT، لجستیک،
ماشین‌آلات) بدون مصرف LLM رد می‌شوند.
بعدش:  verify_company_contacts.py --slug indusfood-2026  و  export_verified_xlsx.py
"""

import os
import re
import sys
import json
import time
import argparse

import httpx
import phonenumbers

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402
from env_utils import load_env  # noqa: E402

BASE = "https://indusfood.co.in"
SLUG = "indusfood-2026"
EVENT_NAME = "Indusfood 2026"
LIST_URL = f"{BASE}/api/exhibitor-list.php"
DETAIL_URL = f"{BASE}/api/exhibitor-detail.php"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Content-Type": "application/json", "Accept": "application/json",
    "Referer": f"{BASE}/exhibitor-directory",
}
EMPTY_FILTER = {"stall_no": "", "company_name": "", "product_zone": "", "featured": 0, "country_name": "", "hall_no": ""}
DELAY = 0.3
# صنعت‌هایی که واضحاً مشتری/بازرگان مواد غذایی نیستند — بدون LLM رد می‌شوند
IRRELEVANT_INDUSTRIES = {"it & telecom", "logistics", "food & agri processing machinery"}


def fetch_list(client: httpx.Client) -> list[dict]:
    rows, page = [], 1
    while page <= 40:
        r = client.post(LIST_URL, json={**EMPTY_FILTER, "page": page, "limit": 100})
        r.raise_for_status()
        chunk = r.json()["data"]["data"]
        if not chunk:
            break
        rows += chunk
        print(f"  [OK] صفحه {page}: {len(chunk)} (جمع: {len(rows)})")
        if len(chunk) < 100:
            break
        page += 1
        time.sleep(DELAY)
    return rows


def fetch_detail(client: httpx.Client, ex_id: str) -> dict | None:
    for attempt in range(3):
        try:
            r = client.post(DETAIL_URL, json={"id": ex_id})
            r.raise_for_status()
            j = r.json()
            return j.get("data") if j.get("success") else None
        except Exception:  # noqa: BLE001
            time.sleep(1.5 * (attempt + 1))
    return None


def norm_site(u: str) -> str:
    u = re.sub(r"[^\x00-\x7F]+", "", (u or "")).strip()
    if not u or u.lower() in ("-", "na", "n/a", "none", "http://", "https://"):
        return ""
    return u if u.lower().startswith("http") else "https://" + u


def norm_phone(raw: str, country: str) -> tuple[str, str]:
    """-> (e164, نمایشی) یا ('','') اگر معتبر نبود."""
    raw = (raw or "").strip()
    if not raw:
        return "", ""
    region = {"india": "IN", "uganda": "UG", "china": "CN", "philippines": "PH", "lebanon": "LB",
                      "nepal": "NP", "united arab emirates": "AE"}.get((country or "").strip().lower(), "IN")
    try:
        num = phonenumbers.parse(raw, None if raw.startswith("+") else region)
        if phonenumbers.is_valid_number(num):
            return (phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164),
                    phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.INTERNATIONAL))
    except Exception:  # noqa: BLE001
        pass
    return "", ""


def build_item(row: dict, det: dict | None) -> dict:
    det = det or {}
    name = re.sub(r"\s+", " ", (det.get("company_name") or row.get("company_name") or "")).strip()
    zones = [z for z in (row.get("product_zone") or []) if z]
    plist = [p for v in (row.get("product_list") or {}).values() for p in (v or [])]
    prods = det.get("products") or []
    prod_names = [p.get("productName", "").strip() for p in prods if p.get("productName")]
    prod_desc = " ".join((p.get("description") or "").strip() for p in prods[:3])
    profile = (det.get("company_profile") or row.get("company_profile") or "").strip()
    nature = (det.get("nature_of_company") or "").strip()
    desc_parts = [f"Nature: {nature}." if nature else "",
                  f"Zone: {', '.join(zones)}." if zones else "",
                  f"Products: {', '.join(dict.fromkeys(plist + prod_names))[:220]}." if (plist or prod_names) else "",
                  profile if profile.lower() != name.lower() else "", prod_desc]
    description = re.sub(r"\s+", " ", " ".join(p for p in desc_parts if p)).strip()
    e164, shown = norm_phone(det.get("whatsapp_no"), row.get("country") or det.get("country") or "India")
    city = ", ".join(x for x in (det.get("city_name"), det.get("state")) if x)
    addr = ", ".join(x for x in (city, (det.get("company_address") or row.get("company_address") or "").strip()) if x)
    return {
        "name": name,
        "country": row.get("country") or det.get("country") or "",
        "profile_url": f"{BASE}/exhibitor-directory#{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')}",
        "description": description,
        "categories": zones + plist[:6],
        "industry": row.get("industry") or det.get("industry") or "",
        "nature_of_company": nature,
        "stand": " ".join(x for x in (f"Hall {row.get('hall_no')}" if row.get("hall_no") else "", row.get("stall_no") or "") if x),
        "region_address": addr,
        "website": norm_site(row.get("website") or det.get("website")),
        "website_source": "exhibitor_directory" if norm_site(row.get("website") or det.get("website")) else None,
        "directory_phone": shown, "directory_phone_e164": e164,
    }


# درجه‌ی ربط به مصرف جوش شیرین (قانون شفاف، نه LLM): ۸۳٪ شرکت‌های یک نمایشگاه غذایی خالص «غذایی»
# حساب می‌شوند ولی مثلاً برنج‌کوبی/ادویه مشتری مستقیم جوش شیرین نیست. قوی = محصولات/توضیحاتی که
# جوش شیرین واقعاً در آن‌ها مصرف می‌شود (ورآمدن/ترد کردن/pH/گاز) یا بازرگان مواد اولیه‌ی غذایی.
FIT_GROUPS = {
    "نان/شیرینی/بیسکویت": r"bakery|bread|biscuit|cookie|cakes?|pastr(y|ies)|buns?|rusk|muffin|croissant|wafer|cracker|baking|bakers",
    "اسنک/خشکبار شور": r"snack|namkeen|chips|extrud|puffed|murukku|bhujia|papad|khakhra|crisps|popcorn|makhana|mixture",
    "قنادی/شیرینی": r"confectioner|candy|candies|mithai|halwa|jalebi|laddu|chikki|toffee|chocolate|sweets|cocoa",
    "لبنیات": r"dairy|cheese|paneer|milk|ghee|butter|curd|yogh?urt|ice cream|khoa",
    "گوشت/ماهی/مرغ": r"meat|poultry|chicken|sausage|nugget|seafood|fish|prawn|shrimp|marine",
    "نوشیدنی": r"beverage|carbonated|soft drink|juice|energy drink|effervescent|sparkling|soda",
    "آرد/میکس/نودل": r"flour|atta|maida|ready.?mix|premix|batter|idli|dosa|dhokla|noodle|pasta|vermicelli|semolina|suji|instant",
    "مواد اولیه/بازرگان": r"ingredient|additive|raw material|trader|trading|importer|distributor|wholesale|commodit|merchant",
    "مکمل/سلامت": r"supplement|nutraceutical|antacid|protein powder|health food|probiotic|nutrition",
    "خوراک دام": r"animal feed|cattle feed|poultry feed|feed",
}


def tag_fit(progress: dict) -> None:
    import re as _re
    for v in progress.values():
        if not v.get("relevant"):
            continue
        text = " ".join([v.get("description") or "", " ".join(v.get("categories") or []),
                         v.get("nature_of_company") or "", v.get("name") or ""]).lower()
        hits = [g for g, pat in FIT_GROUPS.items() if _re.search(pat, text)]
        if v.get("company_type") == "trader" and "مواد اولیه/بازرگان" not in hits:
            hits.append("مواد اولیه/بازرگان")
        v["fit"] = "قوی" if hits else "غذایی عمومی (ربط کمتر)"
        v["fit_reason"] = "، ".join(hits)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--max", type=int, default=None, help="فقط N شرکت اول (تست)")
    args = ap.parse_args()
    load_env()
    os.makedirs(efl.OUTPUT_DIR, exist_ok=True)
    raw_path = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.raw.json")
    progress_path = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.progress.json")
    out_path = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.json")

    # ---- ۱) فهرست + جزئیات (کش)
    raw = efl.load_progress(raw_path) if os.path.exists(raw_path) else {}
    # trust_env=False: API هندی مستقیم کار می‌کند؛ پراکسی محلی لازم نیست
    with httpx.Client(headers=HEADERS, timeout=60, follow_redirects=True, trust_env=False) as client:
        if not raw.get("rows"):
            print("[1/3] دریافت فهرست غرفه‌داران")
            raw = {"rows": fetch_list(client), "details": {}}
            efl.atomic_write_json(raw_path, raw)
        rows = raw["rows"][:args.max] if args.max else raw["rows"]
        todo = [r for r in rows if r["id"] not in raw["details"]]
        print(f"[1/3] جزئیات: {len(rows) - len(todo)} در کش، {len(todo)} مانده")
        for n, r in enumerate(todo, 1):
            raw["details"][r["id"]] = fetch_detail(client, r["id"]) or {}
            time.sleep(DELAY)
            if n % 50 == 0 or n == len(todo):
                efl.atomic_write_json(raw_path, raw)
                print(f"  [OK] {n}/{len(todo)}")

    items, seen = [], set()
    for r in rows:
        it = build_item(r, raw["details"].get(r["id"]))
        k = (re.sub(r"\W+", "", it["name"].lower()), it["country"].lower())
        if it["name"] and k not in seen:
            seen.add(k)
            items.append(it)
    print(f"  {len(items)} شرکت یکتا (از {len(rows)} ردیف)")

    # ---- ۲) طبقه‌بندی
    progress = efl.load_progress(progress_path)
    if progress:
        print(f"  [RESUME] {len(progress)} شرکت از اجرای قبلی")

    def flush() -> int:
        return efl.write_output_from_progress(out_path, EVENT_NAME, f"{BASE}/exhibitor-directory", len(items), progress)

    for it in items:
        k = efl.candidate_key(it)
        if k not in progress and it["industry"].strip().lower() in IRRELEVANT_INDUSTRIES:
            progress[k] = {**it, "relevant": False, "company_type": None, "suggested_grade": None,
                           "llm_reason": f"صنعت «{it['industry']}» — مشتری/بازرگان مواد غذایی نیست",
                           "_order": len(progress)}
    if args.no_llm:
        print("[2/3] رد شد (--no-llm)")
    else:
        print(f"[2/3] طبقه‌بندی با groq روی {len(items)} شرکت")
        generate_fn = efl.make_generate_fn("groq")
        ok, fail, quota = efl.llm_refine(items, progress, progress_path, on_batch_done=flush, generate_fn=generate_fn)
        if quota:
            print("[INFO] سهمیه‌ی روزانه‌ی Groq تمام شد؛ اجرای بعدی (فردا) ادامه می‌دهد.")
        elif ok == 0 and fail > 0:
            flush()
            print("[FATAL] همه‌ی بچ‌ها با خطای غیرمنتظره رد شدند.")
            sys.exit(1)
    tag_fit(progress)
    efl.save_progress(progress_path, progress)
    total = flush()
    print(f"[3/3] {total} شرکت مرتبط تا الان (از {len(progress)} پردازش‌شده از {len(items)}) → {out_path}")


if __name__ == "__main__":
    main()
