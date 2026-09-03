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
import time

import httpx

BASE_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"

# سقف واقعی سرویس رایگان (service tier: on_demand) برای این مدل: ۸۰۰۰ توکن در
# دقیقه. نکته‌ی حیاتی: Groq مجموع «توکن پرامپت + max_tokens درخواستی» رو قبل از
# اجرا با این سقف می‌سنجه، نه مصرف واقعی رو. یعنی max_tokens=8000 حتی با یک
# پرامپت یک‌کلمه‌ای هم همیشه خطای ۴۱۳ می‌ده — دقیقاً همون چیزی که از ۲۲ اوت
# ۲۰۲۶ ربات ترانزیت رو خاموش کرده بود (هر روز صفر پست).
TPM_LIMIT = 8000
TPM_MARGIN = 500        # حاشیه‌ی اطمینان، چون تخمین توکن دقیق نیست


def estimate_tokens(text: str) -> int:
    """تخمین محافظه‌کارانه‌ی توکن. فارسی حدود ۲.۵ کاراکتر به‌ازای هر توکن است."""
    return int(len(text or "") / 2.5) + 1


def groq_generate(
    system_instruction: str, input: str, model: str = DEFAULT_MODEL,
    timeout: int = 30, max_tokens: int = 4000, reasoning_effort: str | None = None,
    api_key: str | None = None,
) -> str:
    """
    reasoning_effort: مدل‌های gpt-oss قبل از جواب، «توکن استدلال» تولید می‌کنن که
    از همون max_tokens کم می‌شه. برای کارهای استخراج ساختاریافته (که استدلال
    عمیق لازم ندارن) مقدار "low" بده، وگرنه ممکنه کل بودجه صرف استدلال بشه و
    خروجی JSON وسط راه قطع بشه — دقیقاً بلایی که سر کانال amintara50 اومد.

    api_key: برای فراخوان‌هایی که باید از کلید اختصاصی خودشون استفاده کنن (نه
    GROQ_API_KEY مشترک)، مثل scripts/exhibitor_lead_finder.py — تا سهمیه‌ی
    روزانه‌شون با بقیه‌ی ربات‌ها قاطی نشه.
    """
    api_key = api_key or os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise SystemExit("GROQ_API_KEY تنظیم نشده است.")

    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": input})

    # سقف خروجی رو قبل از ارسال با فضای باقی‌مانده‌ی TPM هماهنگ کن.
    prompt_tokens = estimate_tokens(system_instruction) + estimate_tokens(input)
    budget = TPM_LIMIT - TPM_MARGIN - prompt_tokens
    if budget < 500:
        raise ValueError(
            f"پرامپت بزرگ‌تر از سهمیه‌ی Groq است (تخمین {prompt_tokens} توکن). "
            "متن ورودی را کوتاه‌تر کن."
        )
    if max_tokens > budget:
        print(f"[INFO] max_tokens از {max_tokens} به {budget} کاهش یافت (سقف TPM گروک).")
        max_tokens = budget

    last_error = None
    for attempt in range(3):
        # max_tokens صریح چون پیش‌فرض Groq برای خروجی‌های JSON بلند (لیست چند
        # پستی) کافی نیست و پاسخ رو وسط راه، قبل از بسته شدن آرایه، قطع می‌کنه.
        payload = {"model": model, "messages": messages, "max_tokens": max_tokens}
        if reasoning_effort:
            payload["reasoning_effort"] = reasoning_effort

        resp = httpx.post(
            BASE_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=timeout,
        )

        # ۴۱۳ = درخواست از سقف TPM بزرگ‌تره، ۴۲۹ = سهمیه‌ی این دقیقه پر شده.
        # اولی با کوچک‌کردن سقف خروجی حل می‌شه، دومی فقط با صبر کردن.
        if resp.status_code == 413:
            last_error = resp.text[:300]
            max_tokens = max(800, max_tokens // 2)
            print(f"[RETRY] Groq 413 — max_tokens به {max_tokens} کاهش یافت.")
            continue
        if resp.status_code == 429:
            last_error = resp.text[:300]
            wait = int(float(resp.headers.get("retry-after", 20))) + 1
            print(f"[RETRY] Groq 429 — {wait} ثانیه صبر می‌کنیم.")
            time.sleep(min(wait, 60))
            continue

        resp.raise_for_status()
        data = resp.json()
        text = data.get("choices", [{}])[0].get("message", {}).get("content")
        if not text:
            raise ValueError(f"پاسخ خالی از Groq: {data}")
        return text

    raise ValueError(f"Groq پس از سه تلاش جواب نداد: {last_error}")
