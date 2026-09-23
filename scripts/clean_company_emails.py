"""
سیستم استخراج/پاک‌سازی ایمیل شرکت‌ها (data/companies.json).

چرا: فیلد email این فایل دستی/از منابع مختلف پر شده و شلخته‌ست — مقدارهای
جای‌گزین مثل «ثبت نشده»/«—»، چند ایمیل چسبیده به هم با فاصله یا «/» یا خط
جدید، فاصله‌ی اضافه دور «@»، یا یادداشت فارسی چسبیده داخل پرانتز. صفحه‌ی
ایمیل معرفی (/outreach) فقط truthy چک می‌کنه، نه فرمت — یعنی این مقدارها
بدون فیلتر وارد لیست ارسال می‌شن و موقع ارسال واقعی با خطا برمی‌گردن.

extract_email() یک تابع مستقل و قابل‌استفاده‌ی مجدد است — در ایمپورت‌های
بعدی شرکت (مثل کاری که برای نمایشگاه قزاقستان شد) هم باید صدا زده بشه تا
داده‌ی جدید از همون ابتدا تمیز وارد companies.json بشه.

اجرا:
    python3 scripts/clean_company_emails.py            # dry-run — فقط گزارش
    python3 scripts/clean_company_emails.py --apply     # واقعاً می‌نویسه
"""

import json
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPANIES_FILE = os.path.join(BASE_DIR, "data", "companies.json")

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
SEPARATOR_RE = re.compile(r"[()\[\]/\\,;\-–—]+")

# اگه متن خام حاوی یکی از این عبارت‌های رد/نقض باشه، یعنی نویسنده‌ی تحقیق
# صراحتاً گفته این ایمیل معتبر نیست (مال شرکت دیگه‌ست، قدیمیه، اشتباه بوده...)
# — حتی اگه یک آدرس معتبر توی متن پیدا بشه، نباید به‌عنوان ایمیل اصلی
# استخراج بشه. نمونه‌ی واقعی: company-290 («ایمیل قبلی ... متعلق به شرکت
# دیگری بود»). این چک عمداً محافظه‌کارانه‌ست: کل رکورد رو null می‌کنه به‌جای
# حدس زدن کدوم بخش از متن قابل‌اعتماده.
REJECTION_MARKERS = ["متعلق به شرکت دیگری", "ایمیل قبلی", "دیگر معتبر نیست", "اشتباه بود", "غلط بود"]


def extract_email(raw):
    """
    از یک مقدار خام و احتمالاً شلخته، یک آدرس ایمیل اصلی معتبر استخراج می‌کنه.

    برمی‌گردونه: (email یا None, note یا None)

    - مقدارهای جای‌گزین بدون ایمیل واقعی («ثبت نشده»، «—»، «نامشخص...») →
      email=None؛ اگه متن توضیحی مفیدی داشته باشه (بیشتر از چند حرف)، به‌عنوان
      note نگه داشته می‌شه تا زمینه‌ی تحقیق از دست نره.
    - فاصله‌ی اضافه دور @ («user @ domain.com») نرمال می‌شه.
    - چند ایمیل با فاصله/اسلش/خط‌جدید از هم جدا → اولی به‌عنوان ایمیل اصلی
      انتخاب می‌شه (تصمیم صریح کاربر: سادگی مهم‌تر از نگه‌داشتن همه‌ست).
    - یادداشت چسبیده داخل پرانتز («email (تأیید شد)») از خودِ ایمیل جدا و
      به‌عنوان note نگه داشته می‌شه.
    """
    if not raw or not str(raw).strip():
        return None, None

    text = str(raw).strip()

    if any(marker in text for marker in REJECTION_MARKERS):
        return None, text

    normalized = re.sub(r"\s*@\s*", "@", text)
    matches = EMAIL_RE.findall(normalized)
    primary = matches[0].rstrip(".,;:") if matches else None

    leftover = normalized
    for m in matches:
        leftover = leftover.replace(m, " ")
    leftover = SEPARATOR_RE.sub(" ", leftover)
    leftover = re.sub(r"\s+", " ", leftover).strip()

    note = leftover if len(leftover) > 3 else None
    return primary, note


def clean_companies(companies):
    """
    روی لیست شرکت‌ها extract_email رو اجرا می‌کنه؛ فقط رکوردهایی که واقعاً
    تغییر می‌کنن (ایمیل یا note جدید) رو گزارش می‌ده. لیست را جای‌گزین می‌کنه.
    """
    changes = []
    for c in companies:
        old_email = c.get("email")
        old_note = c.get("email_note")
        new_email, new_note = extract_email(old_email)

        email_changed = (new_email or None) != (old_email or None)
        note_changed = (new_note or None) != (old_note or None)
        if not email_changed and not note_changed:
            continue

        changes.append(
            {
                "id": c.get("id"),
                "name": c.get("english_name"),
                "old_email": old_email,
                "new_email": new_email,
                "note": new_note,
            }
        )
        c["email"] = new_email
        if new_note:
            c["email_note"] = new_note
        elif "email_note" in c:
            del c["email_note"]

    return changes


def main():
    apply_changes = "--apply" in sys.argv

    with open(COMPANIES_FILE, "r", encoding="utf-8") as f:
        companies = json.load(f)

    changes = clean_companies(companies)

    report_lines = [f"{len(changes)} رکورد تغییر کرد از {len(companies)} کل:", ""]
    for ch in changes:
        note_part = f"  |  note: {ch['note']}" if ch["note"] else ""
        report_lines.append(f"{ch['id']} ({ch['name']}): {ch['old_email']!r} -> {ch['new_email']!r}{note_part}")

    report = "\n".join(report_lines)
    report_path = os.path.join(BASE_DIR, "scripts", "_email_clean_report.txt")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)

    if apply_changes:
        with open(COMPANIES_FILE, "w", encoding="utf-8") as f:
            json.dump(companies, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"APPLIED: {len(changes)} records updated. Report: {report_path}")
    else:
        print(f"DRY RUN: {len(changes)} records would change. Report: {report_path}")


if __name__ == "__main__":
    main()
