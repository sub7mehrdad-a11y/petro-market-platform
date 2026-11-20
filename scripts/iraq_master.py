"""
فهرست جامع و صحت‌سنجی‌شده‌ی عراق (یک اکسل).

ورودی‌ها (همه از قبل با verify_company_contacts.py صحت‌سنجی شده‌اند):
  iraq-agrofood      غرفه‌داران عراقی Agro Pack & Food Iraq (کاتالوگ رسمی نمایشگاه)
  buyers-iraq        تاجر/توزیع‌کننده‌ی بی‌کربنات از جست‌وجوی وب
  buyers-iraq_bp     تولیدکننده/توزیع‌کننده‌ی بیکینگ‌پودر و مواد نانوایی (مصرف‌کننده‌ی بی‌کربنات)

قواعد دقت (به ترتیب):
  ۱) «عراقی بودن» باید شاهد داشته باشد: کاتالوگ نمایشگاه (کشور=عراق) | شماره‌ی +964 | دامنه‌ی .iq/.krd | سایت از عراق نام برده.
     بقیه (خارجی که فقط در جست‌وجوی عراق آمده) به برگه‌ی جدا می‌روند، نه برگه‌ی اصلی.
  ۲) فقط شماره‌های +964؛ شماره‌ی ساختگی (۱۲۳۴۵۶۷، ۰۰۰۰۰۰ …) و نامعتبر حذف؛ شماره‌ی موبایل (۷۵۰/۷۷۰/۷۸۰/۷۹۰ …) به‌عنوان بهترین.
  ۳) هر سایت و دامنه‌ی ایمیل امروز دوباره چک می‌شود (باز شدن سایت؛ DNS سه resolver برای دامنه‌ی ایمیل).
  ۴) ایمیل فقط اگر روی سایت خود شرکت دیده شده؛ ایمیل با دامنه‌ی «مرده» حذف.

استفاده:  python scripts/iraq_master.py
"""

import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import httpx
import openpyxl
import phonenumbers
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402
import clean_exhibitor_emails as cee  # noqa: E402
import verify_company_contacts as vcc  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SOURCES = [
    ("iraq-agrofood", "غرفه‌دار نمایشگاه Agro Pack & Food Iraq"),
    ("buyers-iraq_bp", "جست‌وجوی تولیدکننده/توزیع‌کننده‌ی بیکینگ‌پودر"),
    ("buyers-iraq", "جست‌وجوی تاجر/توزیع‌کننده‌ی بی‌کربنات"),
]
# شرکتی که مشتری بالقوه‌ی بی‌کربنات نیست (سینما، تحقیقات بازار، …) — تشخیص دستی از بازبینی خروجی
NOT_BUYER_RE = re.compile(r"(cinema|market\s*research|competitive\s+intelligence|marketresearch)", re.I)
BAKERY_RE = re.compile(r"(bakery|biscuit|cake|bread|pastr|flour|confection|baking|wafer|cone|snack|chips|pasta|noodle|cornflake|"
                       r"corn flake|starch|custard|food ingredient|additive|preservative|flavo|sweetener|بيكنج|بيكن|مسحوق الخبز|خميرة|معجنات|كيك|بسكويت)", re.I)
FOOD_RE = re.compile(r"(food|beverage|juice|dairy|milk|cheese|yog|meat|canned|tomato|rice|tea|coffee|sauce|legume|pulse|oat|date|"
                     r"tahini|spice|herb|sesame|ice cream|feed)", re.I)
PRIORITY_FA = {1: "۱ — نانوایی/کیک/بیسکویت/افزودنی (مصرف مستقیم بی‌کربنات)", 2: "۲ — صنایع غذایی/خوراک دام", 3: "۳ — سایر"}


def priority_of(e):
    txt = f"{e['name']} {e['desc']}"
    if any("بیکینگ" in s for s in e["sources"]) or BAKERY_RE.search(txt):
        return 1
    return 2 if FOOD_RE.search(txt) else 3


PLACEHOLDER = re.compile(r"(\d)\1{5,}|1234567|7654321|0123456|9876543|0000000")
OUT_DIR = efl.EXTERNAL_XLSX_DIR
HEAD = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}


def load(slug):
    pr = json.load(open(os.path.join(efl.OUTPUT_DIR, f"{slug}.progress.json"), encoding="utf-8"))
    ve = json.load(open(os.path.join(efl.OUTPUT_DIR, f"{slug}.verified.json"), encoding="utf-8"))
    return pr, ve


def reg(url):
    host = urlparse(url if "//" in url else "//" + url).netloc.lower().removeprefix("www.")
    return vcc.registered_domain(host)


def iraqi_phones(phones):
    """فقط +964، بدون ساختگی، معتبر؛ موبایل (۷xx) اول، بعد tel/whatsapp، بعد متن صفحه."""
    out, seen = [], set()
    for ph in phones:
        e = ph.get("e164", "")
        if not e.startswith("+964") or e in seen or PLACEHOLDER.search(re.sub(r"\D", "", e)[-8:]):
            continue
        try:
            n = phonenumbers.parse(e, None)
            if not phonenumbers.is_valid_number(n):
                continue
            mobile = phonenumbers.number_type(n) in (phonenumbers.PhoneNumberType.MOBILE,
                                                    phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE)
        except Exception:  # noqa: BLE001
            continue
        seen.add(e)
        out.append({**ph, "mobile": mobile})
    out.sort(key=lambda p: (p.get("kind") == "text", not p["mobile"]))
    return out


def alive(url):
    try:
        r = httpx.get(url, timeout=20, follow_redirects=True, trust_env=False, headers=HEAD)
        return r.status_code < 400 or r.status_code in (401, 403)
    except Exception:  # noqa: BLE001
        try:
            r = httpx.get(url, timeout=20, follow_redirects=True, trust_env=True, headers=HEAD, verify=False)
            return r.status_code < 400 or r.status_code in (401, 403)
        except Exception:  # noqa: BLE001
            return False


def build():
    entries = {}  # کلید: دامنه‌ی ثبت‌شده یا نام نرمال
    for slug, label in SOURCES:
        pr, ve = load(slug)
        for k, p in pr.items():
            if p.get("relevant") not in (True, "True", "true"):
                continue
            v = ve.get(k, {})
            if NOT_BUYER_RE.search(p["name"]) or NOT_BUYER_RE.search(v.get("website") or ""):
                continue
            site = v.get("website")
            if v.get("website_status") == "rejected_not_iraqi_entity":
                site = None
            key = reg(site) if site else "n:" + re.sub(r"[^a-z0-9]+", " ", p["name"].lower()).strip()
            ph = iraqi_phones(v.get("phones", []))
            evidence = []
            if slug == "iraq-agrofood":
                evidence.append("کاتالوگ رسمی نمایشگاه (کشور=عراق)")
            if ph:
                evidence.append("شماره‌ی +964 روی سایت")
            if site and urlparse(site).netloc.lower().rsplit(".", 1)[-1] in ("iq", "krd"):
                evidence.append("دامنه‌ی ملی عراق")
            if "روی سایت از Iraq نام برده" in (p.get("region_address") or ""):
                evidence.append("سایت از عراق نام برده")
            e = entries.setdefault(key, {"name": p["name"], "site": site, "sources": [], "evidence": set(), "phones": [],
                                         "emails": [], "type": p.get("company_type"), "fit": p.get("fit"),
                                         "desc": p.get("description", ""), "stand": p.get("stand", ""),
                                         "reasons": [], "base": p.get("country")})
            e["sources"].append(label)
            e["evidence"].update(evidence)
            if not e["site"] and site:
                e["site"] = site
            for x in ph:
                if x["e164"] not in {y["e164"] for y in e["phones"]}:
                    e["phones"].append(x)
            em = v.get("email_best")
            if em and str(v.get("email_confidence", "")).startswith("site") and em not in [x[0] for x in e["emails"]]:
                e["emails"].append((em, v.get("email_source_url") or ""))
            if p.get("fit") == "قوی":
                e["fit"] = "قوی"
            if p.get("needs_review"):
                e["reasons"].append("طبقه‌بندی/تطبیق نام نیاز به نگاه دستی دارد")
            if v.get("website_match") == "medium":
                e["reasons"].append("تطبیق نام سایت ضعیف‌تر")
            if "bp" in slug and (p.get("fit_reason") or ""):
                e["desc"] = (e["desc"] + " | " + p["fit_reason"])[:300]
    return entries


def main():
    entries = build()
    keys = list(entries)
    sites = {k: entries[k]["site"] for k in keys if entries[k]["site"]}
    print(f"{len(entries)} شرکت یکتا؛ چک زنده بودن {len(sites)} سایت …", flush=True)
    with ThreadPoolExecutor(8) as ex:
        alive_map = dict(zip(sites, ex.map(alive, sites.values())))
    domains = {em.split("@")[1].lower() for e in entries.values() for em, _ in e["emails"]}
    dstat = {d: cee.domain_status(d) for d in domains}

    main_rows, other_rows = [], []
    dropped_mail = 0
    for k, e in entries.items():
        mails = []
        for em, src in e["emails"]:
            if dstat.get(em.split("@")[1].lower()) == "dead":
                dropped_mail += 1
                continue
            mails.append((em, src))
        e["mail"] = mails[0] if mails else ("", "")
        e["is_alive"] = alive_map.get(k)
        iraqi = bool(e["evidence"])
        (main_rows if iraqi else other_rows).append(e)

    def sortkey(e):
        bp = any("بیکینگ" in s for s in e["sources"])
        return (priority_of(e), not bp, e["fit"] != "قوی", not e["phones"], not e["mail"][0])
    main_rows.sort(key=sortkey)
    other_rows.sort(key=sortkey)

    wb = openpyxl.Workbook()
    headers = ["ردیف", "نام شرکت", "اولویت (مصرف‌کننده‌ی بی‌کربنات)", "منبع پیدا شدن", "نوع", "ربط", "وب‌سایت", "سایت امروز باز شد؟", "ایمیل (روی سایت شرکت)",
               "صفحه‌ی منبع ایمیل", "تلفن عراقی (بهترین)", "نوع شماره", "تلفن‌های عراقی دیگر", "واتساپ (لینک روی سایت)",
               "شاهد عراقی بودن", "توضیح/نیاز به بررسی", "بخش فعالیت/توضیح", "غرفه"]
    widths = [6, 32, 30, 34, 16, 10, 32, 14, 32, 40, 20, 14, 32, 20, 36, 38, 50, 20]
    type_fa = efl.COMPANY_TYPE_FA

    def fill(ws, rows):
        ws.sheet_view.rightToLeft = True
        ws.append(headers)
        for c in ws[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="305496")
        for i, e in enumerate(rows, 1):
            ph = e["phones"]
            best = ph[0] if ph else None
            wa = next((x for x in ph if x.get("kind") == "whatsapp"), None)
            others = "؛ ".join(x["display"] for x in ph[1:4])
            notes = list(dict.fromkeys(e["reasons"]))
            if e["site"] and e["is_alive"] is False:
                notes.append("سایت امروز باز نشد")
            if not e["site"]:
                notes.append("سایت رسمی تأییدشده پیدا نشد")
            ws.append([i, e["name"], PRIORITY_FA[priority_of(e)], "؛ ".join(dict.fromkeys(e["sources"])), type_fa.get(e["type"], e["type"] or ""),
                       e["fit"] or "", e["site"] or "", "" if not e["site"] else ("بله" if e["is_alive"] else "خیر"),
                       e["mail"][0], e["mail"][1], best["display"] if best else "",
                       ("موبایل" if best and best["mobile"] else "ثابت") if best else "", others,
                       wa["display"] if wa else "", "؛ ".join(sorted(e["evidence"])) or "—", "؛ ".join(notes),
                       (e["desc"] or "")[:300], e["stand"]])
        for idx, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(idx)].width = w
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.freeze_panes = "C2"

    ws1 = wb.active
    ws1.title = "عراق (شاهددار)"
    fill(ws1, main_rows)
    ws2 = wb.create_sheet("خارجی - در جست‌وجوی عراق آمده")
    fill(ws2, other_rows)

    out = os.path.join(OUT_DIR, "Iraq Master (تأییدشده).xlsx")
    tmp = out + ".tmp"
    wb.save(tmp)
    os.replace(tmp, out)

    def cnt(rows, f):
        return sum(1 for e in rows if f(e))
    print(out)
    print(f"برگه‌ی اصلی: {len(main_rows)} شرکت | سایت {cnt(main_rows, lambda e: e['site'])} | سایتِ زنده امروز "
          f"{cnt(main_rows, lambda e: e['is_alive'])} | ایمیل {cnt(main_rows, lambda e: e['mail'][0])} | "
          f"تلفن عراقی {cnt(main_rows, lambda e: e['phones'])} | موبایل {cnt(main_rows, lambda e: e['phones'] and e['phones'][0]['mobile'])} | "
          f"واتساپ {cnt(main_rows, lambda e: any(x.get('kind') == 'whatsapp' for x in e['phones']))}")
    print(f"برگه‌ی خارجی: {len(other_rows)}؛ ایمیل با دامنه‌ی مرده حذف‌شده: {dropped_mail}")


if __name__ == "__main__":
    main()
