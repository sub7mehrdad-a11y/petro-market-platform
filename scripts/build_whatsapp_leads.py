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

    rows.sort(key=lambda r: (r["country_en"], r["name"].lower()))
    OUT.write_text(json.dumps({"generated": "auto", "count": len(rows), "rows": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    matched = sum(1 for r in rows if r["company_id"])
    print(f"{len(rows)} شرکت با لینک واتساپ روی سایت خودشان؛ {matched} تا در companies.json هم هستند → {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
