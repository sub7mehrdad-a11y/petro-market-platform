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
import re
import time
import subprocess
import sys
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATUS_FILE = os.path.join(BASE_DIR, "data", "agent_status.json")
TAIL_CHARS = 2500
# سقف زمان هر ربات: فراخوانی مدل/شبکه گاهی بی‌پایان گیر می‌کنه (ربات چین ۴ روز از ۶ روز ۱۰–۱۴
# اکتبر ۲۰۲۶ تا سقف ۶ ساعت job گیر کرد و چون استپ commit اجرا نشد، داده‌ی روزانه از دست رفت).
# پس از سقف، پروسه کشته می‌شه و یک بار دوباره تلاش می‌کنیم.
TIMEOUT_SEC = int(os.environ.get("AGENT_TIMEOUT_SEC", "900"))
TIMEOUT_RETRIES = int(os.environ.get("AGENT_TIMEOUT_RETRIES", "1"))
TIMEOUT_EXIT_CODE = 124
# خطاهای گذرای API (مثلاً ۵۰۳ «high demand» جمینای که ۱۷ اکتبر ۲۰۲۶ ربات چین رو یک روز بی‌داده گذاشت) → تلاش مجدد با فاصله.
TRANSIENT_RETRIES = int(os.environ.get("AGENT_TRANSIENT_RETRIES", "2"))
TRANSIENT_DELAY_SEC = int(os.environ.get("AGENT_TRANSIENT_DELAY_SEC", "60"))
TRANSIENT_PATTERN = re.compile(r"(503|429|500|502|504)|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|rate.?limit|ConnectError|SSL|timed out", re.I)


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
    output = ""
    returncode = None
    timed_out = False
    transient_tries = 0
    timeout_tries = 0
    for attempt in range(1, TIMEOUT_RETRIES + TRANSIENT_RETRIES + 2):
        try:
            proc = subprocess.run(
                [sys.executable, script, *args],
                cwd=BASE_DIR,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=TIMEOUT_SEC,
            )
            output, returncode, timed_out = proc.stdout or "", proc.returncode, False
            if returncode != 0 and transient_tries < TRANSIENT_RETRIES and TRANSIENT_PATTERN.search(output[-3000:]):
                transient_tries += 1
                print(output)
                print(f"[RETRY] خطای گذرا؛ تلاش مجدد {transient_tries}/{TRANSIENT_RETRIES} بعد از {TRANSIENT_DELAY_SEC} ثانیه")
                time.sleep(TRANSIENT_DELAY_SEC)
                continue
            break
        except subprocess.TimeoutExpired as e:
            partial = e.stdout or ""
            if isinstance(partial, bytes):
                partial = partial.decode("utf-8", errors="replace")
            output = f"{partial}\n[TIMEOUT] ربات «{name}» بعد از {TIMEOUT_SEC} ثانیه پاسخ نداد (تلاش {attempt}).\n"
            returncode, timed_out = TIMEOUT_EXIT_CODE, True
            print(output)
            timeout_tries += 1
            if timeout_tries > TIMEOUT_RETRIES:
                break
    # خروجی کامل هم‌چنان توی لاگ Actions چاپ می‌شه (در حالت تایم‌اوت قبلاً چاپ شده)
    if not timed_out:
        print(output)

    status = load_status()
    status[name] = {
        "ok": returncode == 0,
        "exit_code": returncode,
        "timed_out": timed_out,
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "output_tail": redact(output)[-TAIL_CHARS:],
    }
    os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=2)

    sys.exit(returncode)


if __name__ == "__main__":
    main()
