"""
غرفه‌داران عراقی نمایشگاه‌های Agro Pack & Food Iraq (اربیل ۲۰۲۴/۲۰۲۵/۲۰۲۶) و Iraq Agrofood Baghdad 2025.

چرا: وب عراق محتوای کمی دارد و دایرکتوری/اتاق بازرگانی عمومی نیست؛ کاتالوگ آنلاین این نمایشگاه‌ها (پلتفرم idos.events)
عمومی است و ۶۷ شرکت عراقی در دوره‌ی ۲۰۲۶ دارد. فقط نام/بخش/سالن/غرفه از کاتالوگ می‌آید؛ هیچ تماسی از کاتالوگ گرفته
نمی‌شود — سایت رسمی هر شرکت جداگانه با verify_company_contacts.py (جست‌وجو + تطبیق نام) پیدا و صحت‌سنجی می‌شود.

مراحل:  python scripts/iraq_agrofood_finder.py [--stage collect|verify|export|all]
خروجی: data/exhibition_leads/iraq-agrofood.{raw,input,progress,verified}.json  و اکسل «Iraq Agrofood (تأییدشده).xlsx»
"""

import argparse
import json
import os
import re
import subprocess
import sys

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PY = sys.executable
COUNTRIES = {
    "Iraq": {"slug": "iraq-agrofood", "dial": "+964", "tlds": ("iq", "krd"), "title": "Iraq Agrofood", "only_relevant": True},
    # غرفه‌داران ایرانی همان نمایشگاه: کل فهرست (هم‌صنف/همکار/کانال فروش بالقوه) نه فقط بخش‌های مرتبط
    "Iran": {"slug": "iran-agrofood", "dial": "+98", "tlds": ("ir",), "title": "Iran Agrofood", "only_relevant": False},
}
COUNTRY, SLUG, DIAL, TLDS, TITLE, ONLY_RELEVANT = "Iraq", "iraq-agrofood", "+964", ("iq", "krd"), "Iraq Agrofood", True


def set_country(name):
    global COUNTRY, SLUG, DIAL, TLDS, TITLE, ONLY_RELEVANT
    c = COUNTRIES[name]
    COUNTRY, SLUG, DIAL, TLDS, TITLE, ONLY_RELEVANT = name, c["slug"], c["dial"], c["tlds"], c["title"], c["only_relevant"]
CATALOGUES = {109: "Agro Pack Food Plast Iraq 2026 (اربیل)", 87: "Agro Pack Food Plast Iraq 2025 (اربیل)",
              100: "Iraq Agrofood & Plastprintpack 2025 (بغداد)", 62: "Agro Pack & Food Iraq 2024 (اربیل)"}
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}

# طبقه‌بندی شفاف و قاعده‌محور (نه مدل زبانی): مصرف‌کننده/تاجر بالقوه‌ی بی‌کربنات سدیم
EXCLUDE_RE = re.compile(r"(carton|cardboard|corrugated|packag|plastic|pet\b|preform|label|printing|bottle|cap\b|closure|"
                        r"forklift|refrigerat|cooling|supermarket|shelf|machin|government|institution|polymer|paper|"
                        r"irrigation|decoration|transportation|recycl|glass|metal|tin box|can making|equipment)", re.I)
STRONG_RE = re.compile(r"(bakery|biscuit|cake|bread|pastr|flour|confection|baking|yeast|wafer|cone|snack|chips|pasta|noodle|"
                       r"cornflake|corn flake|food ingredient|additive|preservative|flavo|sweetener|feed|chemical|"
                       r"fmcg|foreign trade|trading|import|starch|salt|detergent|clean|water treat)", re.I)
MEDIUM_RE = re.compile(r"(food|beverage|juice|dairy|milk|cheese|yog|meat|canned|tomato|rice|tea|coffee|sauce|legume|pulse|"
                       r"oat|date|tahini|spice|herb|sesame|ice cream)", re.I)
TRADER_RE = re.compile(r"(fmcg|foreign trade|trading|import|distribut|wholesal)", re.I)


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def stage_collect():
    client = httpx.Client(timeout=60, follow_redirects=True, trust_env=False, headers=HEADERS)
    found = {}
    for cid, label in CATALOGUES.items():
        r = client.get(f"https://crm.idos.events/portal/catalogue/{cid}/exhibitors")
        soup = BeautifulSoup(r.text, "html.parser")
        n = 0
        for tr in soup.select("table tr"):
            tds = [td.get_text(" ", strip=True) for td in tr.select("td")]
            if len(tds) < 5 or tds[1] != COUNTRY:
                continue
            n += 1
            e = found.setdefault(norm(tds[0]), {"name": tds[0], "sectors": tds[2], "editions": [], "stands": []})
            e["editions"].append(label)
            e["stands"].append(f"{cid}: {tds[3]}/{tds[4]}")
            if len(tds[2]) > len(e["sectors"]):
                e["sectors"] = tds[2]
        print(f"  کاتالوگ {cid} ({label}): {n} شرکت {COUNTRY}")
    efl.atomic_write_json(os.path.join(efl.OUTPUT_DIR, f"{SLUG}.raw.json"), found)

    inp, prog = [], {}
    for key, e in sorted(found.items(), key=lambda kv: -len(kv[1]["editions"])):
        sec = e["sectors"]
        strong, medium = bool(STRONG_RE.search(sec)), bool(MEDIUM_RE.search(sec))
        if ONLY_RELEVANT:
            if EXCLUDE_RE.search(sec) and not strong:
                continue
            if not (strong or medium):
                continue
        idx = f"iraqagro:{len(inp) + 1}"
        inp.append({"id": idx, "name": e["name"], "country": COUNTRY, "website": None, "website_official": False})
        prog[idx] = {
            "name": e["name"], "country": COUNTRY, "relevant": True,
            "company_type": "trader" if TRADER_RE.search(sec) else "manufacturer",
            "suggested_grade": "", "fit": "قوی" if strong else "ضعیف‌تر",
            "fit_reason": ("بخش فعالیت در کاتالوگ: " + sec[:80]),
            "llm_reason": "غرفه‌دار نمایشگاه(های): " + "؛ ".join(sorted(set(e["editions"]))),
            "description": f"بخش‌ها: {sec}", "stand": " | ".join(e["stands"])[:60], "region_address": "",
            "needs_review": (not strong) and ONLY_RELEVANT, "_order": len(inp),
        }
    efl.atomic_write_json(os.path.join(efl.OUTPUT_DIR, f"{SLUG}.input.json"), inp)
    efl.atomic_write_json(os.path.join(efl.OUTPUT_DIR, f"{SLUG}.progress.json"), prog)
    print(f"[COLLECT] {len(found)} شرکت {COUNTRY} یکتا؛ مرتبط (غذا/افزودنی/خوراک/تجارت): {len(inp)} "
          f"(قوی {sum(1 for p in prog.values() if p['fit'] == 'قوی')})")


def run(*a):
    return subprocess.run([PY, "-u", *a], cwd=ROOT).returncode


def stage_verify():
    vc = os.path.join(HERE, "verify_company_contacts.py")
    inp = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.input.json")
    out = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.verified.json")
    run(vc, "--input", inp, "--out", out, "--workers", "5")
    run(vc, "--input", inp, "--out", out, "--render-only")


def sanitize():
    """قبل از اکسل: (۱) سایتی که هیچ شماره‌ی عراقی (+964) ندارد و دامنه‌ی .iq/.krd هم نیست متعلق به شرکت دیگری
    (مثلاً هم‌نام ترک/آلمانی/پاکستانی) است → سایت و تماسش خالی می‌شود، خودِ شرکت (از کاتالوگ) می‌ماند؛
    (۲) سایت staging؛ (۳) دو ورودی با یک دامنه → فقط اولی (املای تکراری غرفه‌دار)."""
    vp = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.verified.json")
    raw = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.verified.raw.json")
    if not os.path.exists(raw):
        efl.atomic_write_json(raw, json.load(open(vp, encoding="utf-8")))
    ver = json.load(open(raw, encoding="utf-8"))          # همیشه از خروجی خامِ صحت‌سنجی شروع می‌شود
    pp = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.progress.json")
    prog = json.load(open(pp, encoding="utf-8"))
    for pr in prog.values():
        pr["relevant"] = True
        pr["region_address"] = ""
    blanked = dup = 0
    seen = {}
    for k, v in ver.items():
        site = v.get("website")
        if not site:
            continue
        host = site.split("//")[-1].split("/")[0].lower().removeprefix("www.")
        tld = host.rsplit(".", 1)[-1]
        phones = v.get("phones", [])
        foreign = bool(phones) and not any(str(ph.get("e164", "")).startswith(DIAL) for ph in phones) and tld not in TLDS
        if host.startswith(("staging.", "dev.", "test.")) or host.endswith((".directory", ".business", ".biz")) or foreign:
            for f in ("website", "email_best", "email_confidence", "email_source_url", "phone_best", "phone_source_url"):
                v[f] = None
            v["emails"], v["phones"] = [], []
            v["website_status"] = "rejected_not_iraqi_entity"
            if k in prog:
                prog[k]["needs_review"] = True
                prog[k]["region_address"] = f"سایتِ پیداشده شماره‌ی {COUNTRY} ({DIAL}) نداشت (احتمالاً شرکت دیگری با نام مشابه) → تماس خالی گذاشته شد"
            blanked += 1
            continue
        # شماره‌ی ساختگی (۱۲۳۴۵۶۷ …) حذف؛ اگر شماره‌ی کشور شرکت هست، شماره‌های کشورهای دیگر کنار می‌روند
        ok = [ph for ph in phones if not re.search(r"(\d)\1{5,}|1234567|7654321|0123456|0000000",
                                                    re.sub(r"\D", "", str(ph.get("e164", "")))[-8:])]
        local = [ph for ph in ok if str(ph.get("e164", "")).startswith(DIAL)]
        ok = local or ok
        ok.sort(key=lambda ph: (ph.get("kind") == "text",))
        if len(ok) != len(phones) or (ok and v.get("phone_best") != ok[0].get("display")):
            v["phones"] = ok
            v["phone_best"] = ok[0]["display"] if ok else None
            v["phone_source_url"] = ok[0].get("source_url") if ok else None
        reg = ".".join(host.split(".")[-2:])
        if reg in seen and k in prog:
            prog[k]["relevant"] = False
            dup += 1
        else:
            seen[reg] = k
    efl.atomic_write_json(vp, ver)
    efl.atomic_write_json(pp, prog)
    print(f"  sanitize: {blanked} سایت متعلق به نهاد غیرعراقی/staging خالی شد، {dup} ورودی تکراری (یک دامنه) حذف شد")


def stage_export():
    sanitize()
    run(os.path.join(HERE, "export_verified_xlsx.py"), SLUG, TITLE)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--stage", default="all", choices=["collect", "verify", "export", "all"])
    ap.add_argument("--country", default="Iraq", choices=sorted(COUNTRIES))
    a = ap.parse_args()
    set_country(a.country)
    if a.stage in ("collect", "all"):
        stage_collect()
    if a.stage in ("verify", "all"):
        stage_verify()
    if a.stage in ("export", "all"):
        stage_export()


if __name__ == "__main__":
    main()
