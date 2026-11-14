"""
پاک‌سازی و اصلاح نتیجه‌ی طبقه‌بندی KHIMIA 2026 (بعد از khimia_classify.py).

۱) reason خراب‌شده‌ی خروجی مدل (JSON چسبیده در متن) تمیز می‌شود.
۲) اصلاح دستیِ ردیابی‌پذیر: توضیح هر مورد را خودم خواندم؛ مواردی که مدل با متن خودِ شرکت مخالف بود
   (یا شرکت خودمان در لیست بود) اینجا با دلیل ثبت می‌شوند.
۳) درجه‌ی ربط با قانون شفاف (نه مدل): «قوی» = بازرگان/تأمین‌کننده‌ی مواد شیمیایی یا حوزه‌ی مصرف
   مستقیم بی‌کربنات (شوینده/سطح‌فعال، تصفیه‌ی آب، شیشه، نساجی/چرم، خوراک دام، افزودنی غذایی/دارویی،
   کاغذ، سرامیک، اطفای حریق، سودا/قلیایی). کود، پیگمنت، حلال، پلیمر و شیمی تخصصی = «شیمی عمومی».
۴) شرکت‌هایی که چند نامشان یک وب‌سایت دارد برچسب «نیاز به بررسی» می‌گیرند.

استفاده:  python scripts/khimia_finalize.py
"""

import os
import re
import sys
import json
import collections

sys.path.insert(0, os.path.dirname(__file__))
import exhibitor_lead_finder as efl  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SLUG = "khimia-2026"
PROG = os.path.join(efl.OUTPUT_DIR, f"{SLUG}.progress.json")

# (relevant, company_type, grade, reason, needs_review)
OVERRIDES = {
    "PARS BAKING SODA GROUP": (False, None, None, "شرکت خودمان (جوش شیرین پارس) — مشتری نیست", False),
    "XIANGTAN HUIBO CENTRIFUGE CO. LTD": (False, None, None, "سازنده‌ی سانتریفیوژ (تجهیزات)", False),
    "ZHEJIANG SHUANGZI INTELLIGENT EQUIPMENT CO. LTD": (False, None, None, "سازنده‌ی تجهیزات پزشکی/بیولوژی", False),
    "HUAWEI CHEMICAL & BIOLOGIC ENGINEERING CO. LTD": (False, None, None, "سازنده‌ی مخازن تحت فشار (تجهیزات/مهندسی)", False),
    "GLIKOLI.RU": (True, "trader", "گرید صنعتی – بازرگانی مواد شیمیایی", "تأمین‌کننده‌ی عمده‌ی گلیکول‌ها و گلیسیرین (بازرگان مواد شیمیایی)", False),
    "GLYCERINE.RU": (True, "manufacturer", "گرید صنعتی/دارویی – گلیسیرین", "تولید و فروش گلیسیرین و اولئوشیمی", False),
    "YANTAI BILLION THAI CHEMICAL CO. LTD": (True, "manufacturer", "گرید صنعتی – معدن (تنظیم pH فلوتاسیون)", "تولیدکننده‌ی معرف‌های فلوتاسیون و مواد شیمیایی معدنی", False),
    "ZHEJIANG TONGCHEM INDUSTRY GROUP CO. LTD": (True, "manufacturer", "گرید صنعتی – رنگدانه", "تولیدکننده‌ی پیگمنت‌های آلی و معدنی", False),
    "YANTAI CHENPING MINERALS CO. LTD": (True, "trader", "گرید صنعتی – معدن", "تجارت سنگ معدن و عرضه‌ی معرف‌های فلوتاسیون", True),
    "TIANJIN PUKAI INTERNATIONAL TRADE COMPANY LIMITED": (True, "trader", "گرید صنعتی – بازرگانی", "شرکت تجارت بین‌المللی (دامنه chemplusind)؛ محصولات روی سایت مشخص نبود", True),
}

STRONG_RE = re.compile(
    r"detergent|cleaning|surfactant|water treatment|effluent|wastewater|glass|textile|dyeing|leather|tann|"
    r"animal feed|feed additive|food additive|food ingredient|excipient|pharmaceutical|bicarbonate|carbonate|"
    r"soda|alkali|ceramic|pulp|paper|fire|basic chemical|"
    r"моющ|водоподготов|кормов|целлюлоз", re.I)


def clean_reason(r: str) -> str:
    r = (r or "").strip()
    r = re.split(r'["”]\s*[}\]]', r)[0]          # JSON چسبیده بعد از reason
    r = re.split(r'["”]\s*,\s*["”]?\{', r)[0]
    return r.strip(' "{}[],')


def main():
    prog = efl.load_progress(PROG)
    by_name = {v["name"]: k for k, v in prog.items()}
    for v in prog.values():
        if v.get("llm_reason"):
            v["llm_reason"] = clean_reason(v["llm_reason"])
    for name, (rel, ctype, grade, reason, review) in OVERRIDES.items():
        k = by_name.get(name)
        if not k:
            print("  [WARN] پیدا نشد:", name)
            continue
        v = prog[k]
        v.update(relevant=rel, company_type=ctype, suggested_grade=grade,
                 llm_reason=reason + " (اصلاح دستی پس از خواندن توضیح شرکت)", manual_override=True)
        v["needs_review"] = bool(review)
        v.pop("fit", None)
    # شرکت‌هایی که چند نامشان یک سایت دارد
    sites = collections.defaultdict(list)
    for k, v in prog.items():
        if v.get("relevant") and v.get("website"):
            sites[v["website"].rstrip("/").lower()].append(k)
    for ks in sites.values():
        if len(ks) > 1:
            for k in ks:
                prog[k]["needs_review"] = True
                prog[k]["llm_reason"] = (prog[k].get("llm_reason") or "") + " — چند شرکت نمایشگاه یک سایت دارند؛ تأیید دستی"
    # درجه‌ی ربط
    for v in prog.values():
        if not v.get("relevant"):
            v.pop("fit", None)
            continue
        text = " ".join([v.get("description") or "", v.get("name") or ""])
        strong = v.get("company_type") == "trader" or bool(STRONG_RE.search(text))
        v["fit"] = "قوی" if strong else "شیمی عمومی (ربط کمتر)"
        v["fit_reason"] = ("بازرگان/تأمین‌کننده‌ی مواد شیمیایی یا حوزه‌ی مصرف بی‌کربنات در توضیح سایت"
                           if strong else "شیمی تخصصی؛ مصرف مستقیم بی‌کربنات نامشخص")
    efl.save_progress(PROG, prog)
    n = efl.write_output_from_progress(os.path.join(efl.OUTPUT_DIR, f"{SLUG}.json"), "KHIMIA 2026",
                                       "https://www.chemistry-expo.ru/en/exhibition/exhibitors/", len(prog), prog)
    rel = [v for v in prog.values() if v.get("relevant")]
    print(f"{n} مرتبط:", collections.Counter(v["fit"] for v in rel), collections.Counter(v.get("company_type") for v in rel))


if __name__ == "__main__":
    main()
