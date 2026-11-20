"""
تلاش دوباره برای پیدا کردن سایت رسمی غرفه‌داران عراقی که سایتشان پیدا نشد (یا سایتِ نهاد غیرعراقی رد شد).

پرسش‌های جداگانه با شهر/ایالت عراق (Iraq/Erbil/Baghdad/Kurdistan)، و پذیرش کاندیدا فقط اگر هم نام روی صفحه بخواند
(verify_company) و هم شاهد عراقی داشته باشد: شماره‌ی +964، دامنه‌ی .iq/.krd، (ذکر نام عراق روی صفحه کافی نیست).

استفاده:  python scripts/iraq_retry_sites.py
نتیجه در data/exhibition_leads/iraq-agrofood.verified.raw.json نوشته می‌شود؛ بعدش
python scripts/iraq_agrofood_finder.py --stage export  (و python scripts/iraq_master.py)
"""

import json
import os
import re
import sys
from urllib.parse import urlparse

import httpx

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402
import verify_company_contacts as vcc  # noqa: E402
import buyer_discovery as bd  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SLUG = "iraq-agrofood"
IRAQ_RE = re.compile(r"(iraq|erbil|baghdad|kurdistan|basra|sulaym|duhok|mosul|kirkuk|najaf|karbala|العراق|أربيل|اربيل|بغداد|كردستان|البصرة)", re.I)


def candidates(client, name):
    out = []
    for q in (f"{name} Iraq", f"{name} Erbil Kurdistan", f"{name} Baghdad Iraq company", f"{name} factory Iraq official website"):
        for u in vcc._yahoo_results(client, q):
            dom = urlparse(u).netloc.lower().removeprefix("www.")
            if bd.is_directory(u) or bd.EXTRA_DIRECTORY_RE.search(dom):
                continue
            root = f"{urlparse(u).scheme}://{urlparse(u).netloc}"
            if root not in out:
                out.append(root)
        if len(out) >= 6:
            break
    return out[:6]


def main():
    raw = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.verified.raw.json")
    ver = json.load(open(raw, encoding="utf-8"))            # خام (قبل از sanitize) — نتیجه این‌جا نوشته می‌شود
    cur = json.load(open(os.path.join(efl.OUTPUT_DIR, f"{SLUG}.verified.json"), encoding="utf-8"))  # بعد از sanitize
    prog = json.load(open(os.path.join(efl.OUTPUT_DIR, f"{SLUG}.progress.json"), encoding="utf-8"))
    todo = [k for k, v in cur.items() if (not v.get("website") or v.get("website_status") == "rejected_not_iraqi_entity")
            and str(prog.get(k, {}).get("relevant")) in ("True", "true")]
    print(f"{len(todo)} شرکت بدون سایت قابل‌قبول")
    fetcher = vcc.Fetcher()
    client = httpx.Client(trust_env=True, follow_redirects=True)
    fixed = 0
    for k in todo:
        name = prog[k]["name"]
        bad_dom = {urlparse(ver[k]["website"]).netloc.lower().removeprefix("www.")} if ver[k].get("website") else set()
        found = None
        for cand in candidates(client, name):
            if urlparse(cand).netloc.lower().removeprefix("www.") in bad_dom:
                continue
            rec = {"name": name, "country": "Iraq", "website": cand, "website_official": False}
            try:
                res = vcc.verify_company(rec, fetcher, client)
            except Exception as e:  # noqa: BLE001
                print("   خطا:", cand, type(e).__name__)
                continue
            if not res.get("website"):
                continue
            host = urlparse(res["website"]).netloc.lower()
            ev = (any(str(p.get("e164", "")).startswith("+964") for p in res.get("phones", []))
                  or host.rsplit(".", 1)[-1] in ("iq", "krd"))   # فقط شاهد قوی؛ ذکر نام «Iraq» روی صفحه کافی نیست (سینمای عراق/Zain اردن را می‌پذیرفت)
            if ev:
                found = res
                break
            print(f"   رد شد (شاهد عراقی ندارد): {name} → {res['website']}")
        if found:
            found["checked_at"] = __import__("time").strftime("%Y-%m-%d")
            found["notes"] = found.get("notes", []) + ["سایت با تلاش دوم (پرسش‌های عراق/اربیل/بغداد) پیدا و با شاهد عراقی تأیید شد"]
            ver[k] = found
            fixed += 1
            print(f"  ✔ {name} → {found['website']} | ایمیل {found.get('email_best')} | تلفن {found.get('phone_best')}")
        else:
            print(f"  ✘ {name}: سایت عراقی تأییدشده پیدا نشد")
        efl.atomic_write_json(raw, ver)
    print(f"[DONE] {fixed} از {len(todo)} پیدا شد")


if __name__ == "__main__":
    main()
