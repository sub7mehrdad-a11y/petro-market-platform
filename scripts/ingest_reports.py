"""
ورود گزارش‌های Word/PDF پوشه‌ی «گزارش/» به مخزن گزارش‌های سایت.

دو نوع گزارش داریم (طبق تصمیم مدیریتی پروژه):
  - "detailed" (گزارش مفصل، مثل گزارش برزیل): متن کامل و طولانیه. فقط با
    فرمت/جدول‌بندی مرتب بایگانی می‌شه — بدون دخالت هوش مصنوعی در محتوا، چون
    محتوا باید عیناً همون چیزی بمونه که نویسنده نوشته.
  - "summary" (گزارش مدیریتی/خلاصه، مثل گزارش کنیا): همونیه که به مدیران داده
    می‌شه. با Gemini پردازش می‌شه تا آمار کلیدی و نمودارها ازش استخراج بشه —
    ولی متن هر بخش عیناً از سند اصلی نگه داشته می‌شه (خلاصه/بازنویسی نمی‌شه؛
    قانون «کپی نکن» فقط برای اخبار/محتوای شخص ثالثه، این گزارش خودمونه).

برای اضافه‌کردن گزارش جدید: یک ورودی به REPORTS اضافه کن.

خروجی:
  - reports/parsed/<id>.json   (نسخه‌ی ساختاریافته برای رندر هوشمند وب‌سایت)
  - reports/<کشور>/<فایل اصلی>  (فایل اصلی، برای دانلود)
  - reports/manifest.json به‌روزرسانی می‌شه
"""

import os
import re
import sys
import json
import shutil
from datetime import datetime, timezone

import pdfplumber
from google import genai

sys.path.insert(0, os.path.dirname(__file__))
from docx_blocks import extract_blocks, extract_plain_text

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
SRC_DIR = os.path.join(BASE_DIR, "گزارش")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
PARSED_DIR = os.path.join(REPORTS_DIR, "parsed")
MANIFEST_FILE = os.path.join(REPORTS_DIR, "manifest.json")

GEMINI_MODEL = "gemini-3.6-flash"

REPORTS = [
    {
        "file": "گزارش_مدیریتی_بازار_برزیل_بروزرسانی_۲۰۲۵.docx",
        "country": "برزیل",
        "type": "detailed",
    },
    {
        "file": "گزارش استراتژِی بازایابی عراق.docx",
        "country": "عراق",
        "type": "detailed",
    },
    {
        "file": "گزارش مدیریتی اردن.docx",
        "country": "اردن",
        "type": "summary",
    },
    {
        "file": "گزارش تحلیلی بازار واردات جوش شیرین کنیا (HS 283630).docx.pdf",
        "country": "کنیا",
        "type": "summary",
    },
    {
        "file": "گزارش_خلاصه_بازار_جوش_شیرین_برزیل.docx",
        "country": "برزیل",
        "type": "summary",
    },
    {
        "file": "turkey-baking-soda-market-v2.docx",
        "country": "ترکیه",
        "type": "summary",
    },
    {
        "file": "گزراش کامل ترکیه جمینای.docx",
        "country": "ترکیه",
        "type": "detailed",
    },
    {
        "file": "گزارش تحقیق بازار سوریه.docx",
        "country": "سوریه",
        "type": "summary",
    },
    {
        "file": "گزارش_خلاصه_بازار_جوش_شیرین_ارمنستان.docx",
        "country": "ارمنستان",
        "type": "summary",
    },
    {
        "file": "گزارش_تحلیلی_بازار_جوش_شیرین_ارمنستان.docx",
        "country": "ارمنستان",
        "type": "detailed",
    },
    {
        # گزارش پس‌زمینه‌ی جهانی (نه یک کشور خاص) — منابع باز اینترنتی برای
        # رصد قیمت سودا اش/جوش شیرین و شاخص‌های ترانزیت. country="جهانی"
        # عمداً از getCountries()/enrich_countries.py مستثنا شده چون یک
        # کشور واقعی نیست.
        "file": "گزارش پس‌زمینه بازار جهانی سودا اش.docx",
        "country": "جهانی",
        "type": "detailed",
    },
]

PRODUCT = "جوش شیرین"

SUMMARY_EXTRACTION_SYSTEM_PROMPT = """
تو یک دستیار ساختاردهی گزارش هستی. من متن کامل یک گزارش مدیریتی (خودِ متعلق به
شرکت ما، نه محتوای شخص ثالث) رو می‌دم. باید همین متن رو به یک ساختار JSON
تبدیل کنی — **بدون خلاصه‌سازی، بازنویسی یا حذف محتوا**. متن هر بخش باید عیناً
از سند اصلی باشه (فقط می‌تونی ایموجی‌های نموداری مثل 🟩🟦 رو حذف کنی چون به‌جاش
نمودار واقعی می‌سازیم).

ساختار خروجی (فقط همین JSON، بدون markdown fence، بدون توضیح اضافه):
{
  "title": "عنوان گزارش (از خط اول سند)",
  "key_stats": [
    {"label": "مثلاً حجم واردات", "value": "۱۰,۷۲۵", "unit": "تن"}
  ],
  "sections": [
    {"heading": "عنوان بخش (اگر توی سند مشخص بود)", "body": "متن کامل و بدون تغییر همون بخش"}
  ],
  "charts": [
    {
      "type": "bar",
      "title": "عنوان نمودار",
      "unit": "دلار/تن",
      "categories": ["برچسب۱", "برچسب۲"],
      "series": [{"name": "نام سری", "values": [عدد۱, عدد۲]}]
    }
  ]
}

قوانین:
- هر عددی که توی متن به‌صورت مقایسه‌ای اومده (چند مورد با همون واحد، مثل مقایسه‌ی
  قیمت چند تأمین‌کننده یا روند چند سال) رو به یک chart تبدیل کن.
- key_stats فقط برای آمار تکی مهم (نه مقایسه‌ای) استفاده کن.
- هیچ عددی رو از خودت اختراع نکن؛ فقط چیزی که توی متن هست.
"""


def extract_json_object(text: str) -> dict:
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    raw = fence_match.group(1) if fence_match else text
    obj_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not obj_match:
        raise ValueError("پاسخ مدل شامل JSON object نبود:\n" + text[:500])
    return json.loads(obj_match.group(0))


def extract_pdf_text(path: str) -> str:
    lines = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines.append(text)
    return "\n".join(lines)


def slugify_id(filename: str, prefix: str) -> str:
    stem = os.path.splitext(os.path.splitext(filename)[0])[0]  # handles .docx.pdf هم
    stem = re.sub(r"[^\w؀-ۿ]+", "-", stem).strip("-")
    return f"{prefix}-{stem}"[:80]


def build_detailed_report(path: str) -> dict:
    blocks = extract_blocks(path)
    title = None
    if blocks and blocks[0]["type"] == "heading":
        title = blocks.pop(0)["text"]
    elif blocks and blocks[0]["type"] == "paragraph" and len(blocks[0]["text"]) <= 160:
        # بعضی اسناد با یک پاراگراف عنوان‌گونه شروع می‌شن نه heading واقعی؛
        # اگه کوتاه بود همون رو عنوان بگیر تا اسم فایل به‌عنوان عنوان نیفته.
        title = blocks.pop(0)["text"]
    return {"title": title, "blocks": blocks}


def build_summary_report(path: str, is_pdf: bool, client: genai.Client) -> dict:
    text = extract_pdf_text(path) if is_pdf else extract_plain_text(path)
    interaction = client.interactions.create(
        model=GEMINI_MODEL,
        system_instruction=SUMMARY_EXTRACTION_SYSTEM_PROMPT,
        input=text,
    )
    return extract_json_object(interaction.output_text)


def load_manifest():
    if os.path.exists(MANIFEST_FILE):
        with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_manifest(manifest):
    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


def main():
    client = None
    needs_ai = any(r["type"] == "summary" for r in REPORTS)
    if needs_ai:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise SystemExit("GEMINI_API_KEY تنظیم نشده — برای گزارش‌های خلاصه لازمه.")
        client = genai.Client(api_key=api_key)

    os.makedirs(PARSED_DIR, exist_ok=True)
    manifest = load_manifest()
    manifest = [m for m in manifest if not m.get("id", "").startswith("report-")]  # اجرای دوباره = جایگزینی

    for entry in REPORTS:
        src_path = os.path.join(SRC_DIR, entry["file"])
        if not os.path.exists(src_path):
            print(f"[WARN] فایل پیدا نشد: {src_path}")
            continue

        report_id = slugify_id(entry["file"], "report")
        is_pdf = entry["file"].lower().endswith(".pdf")
        parsed_path = os.path.join(PARSED_DIR, f"{report_id}.json")

        if entry["type"] == "detailed":
            if is_pdf:
                print(f"[WARN] {entry['file']}: نوع 'detailed' برای PDF پشتیبانی نمی‌شه، رد شد.")
                continue
            # قطعی و بدون AI‌ست، پس همیشه امن برای اجرای دوباره‌ست (فقط اگه
            # خود فایل docx عوض بشه چیزی تغییر می‌کنه).
            parsed = build_detailed_report(src_path)
            title = parsed["title"] or entry["file"]
        elif os.path.exists(parsed_path):
            # گزارش‌های خلاصه با Gemini غیرقطعی‌ان — اجرای دوباره ممکنه محتوای
            # قبلاً درست رو با یک خروجی متفاوت (یا در صورت خطای سهمیه، بدتر)
            # جایگزین کنه. اگه قبلاً ساخته شده، دوباره لمسش نمی‌کنیم؛ برای
            # بازسازی عمدی، فایل parsed را دستی حذف کنید.
            with open(parsed_path, "r", encoding="utf-8") as f:
                parsed = json.load(f)
            title = parsed.get("title") or entry["file"]
            print(f"[SKIP] {entry['country']} / {entry['file']}: قبلاً ساخته شده (خلاصه، غیرقطعی)")
        else:
            parsed = build_summary_report(src_path, is_pdf, client)
            title = parsed.get("title") or entry["file"]

        parsed_record = {
            "id": report_id,
            "title": title,
            "country": entry["country"],
            "product": PRODUCT,
            "report_type": entry["type"],
            **parsed,
        }
        with open(parsed_path, "w", encoding="utf-8") as f:
            json.dump(parsed_record, f, ensure_ascii=False, indent=2)

        country_dir = os.path.join(REPORTS_DIR, entry["country"])
        os.makedirs(country_dir, exist_ok=True)
        dest_filename = entry["file"]
        dest_path = os.path.join(country_dir, dest_filename)
        shutil.copyfile(src_path, dest_path)

        manifest.append({
            "id": report_id,
            "title": title,
            "country": entry["country"],
            "product": PRODUCT,
            "report_type": entry["type"],
            "original_filename": dest_filename,
            "relative_path": os.path.join(entry["country"], dest_filename).replace("\\", "/"),
            "size_bytes": os.path.getsize(dest_path),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "parsed_path": f"parsed/{report_id}.json",
        })

        print(f"[OK] {entry['country']} / {entry['type']}: {title}")

    save_manifest(manifest)
    print(f"\n[DONE] {len(manifest)} گزارش در manifest ثبت شد.")


if __name__ == "__main__":
    main()
