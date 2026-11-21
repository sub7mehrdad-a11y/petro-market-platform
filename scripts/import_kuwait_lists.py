"""
ورود لیست شرکت‌های هدف و نمایشگاه‌های کویت (پوشه‌ی «تحلیل بازار کویت»، آبان ۱۴۰۵) به پلتفرم.

شرکت‌ها (لیست_شرکتهای_هدف_کویت.xlsx، برگه‌ی «شرکت‌ها» — ۱۷ شرکت با تماس تأییدشده از سایت رسمی؛ برگه‌ی «سرنخ‌های تأییدنشده» وارد
بانک نمی‌شود چون تماس رسمی ندارد):
  - اگر شرکتی از قبل در بانک بود (هم‌دامنه‌ی وب‌سایت یا ایمیل، یا هم‌نام — در کل بانک، نه فقط کویت) → فیلدهای تماس/پتانسیل به‌روز
    می‌شود؛ اگر ایمیل عوض شد، ایمیل قبلی در email_history می‌ماند.
  - بقیه با شناسه‌ی بعدی اضافه می‌شوند (ایمیل با extract_email تمیز می‌شود). فایل گرید ندارد: گرید از نگاشت صریح GRADE (بر پایه‌ی
    «حوزه فعالیت/توضیحات» هر شرکت در همان فایل) پر می‌شود؛ ناشناخته ← «نامشخص».
نمایشگاه‌ها (لیست_نمایشگاههای_تجاری_کویت.xlsx): کشور از ستون «شهر/کشور» می‌آید؛ نمایشگاهی که هم‌نام و هم‌کشور از قبل بود (مثل Gulfood دبی) دست
  نمی‌خورد، بقیه با شناسه‌ی بعدی اضافه می‌شوند.

اجرا:
    python scripts/import_kuwait_lists.py            # dry-run
    python scripts/import_kuwait_lists.py --apply
"""

import argparse
import datetime
import json
import os
import re
import sys
from urllib.parse import urlparse

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from clean_company_emails import extract_email  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPANIES_FILE = os.path.join(BASE_DIR, "data", "companies.json")
EXHIBITIONS_FILE = os.path.join(BASE_DIR, "data", "exhibitions.json")
SRC_DIR = os.path.join(BASE_DIR, "گزارش")
COMPANIES_XLSX = os.path.join(SRC_DIR, "لیست شرکتها", "لیست_شرکتهای_هدف_کویت.xlsx")
EXHIBITIONS_XLSX = os.path.join(SRC_DIR, "لیست نمایشگاه ها", "لیست_نمایشگاههای_تجاری_کویت.xlsx")
COUNTRY = "کویت"

# گرید هر شرکت بر پایه‌ی «حوزه فعالیت/توضیحات» همان فایل (کلید: دامنه‌ی وب‌سایت)
GRADE = {
    "kuwaitflourmills.com": "خوراکی، دام و طیور", "mezzan.com": "خوراکی", "kspico.com": "دارویی", "kddc.com": "خوراکی، دام و طیور",
    "kdcow.com": "خوراکی", "alkoutprojects.com": "صنعتی", "mawad.com.kw": "صنعتی", "alsharhanind.com": "صنعتی", "alsanea.com": "صنعتی",
    "kuwaitchemicalhouse.com": "صنعتی", "faskkuwait.com": "نامشخص", "b2bfoods.com": "خوراکی", "foodvera.com.kw": "خوراکی",
    "hussain-qaisar.com": "خوراکی", "kuwaiti.tech": "صنعتی", "ficofood.com": "خوراکی", "averroesco.com": "نامشخص",
}


def domain_of(url_or_email):
    t = str(url_or_email or "").strip().lower()
    if "@" in t:
        t = t.split("@", 1)[1]
    t = re.sub(r"^https?://", "", t).split("/")[0]
    return re.sub(r"^www\.", "", t)


def base_name(name):
    """«Gulfood (دورهٔ ۳۱)» → «gulfood»؛ برای تطبیق نام نمایشگاه/شرکت بین فایل‌ها."""
    t = re.sub(r"\(.*?\)", " ", str(name or "")).lower()
    t = re.sub(r"\b(llc|l\.l\.c\.?|fzco|fze|fzc|ltd|co|company|trading|general|international)\b", " ", t)
    return re.sub(r"[^a-z0-9؀-ۿ]+", " ", t).strip()


def norm_grade(text):
    t = (text or "").strip()
    return t.replace("خوراک دام", "دام و طیور") or "نامشخص"


def build_record(row):
    name, activity, city, how, site, email, phone, address, confirm_page, verified_on, notes = (row + (None,) * 11)[:11]
    name = str(name).strip()
    ar = re.search(r"\(([^)]*[؀-ۿ][^)]*)\)", name)
    arabic_name = ar.group(1).strip() if ar else None
    english = re.sub(r"\s*\([^)]*[؀-ۿ][^)]*\)", "", name).strip()
    addr = " — ".join(x for x in (str(city or "").strip(), str(address or "").strip()) if x and "ذکر نشده" not in x)
    verified = verified_on.date().isoformat() if hasattr(verified_on, "date") else str(verified_on or "").strip()
    rec = {
        "country": COUNTRY,
        "english_name": english,
        "industry": str(activity or "").strip() or None,
        "target_grade": GRADE.get(domain_of(site), "نامشخص"),
        "purchasing_potential": str(notes or "").strip() or None,
        "address": addr or None,
        "phone": str(phone).strip() if phone else None,
        "email": extract_email(email)[0],
        "website": str(site).strip() if site else None,
        "source_note": " · ".join(x for x in (
            "لیست شرکت‌های هدف کویت (گزارش آبان ۱۴۰۵)", f"تماس تأییدشده از سایت رسمی ({verified})" if verified else "تماس تأییدشده از سایت رسمی",
            str(how or "").strip(), str(confirm_page or "").strip()) if x),
    }
    if arabic_name:
        rec["arabic_name"] = arabic_name
    return {k: v for k, v in rec.items() if v}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    today = datetime.date.today().isoformat()

    companies = json.load(open(COMPANIES_FILE, encoding="utf-8"))
    next_id = max(int(c["id"].split("-")[1]) for c in companies) + 1
    used_emails = {(extract_email(c.get("email"))[0] or "").lower(): c["id"] for c in companies}
    uae = companies  # تطبیق در کل بانک (هم‌دامنه/هم‌نام)، نه فقط کویت
    by_domain = {}
    by_name = {}
    for c in uae:
        for d in (domain_of(c.get("website")), domain_of(c.get("email"))):
            if d:
                by_domain.setdefault(d, c)
        by_name.setdefault(base_name(c.get("english_name")), c)

    ws = openpyxl.load_workbook(COMPANIES_XLSX, data_only=True)["شرکت‌ها"]
    rows = [tuple(r) for r in ws.iter_rows(min_row=2, values_only=True) if r[0]]
    added, updated, skipped = [], [], []
    for row in rows:
        rec = build_record(row)
        if not rec.get("email"):
            skipped.append((rec["english_name"], "ایمیل نامعتبر"))
            continue
        old = by_domain.get(domain_of(rec.get("website"))) or by_domain.get(domain_of(rec["email"])) or by_name.get(base_name(rec["english_name"]))
        if old:
            changes = []
            for field in ("email", "website", "phone", "address", "purchasing_potential", "industry", "arabic_name"):
                if rec.get(field) and rec[field] != old.get(field):
                    if field == "email":
                        old.setdefault("email_history", []).append({"email": old.get("email"), "reason": "جایگزینی با ایمیل تأییدشده‌ی لیست کویت", "date": today})
                    changes.append(field)
                    old[field] = rec[field]
            if changes:
                old["source_note"] = (old.get("source_note", "") + " · به‌روزرسانی با لیست شرکت‌های هدف کویت (آبان ۱۴۰۵)").strip(" ·")
            updated.append((old["id"], rec["english_name"], changes))
            continue
        owner = used_emails.get(rec["email"].lower())
        if owner:
            skipped.append((rec["english_name"], f"ایمیل قبلاً برای {owner} ثبت است"))
            continue
        rec["id"] = f"company-{next_id}"
        next_id += 1
        used_emails[rec["email"].lower()] = rec["id"]
        added.append(rec)
        companies.append(rec)

    exhibitions = json.load(open(EXHIBITIONS_FILE, encoding="utf-8"))
    ex_by = {(base_name(e["name"]), e["country"]): e for e in exhibitions}
    ex_next = max(int(e["id"].split("-")[1]) for e in exhibitions) + 1
    ws = openpyxl.load_workbook(EXHIBITIONS_XLSX, data_only=True).worksheets[0]
    ex_added, ex_updated = [], []
    for r in list(ws.iter_rows(min_row=2, values_only=True)):
        if not r[0]:
            continue
        name, focus, place, timing, site = (tuple(r) + (None,) * 5)[:5]
        place = str(place or "").strip()
        country = "امارات" if "امارات" in place else COUNTRY
        key = (base_name(name), country)
        old = ex_by.get(key) or next((e for (b, c_), e in ex_by.items() if c_ == country and b and (b in key[0] or key[0] in b) and len(b) >= 6), None)
        if old:
            ex_updated.append((old["id"], old["name"], []))  # از قبل هست؛ دست نمی‌خورد
            continue
        rec = {"country": country, "source_file": os.path.basename(EXHIBITIONS_XLSX), "name": str(name).strip(),
               "focus": str(focus or "").strip(), "location": place, "date": str(timing or "").strip(),
               "id": f"exhibition-{ex_next}"}
        if "تأیید نشده" in rec["date"]:
            rec["date_status"] = "تأییدنشده (از سایت برگزارکننده)"
        if site:
            rec["website"] = str(site).strip()
        ex_next += 1
        ex_added.append(rec)
        exhibitions.append(rec)
        ex_by[(base_name(rec["name"]), country)] = rec

    print(f"شرکت‌ها: ردیف فایل {len(rows)} | جدید {len(added)} | به‌روزشده {len(updated)} | ردشده {len(skipped)}")
    for cid, n, ch in updated:
        print(f"   به‌روز: {cid} {n}: {', '.join(ch) or 'بدون تغییر'}")
    for n, why in skipped:
        print(f"   رد: {n}: {why}")
    for c in added:
        print(f"   جدید: {c['id']} {c['english_name']} — {c.get('email')}")
    print(f"نمایشگاه‌ها: جدید {len(ex_added)} ({[e['name'] for e in ex_added]})")
    for i, n, ch in ex_updated:
        print(f"   به‌روز: {i} {n}: {', '.join(ch) or 'بدون تغییر'}")
    if not args.apply:
        print("\n[dry-run] چیزی نوشته نشد.")
        return
    for path, data in ((COMPANIES_FILE, companies), (EXHIBITIONS_FILE, exhibitions)):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
    print("\n[DONE] نوشته شد.")


if __name__ == "__main__":
    main()
