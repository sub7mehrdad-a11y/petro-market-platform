"""
جمعیت کشورها از World Bank Open Data API (رایگان، بدون کلید) — برای برآورد
«بازار مصرف تخمینی» هر کشور (جمعیت × مصرف سرانه‌ی جهانی، در web/lib/data.js).

چرا World Bank (نه REST Countries که قبلاً امتحان شد): نسخه‌ی رایگان
restcountries.com منسوخ شده و به کلید/نسخه‌ی جدید نیاز داره؛ World Bank API
کاملاً باز و پایداره و مستقیم «آخرین سال موجود» رو با mrv=1 می‌ده.

دو فراخوانی لازمه، نه یکی:
  - /v2/country                              → متادیتای کشور (iso2Code, region)
    فقط این یکی مشخص می‌کنه کدام ردیف واقعاً یک کشوره، نه تجمیع منطقه‌ای
    (مثل «Arab World» یا «High income») — endpoint شاخص این تفکیک رو نداره.
  - /v2/country/all/indicator/SP.POP.TOTL؟mrv=1  → جمعیت، آخرین سال موجود هر کشور

دو تا رو با کد سه‌حرفی ISO (iso3) به هم وصل می‌کنیم، بعد iso2Code رو به نام
فارسی استاندارد سایت (از country_name_map.json، همون منبع مشترک بقیه‌ی
ingest ها) نگاشت می‌کنیم.
"""

import os
import json
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
NAME_MAP_FILE = os.path.join(os.path.dirname(__file__), "country_name_map.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "country_population.json")

COUNTRY_LIST_URL = "https://api.worldbank.org/v2/country?format=json&per_page=400"
POP_URL = "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?mrv=1&format=json&per_page=400"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    with open(NAME_MAP_FILE, "r", encoding="utf-8") as f:
        name_map = json.load(f)
    # iso2 (کوچک) -> نام فارسی، برای نگاشت معکوس
    iso2_to_fa = {info["iso2"]: info["fa"] for info in name_map.values() if info.get("iso2")}

    print("[INFO] گرفتن فهرست کشورها از World Bank ...")
    _meta, countries = fetch_json(COUNTRY_LIST_URL)
    real_countries = {c["id"]: c for c in countries if c["region"]["value"] != "Aggregates"}
    print(f"[OK] {len(real_countries)} کشور واقعی (غیر از تجمیع‌های منطقه‌ای).")

    print("[INFO] گرفتن آمار جمعیت (آخرین سال موجود هر کشور) ...")
    _meta2, pop_rows = fetch_json(POP_URL)

    result = {}
    unmapped = []
    for row in pop_rows:
        iso3 = row.get("countryiso3code")
        if not iso3 or iso3 not in real_countries or row.get("value") is None:
            continue
        iso2 = real_countries[iso3]["iso2Code"].lower()
        fa = iso2_to_fa.get(iso2)
        if not fa:
            unmapped.append((real_countries[iso3]["name"], iso2))
            continue
        result[fa] = {"population": row["value"], "year": int(row["date"])}

    if unmapped:
        print(f"[WARN] {len(unmapped)} کشور بدون نگاشت فارسی (رد شدند): {unmapped[:10]}...")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n[DONE] جمعیت {len(result)} کشور در {OUTPUT_FILE} ذخیره شد.")


if __name__ == "__main__":
    main()
