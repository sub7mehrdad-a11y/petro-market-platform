"""ساخت فهرست «واتساپ تأییدشده» برای صفحه‌ی ایمیل معرفی → data/whatsapp_leads.json

«تأییدشده» یعنی خودِ سایت رسمی شرکت لینک واتساپ (wa.me / api.whatsapp.com) گذاشته؛ «ثبت‌بودن شماره در واتساپ»
چک نشده (از بیرون ممکن نیست). منبع: data/exhibition_leads/*.verified.json (خروجی verify_company_contacts.py).

هر شرکت یک ردیف؛ شماره‌ی تکراری (چند شرکتِ هم‌گروه) فقط یک‌بار می‌آید و بقیه در `same_number_as` ثبت می‌شوند.
اگر شرکت در data/companies.json هم هست (هم‌دامنه)، شناسه/گرید/صنعت/کشور فارسی‌اش اضافه می‌شود.

اجرا:  python scripts/build_whatsapp_leads.py
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
LEADS = ROOT / "data" / "exhibition_leads"
OUT = ROOT / "data" / "whatsapp_leads.json"

EXHIBITIONS = {
    "gulfood-2026": "Gulfood 2026",
    "indusfood-2026": "IndusFood 2026",
    "khimia-2026": "KHIMIA 2026",
    "global-ingredients-show-2026": "Global Ingredients Show 2026",
}


def domain(url: str | None) -> str | None:
    if not url:
        return None
    host = urlparse(url if "//" in url else "http://" + url).netloc.lower()
    host = re.sub(r"^www\.", "", host)
    return host or None


def add_iraqi_rows(rows: list[dict], seen: dict[str, dict], by_domain: dict[str, dict]) -> int:
    """شرکت‌های فهرست «Iraq Master» (فقط با شاهد عراقی‌بودن) که شماره‌ی +964 معتبر دارند.

    wa_basis: site_link = خودِ سایت لینک واتساپ گذاشته | mobile_unverified = فقط موبایل عراقی معتبر روی سایت؛
    ثبت‌بودن در واتساپ تأیید نشده (کاربر در پنل می‌بیند). فقط موبایل، نه تلفن ثابت.
    priority: ۱ نانوایی/کیک/بیسکویت/افزودنی/بیکینگ‌پودر، ۲ صنایع غذایی/دام، ۳ سایر.
    """
    sys.path.insert(0, str(ROOT / "scripts"))
    try:
        import iraq_master as im  # noqa: PLC0415
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] ردیف‌های عراقی اضافه نشد: {type(e).__name__}: {e}")
        return 0
    added = 0
    for e in im.build().values():
        if not e["evidence"]:
            continue
        phones = e["phones"]
        wa = next((p for p in phones if p.get("kind") == "whatsapp"), None)
        ph, basis = (wa, "site_link") if wa else (next((p for p in phones if p.get("mobile")), None), "mobile_unverified")
        if not ph:
            continue
        e164, name = ph["e164"], e["name"].strip()
        if e164 in seen:
            seen[e164].setdefault("same_number_as", []).append(name)
            continue
        pr = im.priority_of(e)
        txt = f"{e['name']} {e['desc']}"
        grade = "Feed" if re.search(r"feed", txt, re.I) else ("Food" if pr <= 2 else "")
        m = by_domain.get(domain(e["site"]) or "")
        row = {
            "id": "wa-" + hashlib.sha1(e164.encode()).hexdigest()[:10],
            "name": name,
            "country_en": "Iraq",
            "website": e["site"],
            "wa_e164": e164,
            "wa_display": ph.get("display") or e164,
            "wa_source_url": ph.get("source_url") or e["site"],
            "exhibition": "عراق: " + "؛ ".join(dict.fromkeys(e["sources"]))[:60],
            "match": "medium" if any("ضعیف" in r for r in e["reasons"]) else "strong",
            "email": (e["emails"][0][0] if e["emails"] else None) or (m or {}).get("email"),
            "company_id": (m or {}).get("id"),
            "target_grade": grade or (m or {}).get("target_grade"),
            "industry": (m or {}).get("industry"),
            "country": (m or {}).get("country") or "عراق",
            "wa_basis": basis,
            "priority": pr,
        }
        rows.append(row)
        seen[e164] = row
        added += 1
    return added


def main() -> int:
    companies = json.loads((ROOT / "data" / "companies.json").read_text(encoding="utf-8"))
    by_domain: dict[str, dict] = {}
    for c in companies:
        d = domain(c.get("website"))
        if d and d not in by_domain:
            by_domain[d] = c

    rows: list[dict] = []
    seen: dict[str, dict] = {}
    for stem, label in EXHIBITIONS.items():
        data = json.loads((LEADS / f"{stem}.verified.json").read_text(encoding="utf-8"))
        for _, v in data.items():
            wa = next((p for p in v.get("phones", []) if p.get("kind") == "whatsapp" and p.get("e164")), None)
            if not wa:
                continue
            e164 = wa["e164"]
            name = (v.get("name") or "").strip()
            if e164 in seen:
                seen[e164].setdefault("same_number_as", []).append(name)
                continue
            m = by_domain.get(domain(v.get("website")) or "")
            row = {
                "id": "wa-" + hashlib.sha1(e164.encode()).hexdigest()[:10],
                "name": name,
                "country_en": v.get("country") or "",
                "website": v.get("website"),
                "wa_e164": e164,
                "wa_display": wa.get("display") or e164,
                "wa_source_url": wa.get("source_url") or v.get("website"),
                "exhibition": label,
                "match": v.get("website_match"),  # official | strong | medium
                "email": v.get("email_best") or (m or {}).get("email"),
                "company_id": (m or {}).get("id"),
                "target_grade": (m or {}).get("target_grade"),
                "industry": (m or {}).get("industry"),
                "country": (m or {}).get("country"),
            }
            rows.append(row)
            seen[e164] = row

    n_iraq = add_iraqi_rows(rows, seen, by_domain)

    rows.sort(key=lambda r: (r["country_en"], r.get("priority", 9), r["name"].lower()))
    OUT.write_text(json.dumps({"generated": "auto", "count": len(rows), "rows": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    matched = sum(1 for r in rows if r["company_id"])
    by_basis = {b: sum(1 for r in rows if r.get("wa_basis", "site_link") == b) for b in ("site_link", "mobile_unverified")}
    print(f"{len(rows)} شرکت ({by_basis['site_link']} لینک واتساپ روی سایت خودشان، {by_basis['mobile_unverified']} موبایل بدون تأیید واتساپ؛ "
          f"{n_iraq} ردیف عراقی)؛ {matched} تا در companies.json هم هستند → {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
