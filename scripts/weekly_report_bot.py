"""
ربات گزارش هفتگی مدیران — PDF فارسی از وضعیت بازار، هر شنبه به تلگرام مدیرها.

چرا یک ورک‌فلوی کاملاً جدا از ایجنت‌های روزانه (نه بخشی از داخل یکی از اون‌ها):
این اسکریپت هیچ کلید هوش مصنوعی لازم نداره و هیچ سایتی رو fetch نمی‌کنه — فقط
data/*.json (خروجی همون ایجنت‌های روزانه) رو می‌خونه و خلاصه می‌کنه. یعنی حتی
اگه سهمیه‌ی Gemini/Groq همون هفته تموم شده باشه یا یک منبع خبری از کار افتاده
باشه، گزارش مدیران باز هم سالم تولید و ارسال می‌شه.

استفاده:
    python scripts/weekly_report_bot.py                 # می‌سازه و به همه‌ی مدیرها می‌فرسته
    python scripts/weekly_report_bot.py --dry-run        # فقط PDF رو محلی می‌سازه، ارسال نمی‌کنه
    python scripts/weekly_report_bot.py --out FILE.pdf   # مسیر خروجی دلخواه (پیش‌فرض: کنار همین اسکریپت)

نیازمندی‌ها (در .env یا متغیر محیطی):
    TELEGRAM_BOT_TOKEN   — توکن ربات (از @BotFather)
    TELEGRAM_CHAT_IDS    — شناسه‌ی چت مدیرها، با ویرگول جدا (با scripts/telegram_setup.py پیدا کن)
"""

import os
import sys
import argparse

from env_utils import load_env

load_env()

from weekly_report_data import build_report_data
from weekly_report_pdf import build_pdf
from telegram_utils import send_message, send_document

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DEFAULT_OUTPUT = os.path.join(os.path.dirname(__file__), "weekly_report_latest.pdf")


def build_caption(data: dict) -> str:
    lines = [
        "📊 <b>گزارش هفتگی بازار جوش شیرین — سپهران شیمی</b>",
        f"تاریخ: {data['generated_date']}",
    ]
    for kp in data.get("key_prices", []):
        if kp.get("available"):
            lines.append(f"{kp['country']}: {kp['value']:,.0f} {kp['currency']}/{kp['unit']} ({kp['price_type_fa']})")
        else:
            lines.append(f"{kp['country']}: به‌زودی")
    biggest = data.get("biggest_mover")
    if biggest and biggest["pct_change"]:
        sign = "+" if biggest["pct_change"] > 0 else ""
        lines.append(f"بیشترین تغییر هفته: {biggest['country']} ({sign}{biggest['pct_change']}%)")
    lines.append(f"اخبار: {len(data['general_news'])} مورد · ترانزیت: {len(data['transit_news'])} مورد")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="ساخت و ارسال گزارش هفتگی مدیران به تلگرام")
    parser.add_argument("--dry-run", action="store_true", help="فقط PDF رو می‌سازه، به تلگرام ارسال نمی‌کنه")
    parser.add_argument("--out", default=DEFAULT_OUTPUT, help="مسیر فایل PDF خروجی")
    args = parser.parse_args()

    print("[INFO] در حال آماده‌سازی داده‌ی گزارش از data/*.json ...")
    data = build_report_data()
    total_series = len(data["usd_table"]) + len(data["local_table"])
    total_news = len(data["general_news"]) + len(data["transit_news"])
    print(f"[OK] {total_series} سری قیمتی، {total_news} خبر این هفته پیدا شد.")

    print(f"[INFO] در حال ساخت PDF ...")
    pdf_path = build_pdf(data, args.out)
    size_kb = os.path.getsize(pdf_path) / 1024
    print(f"[OK] PDF ساخته شد: {pdf_path} ({size_kb:.0f} KB)")

    if args.dry_run:
        print("[INFO] --dry-run فعال است؛ ارسال به تلگرام انجام نشد.")
        return

    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_ids_raw = os.environ.get("TELEGRAM_CHAT_IDS", "")
    chat_ids = [c.strip() for c in chat_ids_raw.split(",") if c.strip()]

    if not token:
        raise SystemExit("[ERROR] TELEGRAM_BOT_TOKEN تنظیم نشده است.")
    if not chat_ids:
        raise SystemExit(
            "[ERROR] TELEGRAM_CHAT_IDS تنظیم نشده. اول scripts/telegram_setup.py رو اجرا کن "
            "تا شناسه‌ی چت مدیرهایی که /start زده‌ن رو پیدا کنی."
        )

    caption = build_caption(data)
    sent, failed = 0, []
    for chat_id in chat_ids:
        ok, err = send_document(token, chat_id, pdf_path, caption=caption)
        if ok:
            sent += 1
            print(f"[OK] ارسال شد به {chat_id}")
        else:
            failed.append((chat_id, err))
            print(f"[WARN] ارسال به {chat_id} شکست خورد: {err}")

    print(f"\n[DONE] {sent}/{len(chat_ids)} مدیر گزارش رو دریافت کردن.")
    if failed:
        print(f"[WARN] {len(failed)} مورد شکست خورد (بقیه متوقف نشدن، طبق طراحی).")


if __name__ == "__main__":
    main()
