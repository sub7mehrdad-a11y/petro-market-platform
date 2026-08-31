"""
لودر سبک .env — بدون هیچ وابستگی خارجی (نه python-dotenv، چیزی به requirements
اضافه نمی‌کنه).

چرا لازم بود: با وجود اینکه README اجرای محلی رو با فایل .env توضیح می‌ده، هیچ‌کدام
از اسکریپت‌های پایتون پروژه واقعاً اون فایل رو نمی‌خوندن (فقط os.environ.get
می‌خوندن) — یعنی طبق دستورالعمل خود پروژه، اجرای محلی کلید رو پیدا نمی‌کرد مگر
کاربر دستی export/set می‌کرد. این تابع رو در ابتدای اسکریپت صدا بزن.
"""

import os


def load_env(path: str | None = None) -> None:
    """
    مقادیر .env رو توی os.environ می‌ذاره — فقط برای کلیدهایی که از قبل ست
    نشده‌ن (setdefault)، تا متغیر محیطی واقعی (مثلاً روی GitHub Actions) همیشه
    اولویت داشته باشه و این فایل چیزی رو override نکنه.
    """
    path = path or os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)
