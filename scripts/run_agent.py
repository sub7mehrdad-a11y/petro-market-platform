"""
اجرای یک ربات با ثبت وضعیت در data/agent_status.json.

چرا: توی daily_market_agents.yml همه‌ی ربات‌ها continue-on-error هستن (تا خرابی یکی
داده‌ی بقیه رو از بین نبره) — ولی نتیجه‌اش اینه که یک ربات می‌تونه روزها خراب باشه و
هیچ‌جا دیده نشه: استپ توی Actions «سبز» می‌مونه و لاگ‌ها بدون لاگین قابل‌دانلود نیستن.
این پوشه‌ی کوچک خروجی/کد خروج هر ربات رو توی یک فایل داده‌ی کامیت‌شده می‌نویسه؛ هم
من/کاربر از روی گیت می‌تونیم ببینیم چرا خراب شده، هم می‌شه بعداً توی سایت نشونش داد.

استفاده:  python scripts/run_agent.py <نام> <مسیر اسکریپت> [آرگومان‌ها...]
کد خروج همون کد خروج ربات است (پس رفتار continue-on-error عوض نمی‌شه).
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATUS_FILE = os.path.join(BASE_DIR, "data", "agent_status.json")
TAIL_CHARS = 2500


def load_status():
    try:
        with open(STATUS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def redact(text):
    # مخزن عمومیه — هیچ مقدار رازی نباید توی فایل داده‌ی کامیت‌شده بیفته.
    for k, v in os.environ.items():
        if v and len(v) >= 8 and any(w in k.upper() for w in ("KEY", "TOKEN", "SECRET", "PASSWORD")):
            text = text.replace(v, "***")
    return text


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: run_agent.py <name> <script> [args...]")
    name, script, args = sys.argv[1], sys.argv[2], sys.argv[3:]

    env = dict(os.environ, PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8")
    started = datetime.now(timezone.utc)
    proc = subprocess.run(
        [sys.executable, script, *args],
        cwd=BASE_DIR,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    output = proc.stdout or ""
    # خروجی کامل هم‌چنان توی لاگ Actions چاپ می‌شه
    print(output)

    status = load_status()
    status[name] = {
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "output_tail": redact(output)[-TAIL_CHARS:],
    }
    os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=2)

    sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
