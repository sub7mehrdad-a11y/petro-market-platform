"""
مختصات شهرها/مرزهای داخلی ایران و مقاصد منطقه‌ای که توی کانال‌های اعلام بار
دیده می‌شن — برای محاسبه‌ی فاصله (و بعد نرخ به ازای تن-کیلومتر) بین دو نقطه‌ای
که واقعاً توی یک پست قیمت واقعی داشتن.

فقط نقاطی که با اطمینان مختصاتشون رو می‌دونیم این‌جان — اگه اسم شهر/مرزی توی
یک پست بود ولی این‌جا نبود، اون پست همچنان به‌عنوان داده‌ی خام ذخیره می‌شه،
فقط نرخ به‌ازای کیلومترش محاسبه نمی‌شه (حدس نمی‌زنیم).

خودِ لیست مکان‌ها توی data/transit_places.json نگه‌داری می‌شه (نه این‌جا) چون
هم این اسکریپت پایتون بهش نیاز داره هم برآوردگر سمت کلاینت توی سایت (Next.js)
— تا دو نسخه‌ی جدا از هم دِریفت نکنن.
"""

import json
import math
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
PLACES_FILE = os.path.join(DATA_DIR, "transit_places.json")

with open(PLACES_FILE, "r", encoding="utf-8") as f:
    _raw = json.load(f)

# {نام رایج فارسی: (lat, lon)}
PLACES = {name: tuple(coords) for name, coords in _raw.items()}


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def find_place(name: str):
    """جست‌وجوی تقریبی — چون اسم مبدأ/مقصد استخراج‌شده توسط AI ممکنه دقیقاً
    با کلید دیکشنری یکی نباشه (مثلاً «مرز خسروی» در برابر «خسروی»)."""
    if not name:
        return None
    name = name.strip()
    if name in PLACES:
        return PLACES[name]
    for key, coords in PLACES.items():
        if key in name or name in key:
            return coords
    return None


def distance_between_places(origin: str, destination: str):
    p1 = find_place(origin)
    p2 = find_place(destination)
    if not p1 or not p2:
        return None
    return haversine_km(*p1, *p2)
