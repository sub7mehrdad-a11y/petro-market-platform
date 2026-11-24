"""
ایمیل «استعلام/کسب اطلاعات» از صندوق بازاریابی شرکت (همان SMTP پلتفرم) — جدا از کمپین ایمیل معرفی (/outreach).

قواعد (به‌خاطر قفل‌های هیئت‌مدیره و حادثه‌ی ۱۵ اکتبر):
  • این ابزار فروش/تبلیغ نمی‌فرستد؛ فقط درخواست اطلاعات (فهرست اعضا، مسیر ثبت‌نام، کاتالوگ نمایشگاه و …).
  • هیچ ایمیلی بدون «approved: true» در فایل دسته فرستاده نمی‌شود؛ این مقدار را فقط بعد از تأییدِ صریح کاربر (در چت)
    برای همان دسته می‌گذاریم؛ تأیید یک دسته به دسته‌ی بعدی منتقل نمی‌شود.
  • اگر data/outreach_halt.json روی halted:true باشد، ارسال رد می‌شود.
  • سقف روزانه (پیش‌فرض ۱۵ مثل OUTREACH_DAILY_LIMIT) و فاصله‌ی ۶۰±۲۵٪ ثانیه؛ متن ساده، بدون پیوست؛ همه‌چیز در
    data/inquiry_log.json ثبت می‌شود (جدا از لاگ ایمیل معرفی).
  • اطلاعات ورود فقط از .env خوانده می‌شود و هرگز چاپ/ثبت نمی‌شود.

دستورها:
  python scripts/inquiry_mailer.py login-check              # فقط ورود به SMTP (بدون ارسال)
  python scripts/inquiry_mailer.py preview <batch.json>     # نمایش متن‌ها
  python scripts/inquiry_mailer.py send <batch.json>        # ارسال فقط مواردِ approved:true
  python scripts/inquiry_mailer.py replies <batch.json>     # فقط پاسخ‌های همین استعلام‌ها (IMAP، فقط خواندن)

قالب batch.json: {"batch": "نام", "approved": false, "items": [{"to": ["a@x.com"], "subject": "...", "body": "...", "approved": false}]}
"""

from __future__ import annotations

import imaplib
import json
import os
import random
import smtplib
import ssl
import sys
import time
from datetime import datetime, timedelta, timezone
from email import message_from_bytes
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "data" / "inquiry_log.json"
HALT = ROOT / "data" / "outreach_halt.json"
DAILY_LIMIT = 15
INTERVAL = 60

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def load_env() -> dict:
    """از .env در ریشه‌ی پروژه یا چک‌اوت اصلی (worktree فاقد .env است). مقادیر چاپ نمی‌شوند."""
    for cand in (ROOT / ".env", *(p / ".env" for p in ROOT.parents[:4])):
        if cand.is_file() and "SMTP_HOST" in cand.read_text(encoding="utf-8", errors="ignore"):
            env = {}
            for line in cand.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
            return env
    raise SystemExit("فایل .env با SMTP_HOST پیدا نشد.")


def smtp_connect(env: dict) -> smtplib.SMTP:
    host = env["SMTP_HOST"]
    ctx = ssl.create_default_context()
    ctx.check_hostname = False          # گواهی TLS سرور فعلی مشکل دارد (در .env.example هم ذکر شده)
    ctx.verify_mode = ssl.CERT_NONE
    # ۲۰۲۶-۱۱-۲۳: mail.parssoda.com روی ۵۸۷ هیچ STARTTLS نمی‌دهد (فقط AUTH ساده)؛ روی ۴۶۵ TLS ضمنی دارد.
    # رمز را هرگز بدون TLS نمی‌فرستیم: اول ۴۶۵ (SSL)، بعد پورت تنظیم‌شده فقط اگر STARTTLS پشتیبانی شود.
    try:
        s = smtplib.SMTP_SSL(host, 465, timeout=40, context=ctx)
    except Exception:  # noqa: BLE001
        port = int(env.get("SMTP_PORT", "587"))
        s = smtplib.SMTP(host, port, timeout=40)
        s.ehlo()
        if not s.has_extn("starttls"):
            s.close()
            raise SystemExit("سرور نه SSL روی ۴۶۵ دارد و نه STARTTLS؛ برای جلوگیری از ارسال رمز بدون رمزنگاری متوقف شد.")
        s.starttls(context=ctx)
    s.login(env["SMTP_USER"], env["SMTP_PASSWORD"])
    return s


def read_log() -> list:
    try:
        return json.loads(LOG.read_text(encoding="utf-8")).get("sent", [])
    except Exception:  # noqa: BLE001
        return []


def write_log(sent: list) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    tmp = LOG.with_suffix(".tmp")
    tmp.write_text(json.dumps({"sent": sent}, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(LOG)


def halted() -> str | None:
    try:
        h = json.loads(HALT.read_text(encoding="utf-8"))
        return h.get("reason") or "halted" if h.get("halted") else None
    except Exception:  # noqa: BLE001
        return None


def cmd_login_check() -> None:
    env = load_env()
    s = smtp_connect(env)
    s.quit()
    print(f"ورود به SMTP موفق بود (host={env['SMTP_HOST']}, user={env['SMTP_USER']}); چیزی ارسال نشد.")


def cmd_preview(path: str) -> None:
    b = json.loads(Path(path).read_text(encoding="utf-8"))
    for i, it in enumerate(b["items"], 1):
        print(f"=== {i}. To: {', '.join(it['to'])} | approved={it.get('approved', False)}\nSubject: {it['subject']}\n\n{it['body']}\n")


def cmd_send(path: str) -> None:
    reason = halted()
    if reason:
        raise SystemExit(f"ارسال متوقف است (data/outreach_halt.json): {reason}")
    b = json.loads(Path(path).read_text(encoding="utf-8"))
    todo = [it for it in b["items"] if it.get("approved") is True and b.get("approved") is True]
    if not todo:
        raise SystemExit("هیچ مورد approved:true نیست (هم خود دسته و هم هر مورد باید تأیید صریح کاربر را داشته باشد).")
    sent = read_log()
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    last24 = [r for r in sent if datetime.fromisoformat(r["at"]) > since]
    if len(last24) + len(todo) > DAILY_LIMIT:
        raise SystemExit(f"سقف روزانه ({DAILY_LIMIT}) رد می‌شود: {len(last24)} ارسال در ۲۴ ساعت گذشته + {len(todo)} جدید.")
    done = {(tuple(r["to"]), r["subject"]) for r in sent}
    env = load_env()
    s = smtp_connect(env)
    from_name = env.get("SMTP_FROM_NAME") or "Pars Baking Soda Group"
    try:
        for n, it in enumerate(todo, 1):
            key = (tuple(it["to"]), it["subject"])
            if key in done:
                print(f"  رد شد (قبلاً فرستاده شده): {it['to']}")
                continue
            m = EmailMessage()
            m["From"] = f"{from_name} <{env['SMTP_USER']}>"
            m["To"] = ", ".join(it["to"])
            m["Subject"] = it["subject"]
            m["Date"] = formatdate(localtime=True)
            m["Message-ID"] = make_msgid(domain=env["SMTP_USER"].split("@")[1])
            m.set_content(it["body"])
            s.send_message(m)
            sent.append({"at": datetime.now(timezone.utc).isoformat(), "batch": b.get("batch"), "to": it["to"],
                         "subject": it["subject"], "message_id": m["Message-ID"]})
            write_log(sent)
            print(f"  ✔ ارسال شد → {', '.join(it['to'])}")
            if n < len(todo):
                time.sleep(INTERVAL * random.uniform(0.75, 1.25))
    finally:
        s.quit()


def cmd_replies(path: str) -> None:
    """فقط پاسخ‌هایی که موضوعشان «Re: <موضوع یکی از استعلام‌های همین دسته>» است؛ بقیه‌ی صندوق خوانده/چاپ نمی‌شود."""
    env = load_env()
    b = json.loads(Path(path).read_text(encoding="utf-8"))
    subjects = {it["subject"] for it in b["items"]}
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    im = imaplib.IMAP4_SSL(env.get("IMAP_HOST") or env["SMTP_HOST"], int(env.get("IMAP_PORT", "993")), ssl_context=ctx)
    im.login(env["SMTP_USER"], env["SMTP_PASSWORD"])
    im.select("INBOX", readonly=True)
    found = 0
    for subj in subjects:
        typ, data = im.search(None, "SUBJECT", f'"{subj}"'.encode("utf-8") if subj.isascii() else subj)
        for num in (data[0].split() if typ == "OK" else []):
            typ, msg = im.fetch(num, "(BODY.PEEK[])")
            mm = message_from_bytes(msg[0][1])
            sub = str(make_header(decode_header(mm.get("Subject", ""))))
            if not sub.lower().startswith(("re:", "aw:")):
                continue
            found += 1
            body = ""
            for part in mm.walk():
                if part.get_content_type() == "text/plain":
                    body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
                    break
            print(f"--- از: {mm.get('From')} | {mm.get('Date')}\nموضوع: {sub}\n{body[:1500]}\n")
    im.logout()
    print(f"{found} پاسخ پیدا شد.")


def main() -> None:
    a = sys.argv[1:]
    if a[:1] == ["login-check"]:
        cmd_login_check()
    elif len(a) == 2 and a[0] == "preview":
        cmd_preview(a[1])
    elif len(a) == 2 and a[0] == "send":
        cmd_send(a[1])
    elif len(a) == 2 and a[0] == "replies":
        cmd_replies(a[1])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
