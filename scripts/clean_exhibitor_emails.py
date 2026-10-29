"""
اعتبارسنجی ایمیل‌های استخراج‌شده‌ی یک نمایشگاه (data/exhibition_leads/<slug>.progress.json).

چه چیزی را تأیید می‌کند (و چه چیزی را نه):
  - تأیید می‌کند: ساختار ایمیل درست است، آشغال/placeholder/شناسه‌ی ردیابی (Wix/Sentry...)
    نیست، و دامنه‌اش واقعاً وجود دارد و می‌تواند ایمیل بگیرد (رکورد MX، یا حداقل A).
  - تأیید نمی‌کند: که صندوق مشخص (مثلاً info@) واقعاً وجود دارد. این فقط با فرستادن
    ایمیل واقعی یا probe کردن SMTP ممکن است (پورت ۲۵ معمولاً بسته/غیرقابل‌اعتماد است و
    سرورها probe را بلاک می‌کنند) — عمداً انجام نمی‌شود.

ایمیل‌های ردشده در فیلد email_rejected (با دلیل) ذخیره می‌شوند، فیلد email خالی می‌شود، و
contact_checked=False می‌شود تا اجرای بعدی استخراج‌گر (که حالا آشغال را فیلتر و ایمیل
هم‌دامنه با سایت را اول رتبه می‌دهد) دوباره تلاش کند.

استفاده:  python scripts/clean_exhibitor_emails.py <slug> [--dry-run]
نیاز: pip install dnspython
"""

import os
import re
import sys
import argparse
from concurrent.futures import ThreadPoolExecutor

import dns.resolver

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SYNTAX_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$")

_resolver = dns.resolver.Resolver(configure=False)
_resolver.nameservers = ["8.8.8.8", "1.1.1.1"]  # DNS محلی در ایران قابل‌اعتماد نیست
_resolver.timeout = 4
_resolver.lifetime = 8
_cache: dict[str, str] = {}


_NAMESERVERS = ["8.8.8.8", "1.1.1.1", "9.9.9.9"]


def _query(domain: str, ns: str) -> str:
    """mx | a | nx | none | err — برای یک resolver مشخص"""
    r = dns.resolver.Resolver(configure=False)
    r.nameservers = [ns]
    r.timeout, r.lifetime = 4, 7
    try:
        r.resolve(domain, "MX")
        return "mx"
    except dns.resolver.NXDOMAIN:
        return "nx"
    except dns.resolver.NoAnswer:
        pass
    except Exception:  # noqa: BLE001
        return "err"
    for rtype in ("A", "AAAA"):
        try:
            r.resolve(domain, rtype)
            return "a"
        except dns.resolver.NXDOMAIN:
            return "nx"
        except dns.resolver.NoAnswer:
            continue
        except Exception:  # noqa: BLE001
            return "err"
    return "none"


def domain_status(domain: str) -> str:
    """
    mx | a_only | dead | unknown

    ۲۰۲۶-۱۰-۲۳: یک اجرای اولیه با فقط یک resolver، دامنه‌ی zhelen.ru (که واقعاً وجود
    دارد) را «مرده» اعلام کرد. حالا «مرده» فقط وقتی گفته می‌شود که حداقل دو resolver
    مستقل NXDOMAIN بدهند و هیچ‌کدام جواب مثبت (MX/A) ندهند؛ timeout یعنی «نامطمئن».
    """
    domain = domain.lower()
    if domain in _cache:
        return _cache[domain]
    answers = [_query(domain, ns) for ns in _NAMESERVERS]
    if "mx" in answers:
        status = "mx"
    elif "a" in answers:
        status = "a_only"
    elif answers.count("nx") >= 2:
        status = "dead"
    else:
        status = "unknown"
    _cache[domain] = status
    return status


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("slug")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    path = os.path.join(efl.OUTPUT_DIR, f"{args.slug}.progress.json")
    progress = efl.load_progress(path)
    recs = [(k, v) for k, v in progress.items() if v.get("relevant") and v.get("email")]
    print(f"{len(recs)} ایمیل برای بررسی")

    domains = sorted({v["email"].strip().rsplit("@", 1)[-1].lower() for _, v in recs if "@" in v["email"]})
    with ThreadPoolExecutor(30) as ex:
        list(ex.map(domain_status, domains))

    rejected, stats = 0, {"mx": 0, "a_only": 0, "unknown": 0}
    reasons: dict[str, int] = {}
    for k, v in recs:
        e = v["email"].strip()
        reason = None
        if not SYNTAX_RE.match(e):
            reason = "ساختار نامعتبر"
        elif efl.is_junk_email(e):
            reason = "آشغال/placeholder/شناسه‌ی ردیابی"
        else:
            st = domain_status(e.rsplit("@", 1)[-1])
            if st == "dead":
                reason = "دامنه وجود ندارد یا ایمیل نمی‌گیرد"
            else:
                v["email_status"] = st
                stats[st] += 1
        if reason:
            rejected += 1
            reasons[reason] = reasons.get(reason, 0) + 1
            if not args.dry_run:
                v.setdefault("email_rejected", []).append({"email": e, "reason": reason})
                v["email"] = ""
                v.pop("email_status", None)
                v["contact_checked"] = False  # استخراج‌گر اصلاح‌شده دوباره تلاش کند
            print(f"  [رد] {v.get('name', '')[:40]} | {e[:60]} | {reason}")

    print(f"\nبعد از بررسی: {len(recs) - rejected} ایمیل سالم (MX={stats['mx']}، فقط A={stats['a_only']}، "
          f"DNS نامطمئن={stats['unknown']}) — {rejected} رد شد {reasons}")
    if not args.dry_run:
        efl.save_progress(path, progress)
        print("progress ذخیره شد؛ استخراج‌گر را دوباره اجرا کن تا شرکت‌های بدون ایمیل دوباره امتحان شوند.")


if __name__ == "__main__":
    main()
