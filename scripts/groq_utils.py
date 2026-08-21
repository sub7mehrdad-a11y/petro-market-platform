"""
کلاینت سبک برای Groq (سازگار با OpenAI Chat Completions API) — به‌عنوان موتور
پشتیبان/جایگزین Gemini، برای وقتی سهمیه‌ی روزانه‌ی Gemini تمام می‌شه یا برای
کارهای یک‌باره‌ی سنگین.

چرا httpx (نه urllib خام مثل fetch_utils.py): سرویس Groq پشت Cloudflareست و
درخواست‌های urllib خام رو با خطای ۴۰۳ (کد 1010 — بلاک اثرانگشت/کلاینت، نه
بلاک منطقه‌ای) رد می‌کنه؛ httpx مشکلی نداره. httpx.Client() هم مثل
google-genai به‌صورت خودکار متغیرهای HTTPS_PROXY/HTTP_PROXY رو رعایت می‌کنه.

استفاده:
    from groq_utils import groq_generate
    text = groq_generate(system_instruction="...", input="...")
"""

import os

import httpx

BASE_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"


def groq_generate(
    system_instruction: str, input: str, model: str = DEFAULT_MODEL,
    timeout: int = 30, max_tokens: int = 4000,
) -> str:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise SystemExit("GROQ_API_KEY تنظیم نشده است.")

    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": input})

    resp = httpx.post(
        BASE_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        # max_tokens صریح چون پیش‌فرض Groq برای خروجی‌های JSON بلند (لیست چند
        # پستی) کافی نیست و پاسخ رو وسط راه، قبل از بسته شدن آرایه، قطع می‌کنه.
        json={"model": model, "messages": messages, "max_tokens": max_tokens},
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data.get("choices", [{}])[0].get("message", {}).get("content")
    if not text:
        raise ValueError(f"پاسخ خالی از Groq: {data}")
    return text
