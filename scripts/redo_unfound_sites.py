"""
بازبررسی شرکت‌هایی که «سایت پیدا نشد / باز نشد» خوردند، با موتور جست‌وجوی Yahoo.

چرا: DuckDuckGo در ۲۰۲۶-۱۱ بلاک شد؛ جست‌وجوی fallback در اجراهای قبلی (گلفود/هند/روسیه) برای شرکت‌های بدون
سایت در پروفایل نمایشگاه ممکن است بی‌صدا خالی برگشته باشد. این اسکریپت ورودی‌های not_found /
unreachable_or_unmatched / error را از <slug>.verified.json برمی‌دارد و دوباره صحت‌سنجی می‌کند (فقط
آن‌هایی که امروز بازبررسی نشده‌اند → قابل‌ادامه بعد از قطع نشست)، بعد پاس رندر و ساخت اکسل.

استفاده:  python scripts/redo_unfound_sites.py [slug ...]
"""

import os
import sys
import json
import time
import subprocess

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
TITLES = {"indusfood-2026": "Indusfood 2026", "global-ingredients-show-2026": "Global Ingredients Show 2026",
          "gulfood-2026": "Gulfood 2026"}
REDO = {"not_found", "unreachable_or_unmatched", "error"}


def run(*args):
    print("  $", " ".join(args[1:4]), "...", flush=True)
    return subprocess.run([PY, "-u", *args], cwd=os.path.dirname(HERE)).returncode


def main():
    slugs = sys.argv[1:] or ["indusfood-2026", "global-ingredients-show-2026", "gulfood-2026"]
    today = time.strftime("%Y-%m-%d")
    for slug in slugs:
        path = os.path.join(efl.OUTPUT_DIR, f"{slug}.verified.json")
        d = efl.load_progress(path)
        drop = [k for k, v in d.items() if v.get("website_status") in REDO and v.get("checked_at") != today]
        for k in drop:
            del d[k]
        efl.atomic_write_json(path, d)
        print(f"[{slug}] {len(drop)} شرکت برای بازبررسی برداشته شد ({len(d)} می‌ماند)", flush=True)
        run(os.path.join(HERE, "verify_company_contacts.py"), "--slug", slug, "--workers", "5")
        run(os.path.join(HERE, "verify_company_contacts.py"), "--slug", slug, "--render-only")
        run(os.path.join(HERE, "export_verified_xlsx.py"), slug, TITLES[slug])
    print("[DONE]")


if __name__ == "__main__":
    main()
