"""
اعمال اکسل «(تأییدشده)» نمایشگاه (خروجی export_verified_xlsx.py، مثل «Gulfood 2026 (تأییدشده).xlsx») روی
شرکت‌های موجود در بانک (data/companies.json). شرکت‌های جدید را `import_gulfood_companies.py` وارد می‌کند.

تطبیق: نام انگلیسی (norm_name) + کشور (فارسی، با نگاشت country_name_map). فقط شرکت‌هایی که منبعشان همین نمایشگاه است
(source_note شامل --event) لمس می‌شوند.

قواعد (برای هر شرکت تطبیق‌خورده):
  - ایمیل تأییدشده (روی سایت شرکت دیده شده) با ایمیل بانک فرق دارد → بانک ایمیل تأییدشده می‌گیرد؛ قبلی در
    email_history (action: replace) می‌ماند. اگر ایمیل تأییدشده برای شرکت دیگری ثبت است، رد می‌شود.
  - بانک ایمیل ندارد ولی تأییدشده دارد → پر می‌شود.
  - تأییدشده ایمیل ندارد ولی بانک دارد → دست نمی‌خورد («تأییدنشده» ≠ «غلط»؛ حذف فقط برای ایمیل آشغال/دامنه‌ی مرده است
    که قبلاً با apply_email_corrections.py رفته).
  - وب‌سایت و تلفن: فقط اگر بانک نداشت (یا وب‌سایت بانک غیررسمی/حدسی بود) از فایل پر می‌شود.
  - شرکتی که بعداً با لیست دستی (مثل عربستان) به‌روز شده (source_note) دست نمی‌خورد.
  - ایمیلی که قبلاً برایش ارسال رفته (data/email_outreach_sent.json) فقط گزارش می‌شود (خطر ایمیل تکراری به همان شرکت).

اجرا:
    python scripts/apply_verified_exhibitor_xlsx.py "<xlsx>" --event "Gulfood 2026"           # dry-run
    python scripts/apply_verified_exhibitor_xlsx.py "<xlsx>" --event "Gulfood 2026" --apply
"""

import argparse
import datetime
import json
import os
import sys

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from clean_company_emails import extract_email  # noqa: E402
from import_gulfood_companies import COUNTRY_ALIASES, norm_name, official_site  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPANIES_FILE = os.path.join(BASE_DIR, "data", "companies.json")
SENT_FILE = os.path.join(BASE_DIR, "data", "email_outreach_sent.json")
COUNTRY_MAP_FILE = os.path.join(BASE_DIR, "scripts", "country_name_map.json")


def low(e):
    return (e or "").strip().lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("--event", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    today = datetime.date.today().isoformat()

    country_map = {k.lower(): v["fa"] for k, v in json.load(open(COUNTRY_MAP_FILE, encoding="utf-8")).items()}
    country_map.update(COUNTRY_ALIASES)

    ws = openpyxl.load_workbook(args.xlsx, data_only=True).worksheets[0]
    header = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
    rows = [dict(zip(header, r)) for r in ws.iter_rows(min_row=2, values_only=True) if r[1]]
    index = {}
    for r in rows:
        fa = country_map.get(str(r.get("کشور") or "").strip().lower(), str(r.get("کشور") or "").strip())
        index.setdefault((norm_name(r["نام شرکت"]), fa), []).append(r)

    companies = json.load(open(COMPANIES_FILE, encoding="utf-8"))
    owner = {low(extract_email(c.get("email"))[0]): c["id"] for c in companies if extract_email(c.get("email"))[0]}
    sent = {low(s.get("email")) for s in json.load(open(SENT_FILE, encoding="utf-8"))} if os.path.exists(SENT_FILE) else set()

    stat = {"matched": 0, "nomatch": 0, "same": 0, "replaced": 0, "filled": 0, "site_added": 0, "phone_added": 0,
            "unverified_kept": 0, "dup_skipped": 0}
    sent_warn, dup, replaced_list = [], [], []
    for c in companies:
        if args.event not in str(c.get("source_note", "")):
            continue
        if "لیست شرکت‌های هدف عربستان" in str(c.get("source_note", "")):
            stat["protected"] = stat.get("protected", 0) + 1  # تماس تأییدشده‌ی دستی (گزارش عربستان) از اکسل خودکار معتبرتر است
            continue
        cands = index.get((norm_name(c.get("english_name")), c.get("country")))
        if not cands:
            stat["nomatch"] += 1
            continue
        stat["matched"] += 1
        # چند ردیف هم‌نام: ردیفی که ایمیلش با بانک می‌خواند، وگرنه اولین
        r = next((x for x in cands if low(x.get("ایمیل (تأییدشده)")) == low(c.get("email"))), cands[0])
        ve, _ = extract_email(r.get("ایمیل (تأییدشده)"))
        be = low(c.get("email"))
        changed = False

        if not ve:
            if be:
                stat["unverified_kept"] += 1
        elif low(ve) == be:
            stat["same"] += 1
        else:
            o = owner.get(low(ve))
            if o and o != c["id"]:
                stat["dup_skipped"] += 1
                dup.append((c["id"], c.get("english_name"), ve, o))
            else:
                if be and be in sent:
                    sent_warn.append((c["id"], c.get("english_name"), c.get("email"), ve))
                replaced_list.append((c["id"], c.get("english_name"), c.get("email"), ve))
                if args.apply:
                    if c.get("email"):
                        c.setdefault("email_history", []).append({
                            "email": c.get("email"),
                            "reason": f"جایگزینی با ایمیل تأییدشده روی سایت شرکت (اکسل تأییدشده‌ی {args.event})",
                            "date": today, "action": "replace", "replaced_with": ve,
                            "confidence": r.get("اعتبار ایمیل") or None,
                            "source_url": r.get("صفحه‌ی منبع ایمیل") or None,
                        })
                    c["email"] = ve
                    changed = True
                stat["replaced" if be else "filled"] += 1
                owner[low(ve)] = c["id"]

        site = official_site(r.get("وب‌سایت (تأییدشده)"), r.get("وضعیت وب‌سایت"))
        if site and not c.get("website"):
            if args.apply:
                c["website"] = site
                changed = True
            stat["site_added"] += 1
        phone = r.get("تلفن/واتساپ (معتبر)")
        if phone and not c.get("phone"):
            if args.apply:
                c["phone"] = str(phone).strip()
                changed = True
            stat["phone_added"] += 1

    print(f"ردیف فایل: {len(rows)} | شرکت‌های {args.event} در بانک که تطبیق خوردند: {stat['matched']} (بی‌تطبیق: {stat['nomatch']})")
    print(f"  ایمیل یکسان: {stat['same']} | جایگزین‌شده: {stat['replaced']} | پرشده (بانک ایمیل نداشت): {stat['filled']}"
          f" | تأییدنشده و دست‌نخورده: {stat['unverified_kept']} | ردشده (ایمیل شرکت دیگر): {stat['dup_skipped']}")
    if stat.get("protected"):
        print(f"  دست‌نخورده (به‌روزرسانی دستی عربستان): {stat['protected']}")
    print(f"  وب‌سایت اضافه: {stat['site_added']} | تلفن اضافه: {stat['phone_added']}")
    for cid, n, old, new in replaced_list[:200]:
        print(f"    {cid} {n}: {old or '—'} → {new}")
    for cid, n, ve, o in dup:
        print(f"    [رد] {cid} {n}: {ve} قبلاً برای {o}")
    if sent_warn:
        print(f"\n⚠ ایمیل قبلی این {len(sent_warn)} شرکت قبلاً ارسال شده (آدرس جدید «ارسال‌نشده» حساب می‌شود):")
        for cid, n, old, new in sent_warn:
            print(f"    {cid} {n}: {old} → {new}")

    if not args.apply:
        print("\n[dry-run] چیزی نوشته نشد.")
        return
    with open(COMPANIES_FILE, "w", encoding="utf-8") as f:
        json.dump(companies, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("\n[DONE] نوشته شد.")


if __name__ == "__main__":
    main()
