"""
اعمال فایل «اصلاحیه‌ی ایمیل» (مثل platform_email_corrections.json، خروجی verify_company_contacts.py یا
fix_bounced_emails.py) روی بانک شرکت‌ها (data/companies.json).

هر ردیف: {id, name, wrong_email, action: remove|replace|review, new_email, confidence, phone, verified_website, ...}
  - remove : ایمیل غلط حذف می‌شود (شرکت می‌ماند، فقط بدون ایمیل → ایمیل معرفی برایش نمی‌رود).
  - replace: ایمیل غلط با new_email عوض می‌شود؛ اگر شرکت تلفن/وب‌سایت نداشت و فایل داشت، پر می‌شود.
  - review : ایمیل غلط حذف می‌شود ولی ایمیل پیشنهادی فقط در email_history (suggested_email) ثبت می‌شود، نه جایگزین.

ایمنی:
  - فقط وقتی اعمال می‌شود که ایمیل فعلیِ شرکت هنوز همان wrong_email باشد (کسی بین‌راه عوضش نکرده باشد).
  - new_email باید با extract_email (clean_company_emails.py) معتبر باشد و برای شرکت دیگری ثبت نشده باشد.
  - ایمیل قدیمی در فیلد email_history (با دلیل و تاریخ) نگه داشته می‌شود؛ هیچ‌چیز بی‌ردپا پاک نمی‌شود.
  - بدون --apply فقط گزارش (dry-run).

اجرا:
    python scripts/apply_email_corrections.py "<مسیر>/platform_email_corrections.json"            # dry-run
    python scripts/apply_email_corrections.py "<مسیر>/platform_email_corrections.json" --apply
    python scripts/apply_email_corrections.py <file> --only-actions replace      # فقط جایگزینی‌ها
"""

import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from clean_company_emails import extract_email  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPANIES_FILE = os.path.join(BASE_DIR, "data", "companies.json")


def norm(e):
    return (e or "").strip().lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("corrections")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--only-actions", default="remove,replace", help="جداشده با ویرگول؛ پیش‌فرض remove,replace")
    ap.add_argument("--companies", default=COMPANIES_FILE)
    args = ap.parse_args()
    allowed = {a.strip() for a in args.only_actions.split(",") if a.strip()}

    corrections = json.load(open(args.corrections, encoding="utf-8"))
    companies = json.load(open(args.companies, encoding="utf-8"))
    by_id = {c["id"]: c for c in companies}
    today = datetime.date.today().isoformat()

    used_emails = {norm(extract_email(c.get("email"))[0]): c["id"] for c in companies if extract_email(c.get("email"))[0]}

    stats = {"removed": 0, "replaced": 0, "phone_added": 0, "website_added": 0}
    skipped, review = [], []
    for r in corrections:
        action = r.get("action")
        c = by_id.get(r.get("id"))
        if action == "review":
            # ایمیل غلط (آشغال/دامنه‌ی ناموجود) در هر صورت غلط است و نباید در بانک بماند (وگرنه ایمیل معرفی به آن می‌رود)؛
            # ولی ایمیل پیشنهادی هنوز تأیید انسانی می‌خواهد → فقط در تاریخچه (suggested_email) ثبت می‌شود، جایگزین نمی‌شود.
            review.append(r)
            if c and norm(c.get("email")) == norm(r.get("wrong_email")):
                if args.apply:
                    del c["email"]
                    c.setdefault("email_history", []).append({
                        "email": r.get("wrong_email"), "reason": r.get("wrong_reason") or "اصلاحیه", "date": today,
                        "action": "remove", "suggested_email": r.get("new_email"), "needs_human_review": True,
                        "note": r.get("note") or None,
                    })
                stats["removed_review"] = stats.get("removed_review", 0) + 1
            continue
        if action not in allowed:
            skipped.append((r.get("id"), r.get("name"), f"اکشن {action} در --only-actions نیست"))
            continue
        if not c:
            skipped.append((r.get("id"), r.get("name"), "شرکت در بانک نیست"))
            continue
        if norm(c.get("email")) != norm(r.get("wrong_email")):
            skipped.append((c["id"], c.get("english_name"), f"ایمیل فعلی ({c.get('email')}) دیگر همان ایمیل غلط ({r.get('wrong_email')}) نیست"))
            continue

        history_item = {
            "email": c.get("email"),
            "reason": r.get("wrong_reason") or r.get("reason") or "اصلاحیه",
            "date": today,
            "action": action,
        }
        if action == "remove":
            if args.apply:
                del c["email"]
                c.setdefault("email_history", []).append(history_item)
            stats["removed"] += 1
            continue

        # replace
        new_email, why = extract_email(r.get("new_email"))
        if not new_email:
            skipped.append((c["id"], c.get("english_name"), f"new_email نامعتبر ({r.get('new_email')}: {why})"))
            continue
        owner = used_emails.get(norm(new_email))
        if owner and owner != c["id"]:
            skipped.append((c["id"], c.get("english_name"), f"new_email قبلاً برای {owner} ثبت است"))
            continue
        history_item["replaced_with"] = new_email
        history_item["confidence"] = r.get("confidence") or None
        history_item["source_url"] = r.get("email_source_url") or None
        if args.apply:
            c["email"] = new_email
            c.setdefault("email_history", []).append(history_item)
            if r.get("phone") and not c.get("phone"):
                c["phone"] = r["phone"]
                stats["phone_added"] += 1
            if r.get("verified_website") and not c.get("website"):
                c["website"] = r["verified_website"]
                stats["website_added"] += 1
        else:
            if r.get("phone") and not c.get("phone"):
                stats["phone_added"] += 1
            if r.get("verified_website") and not c.get("website"):
                stats["website_added"] += 1
        used_emails[norm(new_email)] = c["id"]
        stats["replaced"] += 1

    print(f"ردیف‌های اصلاحیه: {len(corrections)}")
    print(f"  حذف ایمیل غلط: {stats['removed']}  | جایگزینی: {stats['replaced']}  | تلفن اضافه: {stats['phone_added']}  | وب‌سایت اضافه: {stats['website_added']}")
    print(f"  نیازمند بررسی انسانی: {len(review)} (ایمیل غلطشان حذف می‌شود: {stats.get('removed_review', 0)}؛ ایمیل پیشنهادی جایگزین نمی‌شود)")
    for r in review:
        print(f"    - {r.get('id')} {r.get('name')} ({r.get('country')}): {r.get('wrong_email')} → {r.get('new_email') or '—'}  [{r.get('note') or r.get('wrong_reason')}]")
    print(f"  ردشده (اعمال نشد): {len(skipped)}")
    for cid, name, why in skipped:
        print(f"    - {cid} {name}: {why}")

    if not args.apply:
        print("\n[dry-run] چیزی نوشته نشد. با --apply واقعاً اعمال می‌شود.")
        return
    with open(args.companies, "w", encoding="utf-8") as f:
        json.dump(companies, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\n[DONE] {args.companies} به‌روز شد.")


if __name__ == "__main__":
    main()
