"""
«توصیه‌ی هفته‌ی مغز پلتفرم»: خلاصه‌ی جامع (data/brain/digest.md، ساخته‌ی build_brain.py) را به مدل می‌دهد و یک
گزارش راهبردی ساخت‌یافته می‌گیرد: روی کدام کشورها و با چه شرایطی کار کنیم، کجا مکث کنیم، کدام کشور رادار ارزش
تحقیق دارد، سیگنال‌های بازار و خلأهای داده.

خروجی: data/brain/briefing.json (صفحه‌ی «پرسش از پلتفرم» بالای صفحه نشانش می‌دهد).

کلید: فقط GEMINI_API_KEY_BRAIN (اختصاصی؛ بدون fallback به کلید مشترک ایجنت‌های روزانه — تصمیم ۲۰۲۶-۱۱-۰۲).
اگر کلید نباشد، بی‌سروصدا رد می‌شود (exit 0) تا ربات‌های دیگر نیفتند.
داده‌ی فروش تیم بازرگانی هرگز اینجا نمی‌آید (مخزن عمومی است).

اجرا:
    python scripts/brain_briefing.py            # فقط اگر آخرین توصیه ≥ ۶ روز پیش بوده
    python scripts/brain_briefing.py --force
"""

import argparse
import datetime
import json
import os
import re
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAIN = os.path.join(BASE, "data", "brain")
MODEL = os.environ.get("GEMINI_BRAIN_MODEL", "gemini-3.6-flash")
MIN_AGE_DAYS = 6

SYSTEM = """
تو «مغز متفکر» پلتفرم تحقیق و توسعه‌ی سپهران شیمی (تولیدکننده‌ی ایرانی جوش شیرین، HS 283630، برند «جوش شیرین پارس»،
قیمت مرجع حدود ۲۵۰ دلار بر تن FOB) هستی. «خلاصه‌ی جامع» همه‌ی داده‌های پلتفرم است. یک «توصیه‌ی هفته» برای تیم بازرگانی
و مدیران بنویس: با توجه به شرایط همین الان، روی چه کشورهایی و با چه شرایطی کار شود.

قوانین:
1. فقط از خلاصه‌ی جامع استفاده کن؛ چیزی نساز. اگر داده‌ای نیست، در data_gaps بنویس.
2. عددها را دقیقاً همان‌طور که آمده نقل کن؛ FOB/CIF/ارزش واحد واردات را قاطی نکن.
2.5. هر عدد باید عیناً در خلاصه‌ی جامع باشد و متعلق به همان کشور/موضوعی که کنارش می‌نویسی. هیچ عددی را خودت محاسبه نکن
   (نه تفریق، نه درصد، نه «باقیمانده»)، و در headline/summary عددی که فقط برای بعضی کشورها صادق است را به همه نسبت نده.
2.6. «ارزش واحد واردات» نشانه‌ی سطح قیمت مقصد است، نه قیمت فوب؛ هرگز آن را با قیمت مرجع ۲۵۰ فوب مقایسه نکن و از آن «حاشیه‌ی فروش» نساز.
   ارزشی که «مشکوک» برچسب خورده را به‌عنوان مزیت نیاور (فقط در data_gaps بنویس که نیاز به تأیید دارد).
   آمار گمرک ایران کم‌اظهار است و قیمت فوب نیست. قیمتی که «کهنه» برچسب خورده را به‌عنوان وضع فعلی بازار معرفی نکن.
2.7. فقط نمایشگاه‌هایی را پیشنهاد کن که در خلاصه‌ی جامع زیر «پیش‌رو (قابل‌پیشنهاد)» آمده‌اند؛ گذشته یا بدون تاریخ روشن ممنوع.
2.8. کشوری با برچسب «بازار و رقیب هم‌زمان» یا «پرونده از سند رقیب» را با احتیاط و فقط با ذکر همین محدودیت اولویت بده.
3. رتبه‌بندی خلاصه‌ی جامع نقطه‌ی شروع است؛ اگر از روی اخبار/ریسک‌ها تعدیل می‌کنی، صریح بگو چرا.
   مسیر/مرز/بندر را فقط اگر در پرونده‌ی همان کشور آمده ذکر کن؛ فاصله‌ی «برآورد هوایی» مسیر واقعی نیست.
4. هر کشور اولویت‌دار: چرا (با عدد)، شرایط (گرید، مسیر/بندر، بازه‌ی قیمت نسبت به ۲۵۰ FOB، رقیب)، ریسک، قدم بعدی مشخص.
5. خروجی فقط یک JSON معتبر (بدون توضیح بیرونش) با همین ساختار، همه‌ی متن‌ها فارسی و کوتاه:
{
  "headline": "یک جمله: مهم‌ترین نتیجه‌ی این هفته",
  "summary": "۳ تا ۴ جمله: تصویر کلی بازار و موقعیت ما",
  "priorities": [   // ۳ تا ۵ کشور از رتبه‌بندی، به ترتیب اولویت
    {"country": "نام دقیق کشور مثل خلاصه‌ی جامع", "stance": "تمرکز|ادامه|آزمایشی",
     "why": ["دلیل با عدد", "..."], "conditions": ["گرید/مسیر/قیمت/رقیب", "..."],
     "risks": ["..."], "next_steps": ["اقدام مشخص", "..."]}
  ],
  "pause_or_deprioritize": [{"country": "...", "reason": "..."}],
  "radar_picks": [{"country": "از بخش رادار", "reason": "...", "research_needed": "..."}],
  "market_signals": ["سیگنال قیمت/خبر/حمل با عدد و تاریخ", "..."],
  "data_gaps": ["..."]
}
""".strip()


_P2A = str.maketrans("۰۱۲۳۴۵۶۷۸۹٫٬", "0123456789.,")
_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def numbers_in(text):
    """همه‌ی عددهای متن، یکدست‌شده (ارقام فارسی→لاتین، جداکننده‌ی هزارگان حذف). فقط عددهای ≥ ۲ رقم یا اعشاری."""
    out = set()
    for m in _NUM.findall(str(text).translate(_P2A)):
        n = m.replace(",", "")
        if len(n.replace(".", "")) >= 2:
            out.add(n.rstrip("."))
    return out


def walk_strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for v in o.values():
            yield from walk_strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk_strings(v)


def ungrounded(result, digest_numbers):
    """عددهایی که در خروجی هست ولی در خلاصه‌ی جامع نیست (مشتق/حدس/جابه‌جاشده به کشور دیگر)."""
    body = {k: v for k, v in result.items() if k in ("headline", "summary", "priorities", "pause_or_deprioritize", "radar_picks", "market_signals")}
    bad = set()
    for s in walk_strings(body):
        bad |= numbers_in(s) - digest_numbers
    return sorted(bad)


def find_json(text):
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    raw = fence.group(1) if fence else text
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    return json.loads(m.group(0)) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    key = os.environ.get("GEMINI_API_KEY_BRAIN")
    if not key:
        print("[SKIP] GEMINI_API_KEY_BRAIN تنظیم نشده؛ توصیه‌ی هفته ساخته نشد (بدون خطا).")
        return

    out_path = os.path.join(BRAIN, "briefing.json")
    cur_version = None
    try:
        cur_version = json.load(open(os.path.join(BRAIN, "country_scores.json"), encoding="utf-8")).get("digest_version")
    except Exception:
        pass
    if not args.force and os.path.exists(out_path):
        try:
            prev = json.load(open(out_path, encoding="utf-8"))
            age = (datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(prev["generated_at"])).days
            if age < MIN_AGE_DAYS and prev.get("digest_version") == cur_version:
                print(f"[SKIP] آخرین توصیه {age} روز پیش و با همین نسخه‌ی خلاصه ({cur_version}) ساخته شده.")
                return
            if prev.get("digest_version") != cur_version:
                print(f"[INFO] نسخه‌ی خلاصه عوض شده ({prev.get('digest_version')} → {cur_version})؛ توصیه دوباره ساخته می‌شود.")
        except Exception:
            pass

    digest_path = os.path.join(BRAIN, "digest.md")
    if not os.path.exists(digest_path):
        raise SystemExit("data/brain/digest.md نیست؛ اول scripts/build_brain.py را اجرا کن.")
    digest = open(digest_path, encoding="utf-8").read()
    scores = json.load(open(os.path.join(BRAIN, "country_scores.json"), encoding="utf-8"))
    known = {c["country"] for c in scores["countries"]}
    radar = {c["country"] for c in json.load(open(os.path.join(BRAIN, "radar.json"), encoding="utf-8"))["candidates"]}

    from google import genai

    client = genai.Client(api_key=key)
    digest_numbers = numbers_in(digest)
    base_input = f"===== خلاصه‌ی جامع پلتفرم =====\n{digest}\n\nتوصیه‌ی هفته را به شکل JSON بده."
    feedback = ""
    result, last_err, best = None, None, None
    for attempt in range(1, 4):
        try:
            inter = client.interactions.create(model=MODEL, system_instruction=SYSTEM, input=base_input + feedback)
            result = find_json(inter.output_text)
            if result and result.get("priorities"):
                bad = ungrounded(result, digest_numbers)
                if best is None or len(bad) < len(best[1]):
                    best = (result, bad)
                if not bad:
                    break
                last_err = f"{len(bad)} عدد خارج از خلاصه‌ی جامع: {', '.join(bad[:12])}"
                feedback = (
                    f"\n\nتوجه: در تلاش قبلی این عددها در خلاصه‌ی جامع نبودند (مشتق/حدس/متعلق به کشور دیگر): {', '.join(bad)}. "
                    "هر جمله‌ای که این عددها را دارد اصلاح کن: فقط عددهای عیناً موجود در خلاصه‌ی جامع و متعلق به همان کشور؛ عدد محاسبه‌شده ننویس."
                )
            else:
                last_err = "خروجی JSON معتبر با priorities نبود"
        except Exception as e:  # noqa: BLE001 — خطای شبکه/سهمیه؛ چندبار تلاش می‌کنیم
            last_err = str(e)[:200]
        print(f"[RETRY] تلاش {attempt}: {last_err}")
        time.sleep(8 * attempt)

    if best is None:
        raise SystemExit(f"[FAIL] توصیه ساخته نشد: {last_err}")
    result, bad = best
    if bad:
        # بهترین تلاش ذخیره می‌شود ولی اعداد مشکوک برای بازبینی علامت می‌خورند
        result["_ungrounded_numbers"] = bad
        print(f"[WARN] {len(bad)} عدد بدون پشتوانه در خلاصه‌ی جامع باقی ماند: {', '.join(bad)}")

    # اعتبارسنجی: فقط کشورهایی که واقعاً در رتبه‌بندی/رادار هستند
    result["priorities"] = [p for p in result["priorities"] if p.get("country") in known]
    result["pause_or_deprioritize"] = [p for p in result.get("pause_or_deprioritize", []) if p.get("country") in known]
    result["radar_picks"] = [p for p in result.get("radar_picks", []) if p.get("country") in radar]
    if not result["priorities"]:
        raise SystemExit("[FAIL] هیچ کشور معتبری در priorities نبود؛ ذخیره نشد.")

    result["generated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    result["model"] = MODEL
    result["based_on_scores_at"] = scores.get("generated_at")
    result["digest_version"] = cur_version
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"[OK] توصیه‌ی هفته ذخیره شد: {len(result['priorities'])} کشور اولویت‌دار.")


if __name__ == "__main__":
    main()
