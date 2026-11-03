"""
لایه‌ی اول «مغز پلتفرم»: همه‌ی داده‌های پلتفرم را می‌خواند، کشورها را با فرمول شفاف امتیاز می‌دهد و یک
«خلاصه‌ی جامع» (digest) می‌سازد که مدل هوش مصنوعی یک‌جا می‌خواند.

هیچ مدل هوش مصنوعی‌ای اینجا کار نمی‌کند: اعداد و رتبه‌ها با کد حساب می‌شوند تا قابل بررسی باشند و مدل فقط
روی آن‌ها استدلال کند (scripts/brain_briefing.py و /api/ask).

ورودی: data/*.json  (+ data/brain/scoring_config.json برای وزن‌ها)
خروجی (data/brain/):
  - country_scores.json : رتبه‌بندی کشورهای دارای پرونده + مؤلفه‌های امتیاز و دلیل‌های خودکار
  - radar.json          : کشورهای بدون پرونده که از روی آمار Trade Map ارزش تحقیق دارند
  - digest.md           : خلاصه‌ی جامع فارسی از کل پلتفرم (قیمت‌ها، رقبا، کشورها، شرکت‌ها، نمایشگاه‌ها، اخبار)

داده‌ی فروش تیم بازرگانی (محرمانه) هرگز اینجا نیست: مخزن عمومی است و آن داده فقط روی دیسک سرور می‌ماند
(web/lib/sales*.js).

اجرا:  python scripts/build_brain.py
"""

import collections
import datetime
import json
import math
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
OUT = os.path.join(DATA, "brain")


def load(name, default=None):
    p = os.path.join(DATA, name)
    if not os.path.exists(p):
        return default
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def first_list(obj):
    if isinstance(obj, list):
        return obj
    if isinstance(obj, dict):
        for v in obj.values():
            if isinstance(v, list):
                return v
    return []


def clamp01(x):
    return max(0.0, min(1.0, x))


def lin(x, lo, hi):
    return clamp01((x - lo) / (hi - lo)) if hi != lo else 0.0


def log_scale(x, lo, hi):
    if x is None or x <= 0:
        return 0.0
    return clamp01((math.log(x) - math.log(lo)) / (math.log(hi) - math.log(lo)))


def haversine(a, b):
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def trunc(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def fmt(n, digits=0):
    if n is None:
        return "—"
    return f"{n:,.{digits}f}"


# ---------------------------------------------------------------- بارگذاری
cfg = load("brain/scoring_config.json")
profiles = load("country_profiles.json", {})
trade_map = load("trade_map_2025.json", {})
companies = load("companies.json", [])
sent_log = load("email_outreach_sent.json", [])
exhibitions = load("exhibitions.json", [])
competitors = load("competitors.json", {})
unions = (load("trade_unions.json", {}) or {}).get("unions", [])
if isinstance(unions, dict):  # شناسه → اتحادیه
    unions = [{"id": k, **v} for k, v in unions.items()]
price_days = first_list(load("price_history.json", []))
news = first_list(load("news_analysis_log.json", []))
transit_days = first_list(load("transit_log.json", []))
turkey_watch = first_list(load("turkey_watch_log.json", []))
china_watch = first_list(load("china_watch_log.json", []))
iran_exports = load("iran_exports.json", {})
per_capita = load("per_capita_consumption.json", {})
exh_reports = load("exhibition_reports.json", [])
reports_manifest = (
    json.load(open(os.path.join(BASE, "reports", "manifest.json"), encoding="utf-8"))
    if os.path.exists(os.path.join(BASE, "reports", "manifest.json"))
    else []
)

TODAY = datetime.date.today()


# ---------------------------------------------------------------- آمار شرکت‌ها و ارسال
by_country_companies = collections.defaultdict(list)
for c in companies:
    by_country_companies[c.get("country")].append(c)
email_to_country = {(c.get("email") or "").lower(): c.get("country") for c in companies if c.get("email")}
id_to_country = {c["id"]: c.get("country") for c in companies}
sent_by_country = collections.Counter()
for s in sent_log:
    ctry = id_to_country.get(s.get("company_id")) or email_to_country.get((s.get("email") or "").lower()) or s.get("country")
    if ctry:
        sent_by_country[ctry] += 1


def pool_stats(country):
    rows = by_country_companies.get(country, [])
    grades = collections.Counter((c.get("target_grade") or "نامشخص").split("–")[0].strip() for c in rows)
    return {
        "companies": len(rows),
        "with_email": sum(1 for c in rows if c.get("email")),
        "grades": grades.most_common(4),
        "sent": sent_by_country.get(country, 0),
    }


# ---------------------------------------------------------------- نگاشت اتحادیه‌ها
unions_of = collections.defaultdict(list)
for u in unions:
    for m in u.get("members", []):
        unions_of[m].append(u)


# ---------------------------------------------------------------- معیارهای هر کشور
def market_tons(prof, tm):
    rs = prof.get("real_trade_stats") or {}
    if rs.get("imports_tons"):
        return rs["imports_tons"], "گزارش اختصاصی"
    rb = prof.get("report_import_breakdown") or {}
    if rb.get("total_tons"):
        return rb["total_tons"], "گزارش اختصاصی"
    tv = prof.get("total_import_volume") or {}
    if tv.get("value") and "تن" in str(tv.get("unit", "")):
        return tv["value"], "پروفایل"
    q = ((tm or {}).get("imports_2025") or {}).get("quantity")
    if q:
        return q, "Trade Map"
    return None, None


def iran_distance(prof):
    d = (prof.get("distances_km") or {}).get("ایران")
    if d:
        return d, "فاصله‌ی ثبت‌شده"
    port = prof.get("port") or {}
    if port.get("lat") is not None:
        best = min(haversine((port["lat"], port["lon"]), tuple(ll)) for ll in cfg["iran_ports_latlon"].values())
        return round(best), "برآورد هوایی تا نزدیک‌ترین مرز/بندر ایران"
    return None, None


def supplier_shares(prof):
    rb = prof.get("report_import_breakdown") or {}
    sup = rb.get("suppliers") or []
    total = rb.get("total_tons") or sum(s.get("tons", 0) for s in sup)
    if not sup:
        return None
    out = {}
    for s in sup:
        if s.get("share_pct") is not None:
            out[s["country"]] = s["share_pct"] / 100
        elif s.get("tons") is not None and total:
            out[s["country"]] = s["tons"] / total
    return out or None


def union_score(country):
    best, label = cfg["union_bonus"]["default"], None
    for u in unions_of.get(country, []):
        st = u.get("iran_status")
        v = cfg["union_bonus"].get(st, cfg["union_bonus"]["default"])
        if v > best:
            best, label = v, u.get("short_fa") or u.get("name_fa")
    return best, label


def score_country(country, prof):
    tm = trade_map.get(country) or {}
    imp = tm.get("imports_2025") or {}
    w = cfg["weights"]
    comp = {}
    notes = {}

    tons, tsrc = market_tons(prof, tm)
    comp["market_size"] = log_scale(tons, cfg["market_size"]["log_min_tons"], cfg["market_size"]["log_max_tons"])
    notes["market_size"] = f"واردات حدود {fmt(tons)} تن ({tsrc})" if tons else "حجم واردات نامشخص"

    uv = imp.get("unit_value_usd")
    pr = cfg["price_room"]
    comp["price_room"] = lin(uv, pr["unit_value_min"], pr["unit_value_max"]) if uv else pr["neutral_when_missing"]
    notes["price_room"] = f"ارزش واحد واردات {fmt(uv)} دلار/تن" if uv else "ارزش واحد نامشخص (امتیاز خنثی)"

    shares = supplier_shares(prof)
    if shares is None:
        comp["competition"] = 0.5
        notes["competition"] = "سهم تأمین‌کنندگان نامشخص (امتیاز خنثی)"
    else:
        rivals = sum(shares.get(k, 0) for k in ("ترکیه", "چین"))
        iran = shares.get("ایران", 0)
        comp["competition"] = clamp01(1 - rivals + 0.5 * iran)
        notes["competition"] = f"سهم ترکیه+چین {rivals * 100:.0f}٪" + (f"، سهم ایران {iran * 100:.0f}٪" if iran else "")

    km, ksrc = iran_distance(prof)
    comp["proximity"] = clamp01(1 - km / cfg["proximity"]["max_km"]) if km is not None else 0.3
    notes["proximity"] = (f"{fmt(km)} کیلومتر از ایران ({ksrc})" if km is not None else "فاصله نامشخص")

    g = imp.get("growth_qty_5y_pct")
    gc = cfg["growth"]
    comp["growth"] = lin(g, gc["min_pct"], gc["max_pct"]) if g is not None else gc["neutral_when_missing"]
    notes["growth"] = f"رشد ۵‌ساله‌ی حجم واردات {g:+.0f}٪" if g is not None else "رشد نامشخص"

    tar = imp.get("avg_tariff_pct")
    us, ulabel = union_score(country)
    tar_score = clamp01(1 - tar / cfg["tariff"]["max_pct"]) if tar is not None else 0.5
    comp["tariff_and_union"] = 0.6 * tar_score + 0.4 * us
    notes["tariff_and_union"] = (f"تعرفه‌ی متوسط {tar}٪" if tar is not None else "تعرفه نامشخص") + (f"؛ عضو {ulabel}" if ulabel else "")

    pool = len(by_country_companies.get(country, []))
    pc = cfg["company_pool"]
    comp["company_pool"] = lin(pool, pc["log_min"], pc["log_max"]) if pool else 0.0
    notes["company_pool"] = f"{pool} شرکت در بانک"

    total = sum(comp[k] * w[k] for k in w) * 100
    return round(total, 1), comp, notes, {"tons": tons, "km": km, "unit_value": uv, "shares": shares}


LABEL = {
    "market_size": "بازار بزرگ", "price_room": "قیمت واردات بالا (حاشیه‌ی قیمتی)", "competition": "رقابت کم",
    "proximity": "نزدیک به ایران", "growth": "بازار رو به رشد", "tariff_and_union": "تعرفه/توافق تجاری مناسب",
    "company_pool": "بانک شرکت‌های غنی",
}
WEAK = {
    "market_size": "بازار کوچک", "price_room": "قیمت واردات پایین", "competition": "رقابت شدید ترکیه/چین",
    "proximity": "دور از ایران", "growth": "رشد کند", "tariff_and_union": "تعرفه/موانع تجاری",
    "company_pool": "بانک شرکت‌ها کم‌عمق",
}


def build_scores():
    rows = []
    for country, prof in profiles.items():
        if country in cfg["exclude_from_ranking"]:
            continue
        score, comp, notes, raw = score_country(country, prof)
        order = sorted(comp, key=lambda k: comp[k] * cfg["weights"][k], reverse=True)
        strengths = [LABEL[k] for k in order[:3] if comp[k] >= 0.6]
        weak = [WEAK[k] for k in sorted(comp, key=lambda k: comp[k])[:2] if comp[k] < 0.4]
        rows.append({
            "country": country, "score": score,
            "tier": "A" if score >= cfg["tier_thresholds"]["A"] else ("B" if score >= cfg["tier_thresholds"]["B"] else "C"),
            "components": {k: round(v, 2) for k, v in comp.items()}, "notes": notes,
            "strengths": strengths, "weaknesses": weak,
            "raw": {"import_tons": raw["tons"], "distance_km": raw["km"], "unit_value_usd": raw["unit_value"]},
            "pool": pool_stats(country),
        })
    rows.sort(key=lambda r: r["score"], reverse=True)
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return rows


def build_radar(scored):
    known = set(profiles)
    rc = cfg["radar"]
    out = []
    for name, t in trade_map.items():
        if name in known:
            continue
        imp = t.get("imports_2025") or {}
        q = imp.get("quantity")
        if not q or q < rc["min_import_tons"] or (imp.get("quantity_unit") or "").lower() != "tons":
            continue
        g = imp.get("growth_qty_5y_pct")
        uv = imp.get("unit_value_usd")
        s = (
            0.45 * log_scale(q, cfg["market_size"]["log_min_tons"], cfg["market_size"]["log_max_tons"])
            + 0.20 * (lin(g, cfg["growth"]["min_pct"], cfg["growth"]["max_pct"]) if g is not None else cfg["growth"]["neutral_when_missing"])
            + 0.20 * (lin(uv, cfg["price_room"]["unit_value_min"], cfg["price_room"]["unit_value_max"]) if uv else cfg["price_room"]["neutral_when_missing"])
            + 0.15 * (clamp01(1 - imp["avg_tariff_pct"] / cfg["tariff"]["max_pct"]) if imp.get("avg_tariff_pct") is not None else 0.5)
        ) * 100
        out.append({
            "country": name, "name_en": t.get("name_en"), "score": round(s, 1), "import_tons": q,
            "unit_value_usd": uv, "growth_5y_pct": g, "avg_tariff_pct": imp.get("avg_tariff_pct"),
            "companies_in_bank": len(by_country_companies.get(name, [])),
        })
    out.sort(key=lambda r: r["score"], reverse=True)
    return out[: rc["top_n"]]


# ---------------------------------------------------------------- متن خلاصه‌ی جامع
def price_section():
    if not price_days:
        return ["(داده‌ی قیمت موجود نیست)"]
    latest = price_days[-1]
    lines = [f"آخرین جمع‌آوری: {latest.get('date')}"]
    # روند: مقدار هر (کشور، نوع قیمت، محصول) نسبت به قدیمی‌ترین مقدار ثبت‌شده در ~۳۰ روز اخیر
    old = {}
    cutoff = (TODAY - datetime.timedelta(days=35)).isoformat()
    for day in price_days:
        if day.get("date", "") >= cutoff:
            for r in day.get("records", []):
                if r.get("value") is not None:
                    old.setdefault((r["product"], r["country_or_region"], r["price_type"]), r["value"])
    for r in latest.get("records", []):
        if r.get("value") is None:
            continue
        k = (r["product"], r["country_or_region"], r["price_type"])
        trend = ""
        if k in old and old[k]:
            d = (r["value"] - old[k]) / old[k] * 100
            if abs(d) >= 0.5:
                trend = f" ({d:+.1f}٪ نسبت به ~۳۰ روز قبل)"
        lines.append(f"- {r['product']} | {r['country_or_region']} | {r['price_type']}: {r['value']:g} {r.get('currency', '')}/{r.get('unit', '')} (گزارش {r.get('source_reported_date')}, منبع {r.get('source_name')}){trend}")
    ref = cfg["reference_price_fob_usd_per_ton"]
    lines.append(f"- قیمت مرجع سپهران شیمی (پایه): حدود {ref} دلار بر تن FOB.")
    return lines


def competitor_section():
    lines = []
    for cid, c in competitors.items():
        lines.append(f"### {c.get('name')} ({cid})")
        lines.append(f"- جایگاه: {trunc(c.get('rank_note'), 200)}")
        lines.append(f"- خلاصه: {trunc(c.get('summary'), 600)}")
        for h in (c.get("headline_stats") or [])[:4]:
            lines.append(f"- {h.get('label')}: {h.get('value')} {h.get('unit', '')}")
        for tk in (c.get("strategic_takeaways") or [])[:3]:
            lines.append(f"- نکته‌ی راهبردی: {trunc(tk if isinstance(tk, str) else json.dumps(tk, ensure_ascii=False), 300)}")
        if c.get("fob_price_caveat"):
            lines.append(f"- هشدار قیمت FOB: {trunc(c['fob_price_caveat'], 300)}")
    return lines


def recent_news(days=45):
    cutoff = (TODAY - datetime.timedelta(days=days)).isoformat()
    return [n for n in news if (n.get("date") or "") >= cutoff]


IMPACT_FA = {"opportunity": "فرصت", "threat": "تهدید", "neutral": "خنثی"}


def country_news(country, rows):
    hits = []
    for n in rows:
        blob = " ".join([n.get("headline_fa") or "", n.get("analysis_fa") or "", " ".join(n.get("key_facts") or [])])
        if country in blob:
            hits.append(n)
    return hits[-3:]


def watch_section(rows, title, n=4):
    if not rows:
        return []
    out = [f"### {title}"]
    for e in rows[-n:]:
        out.append(f"- {e.get('date')}: {trunc(e.get('summary') or e.get('market_note') or json.dumps(e, ensure_ascii=False), 350)}")
    return out


def country_section(r, prof, recent):
    c = r["country"]
    L = [f"### {c} — رتبه {r['rank']} از {len(scored)}، امتیاز {r['score']}، ردهٔ {r['tier']}"]
    L.append("- مؤلفه‌ها: " + "؛ ".join(f"{LABEL[k]} {v:.2f}" for k, v in r["components"].items()))
    L.append("- شرح: " + "؛ ".join(r["notes"].values()))
    if r["strengths"]:
        L.append("- نقاط قوت: " + "، ".join(r["strengths"]))
    if r["weaknesses"]:
        L.append("- نقاط ضعف: " + "، ".join(r["weaknesses"]))
    port = (prof.get("port") or {}).get("name")
    if port:
        L.append(f"- بندر/ورودی اصلی: {port}")
    rb = prof.get("report_import_breakdown") or {}
    if rb.get("suppliers"):
        L.append(f"- تأمین‌کنندگان {rb.get('year', '')}: " + "، ".join(
            f"{s['country']} {fmt(s['tons'])} تن" if s.get("tons") is not None else f"{s['country']} {s.get('share_pct')}٪"
            for s in rb["suppliers"][:6]
        ))
    elif prof.get("top_trade_partners"):
        L.append("- شرکای اصلی: " + "؛ ".join(f"{p['country']} ({trunc(p.get('note'), 80)})" for p in prof["top_trade_partners"][:4]))
    if prof.get("tariff_note"):
        L.append(f"- تعرفه/مقررات: {trunc(prof['tariff_note'], 400)}")
    ss = prof.get("supply_stats") or {}
    if ss:
        L.append("- عرضه و مصرف: " + "؛ ".join(f"{k}={v}" for k, v in list(ss.items())[:6] if not isinstance(v, (dict, list))))
    rs = prof.get("real_trade_stats") or {}
    if rs.get("imports_note"):
        L.append(f"- نکته‌ی آمار: {trunc(rs['imports_note'], 450)}")
    us = unions_of.get(c, [])
    if us:
        L.append("- اتحادیه/توافق: " + "؛ ".join(f"{u.get('short_fa')} ({trunc(u.get('iran_status_fa'), 90)})" for u in us[:3]))
    pc = pc_by_country(c)
    pool = r["pool"]
    L.append(
        f"- بانک شرکت‌ها: {pool['companies']} شرکت ({pool['with_email']} با ایمیل)"
        + (f"؛ گریدها: " + "، ".join(f"{g} {n}" for g, n in pool["grades"]) if pool["grades"] else "")
        + f"؛ ایمیل معرفی ارسال‌شده: {pool['sent']}"
        + (f"؛ مصرف سرانه {pc}" if pc else "")
    )
    ex = [e for e in exhibitions if e.get("country") == c]
    if ex:
        L.append("- نمایشگاه‌ها: " + "؛ ".join(f"{e['name']} ({e.get('date', '')})" for e in ex[:4]))
    rep = [m for m in reports_manifest if m.get("country") == c]
    if rep:
        L.append("- گزارش‌های موجود: " + "؛ ".join(sorted({trunc(m.get('title'), 60) for m in rep})[:3]))
    for n in country_news(c, recent):
        L.append(f"- خبر {n.get('date')} [{IMPACT_FA.get(n.get('impact'), '')}]: {trunc(n.get('headline_fa'), 160)}")
    return L


def pc_by_country(c):
    v = per_capita.get(c) if isinstance(per_capita, dict) else None
    if isinstance(v, dict):
        return f"{v.get('kg_per_capita', v.get('value', ''))} کیلوگرم" if (v.get("kg_per_capita") or v.get("value")) else None
    return None


def transit_section():
    out = []
    priced = []
    for day in transit_days[-14:]:
        for e in day.get("entries", []):
            if e.get("price_amount"):
                priced.append((day.get("date"), e))
    for d, e in priced[-10:]:
        out.append(f"- {d}: {e.get('origin')} ← {e.get('destination')} | {e.get('cargo_type')} | {e.get('price_amount')} {e.get('price_currency') or ''}" + (f" | {e.get('rate_per_ton_km')} /تن‌کیلومتر" if e.get("rate_per_ton_km") else ""))
    return out or ["(در ۱۴ روز اخیر نرخ قیمت‌دار ثبت نشده)"]


def iran_export_section():
    out = []
    for y in (iran_exports.get("annual_totals") or [])[-4:]:
        out.append(f"- سال {y.get('year_fa')}{' (ناقص)' if y.get('is_partial_year') else ''}: {fmt(y.get('tons'))} تن، {fmt(y.get('value_usd'))} دلار")
    return out


def build_digest(scored, radar):
    recent = recent_news()
    L = []
    L.append("# خلاصه‌ی جامع پلتفرم تحقیق و توسعه — سپهران شیمی (جوش شیرین، HS 283630)")
    L.append(f"ساخته‌شده: {TODAY.isoformat()} — همه‌ی اعداد از داده‌ی ثبت‌شده‌ی پلتفرم‌اند؛ «—» یا «نامشخص» یعنی داده نداریم.")
    L.append("")
    L.append("## ۱. رتبه‌بندی کشورهای هدف (امتیاز ۰ تا ۱۰۰، فرمول شفاف؛ وزن‌ها: " + "، ".join(f"{LABEL[k]} {v:.2f}" for k, v in cfg["weights"].items()) + ")")
    for r in scored:
        L.append(f"{r['rank']}. {r['country']} — {r['score']} (ردهٔ {r['tier']}): " + ("؛ ".join(r["strengths"]) or "—") + (" | ضعف: " + "، ".join(r["weaknesses"]) if r["weaknesses"] else ""))
    L.append("")
    L.append("## ۲. قیمت‌های بازار")
    L += price_section()
    L.append("")
    L.append("## ۳. صادرات ایران (گمرک)")
    L += iran_export_section()
    L.append("")
    L.append("## ۴. رقبا")
    L += competitor_section()
    L += watch_section(turkey_watch, "رصد اخیر ترکیه")
    L += watch_section(china_watch, "رصد اخیر چین")
    L.append("")
    L.append("## ۵. کشورهای دارای پرونده")
    by = {r["country"]: r for r in scored}
    for country, prof in profiles.items():
        if country in by:
            L += country_section(by[country], prof, recent)
            L.append("")
    if "ترکیه" in profiles:
        L.append("(ترکیه رقیب اصلی است و در بخش ۴ آمده؛ در رتبه‌بندی بازار هدف نیست.)")
        L.append("")
    L.append("## ۶. رادار: کشورهای بدون پرونده‌ی تحقیقاتی که از روی Trade Map ارزش بررسی دارند")
    for i, r in enumerate(radar, 1):
        L.append(f"{i}. {r['country']} ({r['name_en']}) — امتیاز اولیه {r['score']}: واردات {fmt(r['import_tons'])} تن، ارزش واحد {fmt(r['unit_value_usd'])} دلار/تن، رشد ۵ساله {r['growth_5y_pct']}٪، تعرفه {r['avg_tariff_pct']}٪، شرکت در بانک: {r['companies_in_bank']}")
    L.append("")
    L.append("## ۷. اخبار تحلیلی ۱۴ روز اخیر")
    for n in recent_news(14)[-14:]:
        L.append(f"- {n.get('date')} [{n.get('topic')} | {IMPACT_FA.get(n.get('impact'), '')}] {trunc(n.get('headline_fa'), 150)} — {trunc(n.get('analysis_fa'), 260)}")
    L.append("")
    L.append("## ۸. نرخ‌های ترانزیت و حمل (۱۴ روز اخیر، فقط ردیف‌های قیمت‌دار)")
    L += transit_section()
    L.append("")
    tot_c = len(companies)
    L.append("## ۹. بانک شرکت‌ها و ایمیل معرفی")
    L.append(f"- کل شرکت‌ها: {tot_c}؛ ایمیل معرفی ارسال‌شده تا امروز (طبق لاگ مخزن): {len(sent_log)}.")
    top = collections.Counter(c.get("country") for c in companies).most_common(12)
    L.append("- بیشترین شرکت به تفکیک کشور: " + "، ".join(f"{k} {v}" for k, v in top))
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- اجرا
scored = build_scores()
radar = build_radar(scored)
digest = build_digest(scored, radar)

os.makedirs(OUT, exist_ok=True)
stamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
with open(os.path.join(OUT, "country_scores.json"), "w", encoding="utf-8") as f:
    json.dump({"generated_at": stamp, "config": "data/brain/scoring_config.json", "weights": cfg["weights"], "countries": scored}, f, ensure_ascii=False, indent=2)
    f.write("\n")
with open(os.path.join(OUT, "radar.json"), "w", encoding="utf-8") as f:
    json.dump({"generated_at": stamp, "candidates": radar}, f, ensure_ascii=False, indent=2)
    f.write("\n")
with open(os.path.join(OUT, "digest.md"), "w", encoding="utf-8", newline="\n") as f:
    f.write(digest)

print(f"[OK] {len(scored)} کشور امتیاز گرفت | رادار: {len(radar)} | digest: {len(digest):,} نویسه (~{len(digest) // 3:,} توکن)")
for r in scored:
    print(f"  {r['rank']:>2}. {r['country']:<14} {r['score']:>5}  {r['tier']}  {'؛ '.join(r['strengths'])}")
