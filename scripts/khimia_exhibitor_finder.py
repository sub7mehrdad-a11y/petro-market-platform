"""
غرفه‌داران KHIMIA 2026 (نمایشگاه شیمی مسکو، ۹–۱۲ نوامبر) از
https://www.chemistry-expo.ru/en/exhibition/exhibitors/

ساختار سایت: یک جدول HTML ثابت (DataTables سمت کلاینت، `#example`) با ستون‌های
Company / Country / Hall / Stand — همه‌ی ردیف‌ها در HTML اولیه‌اند (بدون صفحه‌بندی/AJAX) و
هیچ لینک پروفایل، وب‌سایت، ایمیل یا توضیحی ندارند. پس این اسکریپت فقط اسم/کشور/سالن/غرفه را
می‌گیرد؛ وب‌سایت و تماس باید از بیرون پیدا و صحت‌سنجی شوند (scripts/verify_company_contacts.py).

خروجی: data/exhibition_leads/khimia-2026.raw.json (لیست خام) و .progress.json (قالب مشترک با
بقیه‌ی اسکریپت‌ها؛ relevant هنوز تعیین نشده).
"""

import os
import re
import sys
import json

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402

URL = "https://www.chemistry-expo.ru/en/exhibition/exhibitors/"
SLUG = "khimia-2026"
HEADERS = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")}


def fetch_rows() -> list[dict]:
    # مثل ingred.ru، از پراکسی محلی عبور نمی‌دیم (سایت روسی؛ مستقیم باز می‌شه)
    r = httpx.get(URL, headers=HEADERS, timeout=60, follow_redirects=True, trust_env=False)
    r.raise_for_status()
    table = BeautifulSoup(r.text, "html.parser").find(id="example")
    if table is None:
        raise RuntimeError("جدول #example پیدا نشد؛ ساختار سایت عوض شده؟")
    out = []
    for tr in table.find("tbody").find_all("tr"):
        tds = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
        if len(tds) != 4 or not tds[0]:
            continue
        name, country, hall, stand = tds
        out.append({"name": name, "country": country.title(), "hall": hall.strip("«»"), "stand": stand})
    return out


def main():
    rows = fetch_rows()
    seen, uniq = set(), []
    for r in rows:
        k = (re.sub(r"\W+", "", r["name"].lower()), r["country"].lower())
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    os.makedirs(efl.OUTPUT_DIR, exist_ok=True)
    efl.atomic_write_json(os.path.join(efl.OUTPUT_DIR, f"{SLUG}.raw.json"), uniq)
    print(f"{len(rows)} ردیف، {len(uniq)} شرکت یکتا")
    from collections import Counter
    print(Counter(r["country"] for r in uniq).most_common(10))


if __name__ == "__main__":
    main()
