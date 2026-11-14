"""طبقه‌بندی KHIMIA 2026 با Groq (کلید اختصاصی) روی خلاصه‌ی صفحه‌ی اصلی سایت رسمی هر شرکت."""
import os, sys, json, re
sys.path.insert(0, 'scripts')
sys.stdout.reconfigure(encoding='utf-8')
import exhibitor_lead_finder as efl
from env_utils import load_env

load_env()
SLUG = 'khimia-2026'
inp = {r['id']: r for r in json.load(open(f'data/exhibition_leads/{SLUG}.input.json', encoding='utf-8'))}
ver = json.load(open(f'data/exhibition_leads/{SLUG}.verified.json', encoding='utf-8'))
prog_path = f'data/exhibition_leads/{SLUG}.progress.json'
out_path = f'data/exhibition_leads/{SLUG}.json'

efl.LLM_SYSTEM_PROMPT = """
تو تحلیل‌گر بازاریابی B2B برای تولیدکننده‌ی جوش شیرین (سدیم بی‌کربنات) هستی. ورودی: شرکت‌کننده‌های
نمایشگاه شیمی KHIMIA مسکو. هدف: فهرست شرکت‌های شیمی که می‌توانند مشتری یا شریک توزیع باشند.
relevant=true برای هر شرکتِ «مواد شیمیایی» که تولیدکننده یا بازرگان/تأمین‌کننده/صادرکننده‌ی مواد شیمیایی
(پایه، معدنی/آلی، افزودنی، واسطه، نمک، اسید، قلیایی، سطح‌فعال/شوینده، تصفیه‌ی آب، دارویی/غذایی/
خوراک دام، کشاورزی/کود، رنگ و رنگدانه، مواد ساختمانی/سرامیک، پلاستیک و لاستیک...) است. بازرگان‌ها
اتفاقاً مشتری بهترند (company_type="trader"؛ تولیدکننده = "manufacturer").
اگر خودش بی‌کربنات/کربنات/سودا می‌فروشد، در reason بنویس «فروشنده‌ی مستقیم/رقیب».
relevant=false فقط برای: ماشین‌آلات و تجهیزات (پمپ، شیر، رآکتور، سانتریفیوژ، مبدل حرارتی، خشک‌کن،
ابزار دقیق، فیلتر، مخزن)، مهندسی و پروژه‌ی کارخانه، لجستیک/حمل‌ونقل، رسانه/نمایشگاه/نرم‌افزار/
داده‌ی تجاری، فلزات و آلیاژها/معدن فلز، آزمایشگاه. اگر توضیح فقط یک صفحه‌ی خطا/ربات/خالی است،
relevant=false و reason=«صفحه‌ی سایت محتوایی نداشت».
نکته: «شرکت شیمیایی» بودن کافی است؛ لازم نیست توضیح صراحتاً از جوش شیرین یا مصرف آن حرف بزند.
ساختار هر آبجکت پاسخ:
{"index": <همان index>, "relevant": true/false, "company_type": "manufacturer"|"trader"|null,
 "grade": "کاربرد پیشنهادی جوش شیرین به فارسی (مثلاً 'گرید صنعتی – شوینده' یا 'خوراک دام')" یا null,
 "reason": "یک جمله‌ی کوتاه فارسی بدون هیچ گیومه‌ی داخلی"}
فقط یک JSON array به تعداد ورودی‌ها، بدون markdown و بدون توضیح اضافه.
"""
efl.LLM_DESC_MAX = 450

STRONG_RE = re.compile(r"detergent|cleaning|surfactant|water treatment|effluent|wastewater|glass|textile|dyeing|leather|tann|feed|fertili|"
                       r"food|pharma|excipient|bicarbonate|carbonate|soda|alkali|ceramic|paper|fire|basic chemical|inorganic|"
                       r"phosphate|chloride|sulfate|sulphate|silicate|salt|trading|trader|distribut|import|supplier|"
                       r"химическ|сырь|моющ|водоподготов|кормов|удобрен", re.I)

def tag_fit(progress):
    for v in progress.values():
        if not v.get('relevant'):
            continue
        text = ' '.join([v.get('description') or '', v.get('name') or '']).lower()
        strong = v.get('company_type') == 'trader' or bool(STRONG_RE.search(text))
        v['fit'] = 'قوی' if strong else 'شیمی عمومی (ربط کمتر)'
        v['fit_reason'] = 'بازرگان/تأمین‌کننده یا حوزه‌ی مصرف جوش شیرین در توضیح' if strong else 'شیمی تخصصی؛ مصرف مستقیم نامشخص'

items = []
for k, r in inp.items():
    v = ver.get(k, {})
    blurb = (v.get('site_blurb') or '').strip()
    items.append({
        'name': r['name'], 'country': r['country'], 'profile_url': f'khimia:{k}', 'khimia_id': k,
        'description': blurb, 'categories': [], 'stand': f"{r['hall']} {r['stand']}",
        'website': v.get('website') or '', 'website_source': 'verified_site' if v.get('website') else None,
    })
progress = efl.load_progress(prog_path)
for _k in [k for k, v in progress.items() if not v.get('relevant') and not v.get('no_info')]:
    del progress[_k]  # دوباره با پرامپت اصلاح‌شده
# اطلاعات نداریم (بدون سایت/متن) → حدس نمی‌زنیم؛ فقط ثبت می‌کنیم
for it in items:
    key = efl.candidate_key(it)
    if key not in progress and len(it['description']) < 40:
        progress[key] = {**it, 'relevant': False, 'company_type': None, 'suggested_grade': None,
                         'llm_reason': 'سایت رسمی قابل‌تأیید/متن کافی برای قضاوت وجود ندارد (حدس نمی‌زنیم)',
                         'no_info': True, '_order': len(progress)}
efl.save_progress(prog_path, progress)
todo = [it for it in items if efl.candidate_key(it) not in progress]
print(len(items), 'items;', len(progress), 'already; to classify:', len(todo))

# llm_refine متن را 160 کاراکتر می‌برد؛ برای شیمی همان کافی است (عنوان + meta + ابتدای متن)
def flush():
    return efl.write_output_from_progress(out_path, 'KHIMIA 2026', 'https://www.chemistry-expo.ru/en/exhibition/exhibitors/', len(items), progress)

gen = efl.make_generate_fn('groq')
ok, fail, quota = efl.llm_refine(todo, progress, prog_path, on_batch_done=flush, generate_fn=gen)
print('batches ok', ok, 'fail', fail, 'quota', quota)
efl.save_progress(prog_path, progress)
tag_fit(progress)
efl.save_progress(prog_path, progress)
print('relevant:', flush(), 'of', len(progress))
