"""
ابزار مشترک ارسال پیام/فایل به تلگرام برای ربات گزارش هفتگی مدیران.

چرا httpx (نه requests، نه urllib خام): همون دلیل groq_utils.py — api.telegram.org
هم مثل Groq از ایران فیلتره؛ httpx خودش HTTPS_PROXY رو از متغیر محیطی می‌خونه
(نیازی به تنظیم دستی پراکسی توی این فایل نیست)، در حالی که urllib خام این کار
رو نمی‌کنه.

چرا توکن رو با _redact پاک می‌کنیم: requests (در یک پروژه‌ی تلگرامی جدا) وقتی
یک درخواست fail می‌شه، URL کامل شامل خودِ توکن رو توی پیام خطا می‌ذاره؛ اگه اون
خطا جایی لاگ یا کامیت بشه، توکن لو می‌ره. این‌جا از اول جلوش رو می‌گیریم — هر
پیام خطایی که ممکنه حاوی توکن باشه، قبل از return/print پاک‌سازی می‌شه.
"""

import os
import httpx

API_BASE = "https://api.telegram.org/bot{token}/{method}"


def _redact(text: str, token: str) -> str:
    if not token:
        return text
    return text.replace(token, "***REDACTED***")


def send_message(token: str, chat_id: str, text: str, timeout: float = 20) -> tuple[bool, str | None]:
    url = API_BASE.format(token=token, method="sendMessage")
    try:
        resp = httpx.post(
            url,
            data={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
            timeout=timeout,
        )
        resp.raise_for_status()
        return True, None
    except httpx.HTTPStatusError as e:
        return False, _redact(f"HTTP {e.response.status_code}: {e.response.text[:300]}", token)
    except httpx.HTTPError as e:
        return False, _redact(str(e), token)


def send_document(
    token: str, chat_id: str, file_path: str, caption: str = "", timeout: float = 60
) -> tuple[bool, str | None]:
    url = API_BASE.format(token=token, method="sendDocument")
    filename = os.path.basename(file_path)
    try:
        with open(file_path, "rb") as f:
            files = {"document": (filename, f, "application/pdf")}
            data = {"chat_id": chat_id, "caption": caption[:1024], "parse_mode": "HTML"}
            resp = httpx.post(url, data=data, files=files, timeout=timeout)
        resp.raise_for_status()
        return True, None
    except httpx.HTTPStatusError as e:
        return False, _redact(f"HTTP {e.response.status_code}: {e.response.text[:300]}", token)
    except httpx.HTTPError as e:
        return False, _redact(str(e), token)


def get_updates(token: str, timeout: float = 20) -> list[dict]:
    """برای telegram_setup.py — لیست پیام‌های اخیری که ربات دریافت کرده (مثلاً /start)."""
    url = API_BASE.format(token=token, method="getUpdates")
    try:
        resp = httpx.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.json().get("result", [])
    except httpx.HTTPError as e:
        raise RuntimeError(_redact(str(e), token))
