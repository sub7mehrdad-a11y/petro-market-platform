"""
پیدا کردن شناسه‌ی چت مدیرها برای TELEGRAM_CHAT_IDS.

چرا این ابزار لازم است: ربات تلگرام نمی‌تواند اولین پیام را به کسی بفرستد —
فقط بعد از این‌که آن شخص خودش یک‌بار به ربات پیام داده باشد (معمولاً /start).
پس هر مدیری که قرار است گزارش هفتگی را دریافت کند، اول باید در تلگرام دنبال
همین ربات بگردد و /start بزند.

استفاده:
    1. توکن ربات را در TELEGRAM_BOT_TOKEN (در .env) بگذار.
    2. از هر مدیری بخواه یک‌بار به ربات /start بزند.
    3. این اسکریپت را اجرا کن:
       python scripts/telegram_setup.py
    4. خط آماده‌ی TELEGRAM_CHAT_IDS=... را که چاپ می‌کند در .env (و بعداً در
       GitHub Actions Secrets) کپی کن.
"""

import os
import sys

from env_utils import load_env

load_env()

from telegram_utils import get_updates

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("[ERROR] TELEGRAM_BOT_TOKEN تنظیم نشده است.")

    print("[INFO] در حال خواندن پیام‌های اخیر ربات از تلگرام ...")
    try:
        updates = get_updates(token)
    except RuntimeError as e:
        raise SystemExit(f"[ERROR] {e}")

    if not updates:
        print(
            "[WARN] هیچ پیامی پیدا نشد. مطمئن شو حداقل یک نفر یک‌بار به ربات /start زده،\n"
            "       و این‌که getUpdates فقط پیام‌های ۲۴ ساعت اخیر (یا از آخرین بار که خونده شده) رو برمی‌گردونه."
        )
        return

    seen = {}
    for u in updates:
        msg = u.get("message") or u.get("channel_post")
        if not msg:
            continue
        chat = msg.get("chat", {})
        chat_id = chat.get("id")
        if chat_id is None:
            continue
        name = " ".join(
            filter(None, [chat.get("first_name"), chat.get("last_name")])
        ) or chat.get("username") or chat.get("title") or "—"
        seen[chat_id] = name

    if not seen:
        print("[WARN] پیامی پیدا شد ولی هیچ chat id قابل‌استخراجی نداشت.")
        return

    print(f"\n[OK] {len(seen)} چت پیدا شد:\n")
    for chat_id, name in seen.items():
        print(f"  {chat_id}   ({name})")

    ids_line = ",".join(str(c) for c in seen)
    print(f"\nاین خط را در .env (و در GitHub Actions Secrets) با نام TELEGRAM_CHAT_IDS بگذار:\n")
    print(f"TELEGRAM_CHAT_IDS={ids_line}")


if __name__ == "__main__":
    main()
