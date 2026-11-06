"""
منطق خالص (بدون خواندن/نوشتن فایل) «مغز پلتفرم» — توابعی که اصلاحات فوری مرحله‌ی ۱ (بخش ۱۵-۵ سند پروتکل) را اجرا می‌کنند.
جدا از build_brain.py نوشته شده تا بدون داده‌ی واقعی و بدون اجرای کل اسکریپت قابل‌آزمون باشد (scripts/test_brain_fixes.py).

اصلاح‌ها:
  ۱ و ۲  سهم تأمین‌کنندگان (از تفکیک گزارش، سپس آمار آینه، سپس متن شرکای پرونده) و امتیاز رقابت با رقبای تنظیم‌شده (ترکیه/چین/روسیه)
  ۴      ارزش واحد واردات مشکوک (انحراف زیاد از همتاها) و نبودن مقایسه‌ی آن با قیمت فوب
  ۵      تاریخ نمایشگاه/رویداد: پیش‌رو یا گذشته (پیشنهاد فقط برای پیش‌رو)
  ۶      برچسب «کم‌اظهار» و سال شمسی برای آمار صادرات گمرک ایران
  ۷      دوره‌ی استاندارد و کهنگی قیمت‌ها (June 2026 / 2026-06 / Q2 2026 / 2026-Q2 → یک قالب)
"""

import datetime
import re
import statistics

_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٫", "01234567890123456789.")


def ascii_digits(s):
    return str(s or "").translate(_DIGITS)


# ----------------------------------------------------------------------------- ۱ و ۲: سهم تأمین‌کنندگان و رقابت
_SHARE_AFTER = re.compile(r"سهم(?:\s+[^\s\d(]+){0,2}\s*([0-9]+(?:\.[0-9]+)?)\s*٪")  # «سهم ۷۸.۷٪» / «سهم بازار ۴۸.۵٪»
_SHARE_BEFORE = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*٪\s*سهم")  # «۵۳٫۳٪ سهم ارزشی»


def parse_share_from_note(note):
    """درصد سهم را از یک جمله‌ی کوتاه برمی‌دارد (فقط وقتی کنار آن کلمه‌ی «سهم» باشد). اگر نبود None.
    «بدون سهم ثبت‌شده (۰٪)» و درصدهای رشد/تعرفه را نمی‌گیرد."""
    t = ascii_digits(note)
    cands = []
    for rx in (_SHARE_AFTER, _SHARE_BEFORE):
        m = rx.search(t)
        if m:
            cands.append((m.start(), float(m.group(1))))
    if not cands:
        return None
    v = min(cands)[1]
    return v if 0 < v <= 100 else None


def _from_breakdown(rb):
    sup = (rb or {}).get("suppliers") or []
    if not sup:
        return None
    total = rb.get("total_tons") or sum(s.get("tons", 0) or 0 for s in sup)
    out = {}
    for s in sup:
        if s.get("share_pct") is not None:
            out[s["country"]] = s["share_pct"] / 100
        elif s.get("tons") is not None and total:
            out[s["country"]] = s["tons"] / total
    return out or None


def _from_mirror(market):
    years = (market or {}).get("years") or []
    for y in reversed(years):
        sup = y.get("suppliers") or []
        out = {s["country_fa"]: s["share_pct"] / 100 for s in sup if s.get("country_fa") and s.get("share_pct") is not None}
        if out:
            return out, y.get("year")
    return None, None


def _from_partner_notes(prof):
    out = {}
    for p in prof.get("top_trade_partners") or []:
        v = parse_share_from_note(p.get("note"))
        if v is not None:
            out[p["country"]] = v / 100
    return out or None


def resolve_supplier_shares(prof, mirror_market=None):
    """(سهم‌ها {کشور: کسر}، برچسب منبع) یا (None, None). ترتیب اعتماد:
    تفکیک ساخت‌یافته‌ی گزارش (تن) > آمار آینه‌ی WITS (سهم ارزشی آخرین سال) > درصدِ نوشته‌شده در متن شرکای پرونده."""
    s = _from_breakdown(prof.get("report_import_breakdown"))
    if s:
        return s, "تفکیک گزارش اختصاصی"
    s, year = _from_mirror(mirror_market)
    if s:
        return s, f"آمار آینه‌ی WITS {year} (سهم ارزشی)"
    s = _from_partner_notes(prof)
    if s:
        return s, "درصد نوشته‌شده در متن شرکای پرونده"
    return None, None


def competition_score(shares, rivals, country=None, iran="ایران"):
    """امتیاز رقابت ۰..۱: ۱ − سهم رقبا + ۰٫۵ × سهم ایران. رقیبِ خود کشور (مثلاً روسیه برای بازار روسیه) از فهرست کنار می‌رود
    چون سهم «تولید داخلی» در این فرمول نیست (در یادداشت برچسب می‌خورد). برمی‌گرداند (score, rivals_share, iran_share)."""
    rv = [r for r in rivals if r != country]
    rs = sum(shares.get(r, 0) for r in rv)
    ir = shares.get(iran, 0)
    return max(0.0, min(1.0, 1 - rs + 0.5 * ir)), rs, ir


# ----------------------------------------------------------------------------- ۴: ارزش واحد مشکوک
def median(values):
    vals = [v for v in values if v is not None]
    return statistics.median(vals) if vals else None


def unit_value_suspect(uv, peers, ratio):
    """ارزش واحدی که از میانه‌ی همتاها بیش از ratio برابر بیشتر یا کمتر باشد «مشکوک» است (نه لزوماً غلط؛ نیازمند تأیید انسانی)."""
    med = median(peers)
    if uv is None or med is None or med <= 0:
        return False
    return uv > ratio * med or uv < med / ratio


# ----------------------------------------------------------------------------- ۵: تاریخ نمایشگاه
_MONTHS_FA = {
    "ژانویه": 1, "فوریه": 2, "مارس": 3, "آوریل": 4, "مه": 5, "می": 5, "ژوئن": 6, "ژوئیه": 7, "ژویه": 7, "جولای": 7,
    "اوت": 8, "آگوست": 8, "سپتامبر": 9, "اکتبر": 10, "نوامبر": 11, "دسامبر": 12,
}
_FA = "؀-ۿ"
_TOKEN = re.compile(
    r"(?<!\d)(20\d{2})(?!\d)|(?<!\d)(\d{1,2})(?!\d)|(?<![" + _FA + r"])(" + "|".join(sorted(_MONTHS_FA, key=len, reverse=True)) + r")(?![" + _FA + r"])"
)


def parse_event_end(text):
    """تاریخ پایان رویداد از متن فارسی («۱۵ تا ۱۷ جولای ۲۰۲۶»، «اوت (۴–۶ اوت ۲۰۲۶)»، «جولای ۲۰۲۶»...) یا None اگر سال/ماه روشن نیست."""
    t = ascii_digits(text)
    t = re.sub(r"\([^)]*دوره اخیر[^)]*\)", " ", t)  # «(دوره اخیر: ...)» مربوط به برگزاری قبلی است
    inner = re.search(r"\(([^)]*\d[^)]*)\)", t)
    if inner:
        t = inner.group(1)
    year = None
    pending, pairs, last_month = [], [], None
    for m in _TOKEN.finditer(t):
        if m.group(1):
            year = int(m.group(1))
        elif m.group(2):
            pending.append(int(m.group(2)))
        else:
            mon = _MONTHS_FA[m.group(3)]
            last_month = mon
            pairs += [(d, mon) for d in pending]
            pending = []
    if year is None or last_month is None:
        return None
    if not pairs:  # فقط ماه و سال → پایان ماه
        nxt = datetime.date(year + (last_month == 12), (last_month % 12) + 1, 1)
        return nxt - datetime.timedelta(days=1)
    # سال هر جفت: آخری سال داده‌شده؛ اگر ماه قبلی بزرگ‌تر از بعدی بود (دسامبر→ژانویه) یک سال قبل
    ends, y = [], year
    for i in range(len(pairs) - 1, -1, -1):
        d, mon = pairs[i]
        if i < len(pairs) - 1 and mon > pairs[i + 1][1]:
            y -= 1
        try:
            ends.append(datetime.date(y, mon, d))
        except ValueError:
            return None
    return max(ends)


def event_status(text, today):
    """('upcoming'|'past'|'unknown', تاریخ پایان). امروز = هنوز برگزار می‌شود (پیش‌رو)."""
    end = parse_event_end(text)
    if end is None:
        return "unknown", None
    return ("upcoming" if end >= today else "past"), end


# ----------------------------------------------------------------------------- ۶: صادرات گمرک ایران
def shamsi_span(year_fa):
    """سال شمسی 1404 ← ('2025-03-21', '2026-03-20') (تقریبی؛ فروردین تا اسفند)."""
    y = int(year_fa)
    return f"{y + 621}-03-21", f"{y + 622}-03-20"


# ----------------------------------------------------------------------------- ۷: دوره و کهنگی قیمت
_MONTHS_EN = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}


def _eom(y, m):
    nxt = datetime.date(y + (m == 12), (m % 12) + 1, 1)
    return nxt - datetime.timedelta(days=1)


def period_of(reported):
    """«June 2026» | «2026-06» | «Q2 2026» | «2026-Q2» | «2026-09-07» | «September 2026» ← (نوع، برچسب استاندارد، تاریخ پایان دوره).
    نوع ∈ month|quarter|day|unknown."""
    s = str(reported or "").strip().lower()
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        d = datetime.date(int(m[1]), int(m[2]), int(m[3]))
        return "day", d.isoformat(), d
    m = re.fullmatch(r"(\d{4})-(\d{2})", s)
    if m and 1 <= int(m[2]) <= 12:
        y, mo = int(m[1]), int(m[2])
        return "month", f"{y}-{mo:02d}", _eom(y, mo)
    m = re.fullmatch(r"q([1-4])\s*(\d{4})", s) or re.fullmatch(r"(\d{4})-q([1-4])", s)
    if m:
        a, b = m.groups()
        q, y = (int(a), int(b)) if len(a) == 1 else (int(b), int(a))
        return "quarter", f"{y}-Q{q}", _eom(y, q * 3)
    m = re.fullmatch(r"([a-z]+)\s+(\d{4})", s)
    if m and m[1] in _MONTHS_EN:
        y, mo = int(m[2]), _MONTHS_EN[m[1]]
        return "month", f"{y}-{mo:02d}", _eom(y, mo)
    return "unknown", None, None


def staleness(reported, today, limits):
    """(برچسب دوره، سن به روز از پایان دوره، آیا کهنه است، نوع). limits: {month, quarter, day} به روز. دوره‌ی ناشناخته → کهنه نامشخص (None)."""
    kind, label, end = period_of(reported)
    if end is None:
        return None, None, None, "unknown"
    age = (today - end).days
    return label, age, age > limits.get(kind, limits.get("month", 75)), kind
