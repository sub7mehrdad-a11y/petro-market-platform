// رندر ایمیل معرفی — متن پایه عیناً از «ایمیل بازاریابی/Email Marketing.docx»ه
// (همونی که قبلاً واقعاً برای عراق فرستاده شده)، فقط با سه محور شخصی‌سازی
// (نام شرکت، کشور، گرید) طبق خواسته‌ی صریح کاربر. هیچ جمله‌ی دیگه‌ای از خودمون
// اضافه/کم نشده تا متن تأییدشده دست‌نخورده بمونه.
//
// کاتالوگ‌های food/feed/industrial: چون خودشون صفحه‌ی وب روی parssoda.com
// هستن (نه فایل)، همیشه به‌صورت لینک توی متن میان.
//
// کاتالوگ بسته‌بندی: برخلاف تصمیم قبلی (۲۰۲۶-۰۹-۱۳ — که بیسکشن سیستماتیک
// نشون داد سرور SMTP شرکت روی پیوست بالای ~۵۰-۱۰۰ کیلوبایت با
// ECONNRESET/ETIMEDOUT شکست می‌خوره)، در ۲۰۲۶-۰۹-۲۳ با تست واقعی (فایل
// All Packing.pdf، ۳.۲ مگابایت، به ایمیل کاربر) مشخص شد این محدودیت دیگه
// وجود نداره — ایمیل رسید و پیوست سالم بود. پس این یکی الان *پیوست واقعی*
// است (توی send/route.js اضافه می‌شه)، نه لینک؛ اینجا فقط توی متن ایمیل
// اشاره می‌شه که پیوست شده.

// شبکه‌ی ایمنیِ دوم برای فرمت ایمیل (اولی: scripts/clean_company_emails.py که
// خودِ داده‌ی companies.json رو پاک می‌کنه). این یکی سمت runtime سایت است —
// حتی اگه یک دسته‌ی جدید شرکت (نمایشگاه بعدی، کشور بعدی) بدون عبور از اسکریپت
// پایتون مستقیم به companies.json اضافه بشه و یک مقدار شلخته داشته باشه
// («ثبت نشده»، چند ایمیل با فاصله از هم...)، صفحه‌ی /outreach و API ارسال
// بازم قبل از نمایش/ارسال ردش می‌کنن، نه اینکه خطای مبهم SMTP برگردونن.
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_FORMAT_RE.test(email.trim());
}

// هر گرید یک یا چند لینک داره — «دامی» چون صفحه‌ی عمومی‌اش (Products/Feed-Grade)
// عملاً خالیه، هر دو زیرصفحه‌ی واقعی (گاوداری + طیور) با هم فرستاده می‌شن
// (تصمیم صریح کاربر، ۲۰۲۶-۰۹-۲۳). "unclear" از همون لینک فود گرید استفاده
// می‌کنه (پیش‌فرض تصمیم قبلی کاربر).
const CATALOG_LINKS_CONFIG = {
  food: [{ label: "Food Grade Catalogue", envKey: "OUTREACH_CATALOG_URL_FOOD" }],
  feed: [
    { label: "Feed Grade Catalogue — Dairy Cows", envKey: "OUTREACH_CATALOG_URL_FEED_DAIRY" },
    { label: "Feed Grade Catalogue — Poultry", envKey: "OUTREACH_CATALOG_URL_FEED_POULTRY" },
  ],
  industrial: [{ label: "Industrial Grade Catalogue", envKey: "OUTREACH_CATALOG_URL_INDUSTRIAL" }],
  unclear: [{ label: "Food Grade Catalogue", envKey: "OUTREACH_CATALOG_URL_FOOD" }],
};

const GRADE_LABEL_FA = {
  food: "خوراکی",
  feed: "دامی (فید)",
  industrial: "صنعتی",
  unclear: "نامشخص/چندگانه (پیش‌فرض: خوراکی)",
};

// جمله‌ی اختصاصی هر گرید — فقط وقتی واقعاً مطمئنیم اضافه می‌شه.
const GRADE_SENTENCE = {
  food:
    "Based on our research, we understand that {COMPANY} may be sourcing Food Grade sodium " +
    "bicarbonate — a product we manufacture to strict international food-safety standards, " +
    "backed by SGS and COA certification.",
  feed:
    "Based on our research, we understand that {COMPANY} may be sourcing Feed Grade sodium " +
    "bicarbonate for animal nutrition applications — a product line we manufacture to " +
    "consistent, reliable specifications.",
  industrial:
    "Based on our research, we understand that {COMPANY} may be sourcing Industrial Grade " +
    "sodium bicarbonate — a product we manufacture to consistent specifications suitable " +
    "for a wide range of industrial applications.",
  unclear: null,
};

// چون داده‌ی target_grade خیلی شلخته‌ست (فارسی/انگلیسی قاطی، "Unclear"،
// "Multiple: Food, Pharma, Industrial"، "صنعتی / خوراکی"...)، فقط وقتی دقیقاً
// یکی از سه گرید تشخیص داده بشه مطمئن حساب می‌شه؛ صفر یا بیش از یکی = نامشخص.
export function classifyGrade(targetGradeText) {
  const t = (targetGradeText || "").toLowerCase();
  if (!t || /multiple|unclear|nan/.test(t)) return "unclear";

  const hasFood = /food|خوراک/.test(t);
  const hasFeed = /feed|دام|cattle/.test(t);
  const hasIndustrial = /industrial|صنعت/.test(t);
  const flagCount = [hasFood, hasFeed, hasIndustrial].filter(Boolean).length;
  if (flagCount !== 1) return "unclear";

  if (hasFood) return "food";
  if (hasFeed) return "feed";
  return "industrial";
}

export function gradeLabelFa(grade) {
  return GRADE_LABEL_FA[grade] || GRADE_LABEL_FA.unclear;
}

// لینک‌های واقعی رو از env می‌خونه (بعد از اینکه کاتالوگ‌ها روی سایت آپلود و
// URLشون داده بشه، همین‌جا پر می‌شن — بدون نیاز به تغییر کد). تا وقتی خالی‌ان،
// url هر ردیف null برمی‌گرده و فراخوان (preview/send) باید به‌جای فرستادن لینک
// شکسته، هشدار بده یا از ارسال جلوگیری کنه.
export function getCatalogLinks(grade) {
  const gradeKey = CATALOG_LINKS_CONFIG[grade] ? grade : "unclear";
  const links = CATALOG_LINKS_CONFIG[gradeKey].map(({ label, envKey }) => ({
    label,
    url: process.env[envKey] || null,
    envKey,
  }));
  return {
    links,
    missing: links.filter((l) => !l.url).map((l) => l.envKey),
  };
}

const SUBJECT = "Sodium Bicarbonate (Food/Industrial Grade) from Iran — Sepehran Chemical";

// مسیر نسبی به ریشه‌ی مخزن (نه web/) — send/route.js با ROOT خودش join می‌کنه.
// یک منبع واحد برای اسم/مسیر فایل، تا جای دیگه‌ای تکرار نشه.
export const PACKING_PDF_RELATIVE_PATH = "assets/outreach/All Packing.pdf";
export const PACKING_PDF_FILENAME = "Pars Baking Soda Group - Packing Details.pdf";

// متن پایه، عیناً از Email Marketing.docx — {{COMPANY}}, {{COUNTRY_EN}} و
// {{GRADE_SENTENCE}} تنها جاهای شخصی‌سازی‌شده‌ن.
const BASE_TEMPLATE = `Dear Sir/Madam,

To company {{COMPANY}}

My name is Mehrdad Abutalebi, and I am the Export Marketing at Pars Baking Soda Group.

I would like to take this opportunity to briefly introduce our company. Pars Baking Soda Group consists of Petro Tarh Pars Co. and Jooshe Shirin Pars Chemical Industries Co., with two manufacturing plants located in Shiraz and Mashhad, Iran.

Our combined production capacity ranges from 7,000 to 10,000 metric tons per month, enabling us to ensure a stable and reliable supply to customers worldwide.

We manufacture high-quality sodium bicarbonate (baking soda) in accordance with international standards, available in Food Grade, Feed Grade, and Industrial Grade. We can supply the product in various packaging options based on customer requirements, including:

25 kg bags - 1,000 kg jumbo bags - 1,250 kg jumbo bags
{{GRADE_SENTENCE}}
Over the years, we have successfully expanded our export business to CIS countries, East Asia, Africa, Europe, Oman, Qatar, Kuwait, India, and many other international markets. As an experienced exporter, we are committed to offering competitive prices, consistent product quality, reliable delivery, and long-term cooperation.

We would be delighted to become your trusted business partner in {{COUNTRY_EN}}.

To prepare our best quotation, kindly let us know your required product grade, specifications, packaging, and estimated quantity.

Please find our full packing options attached (PDF), and our product catalogues below:
{{CATALOG_LINKS}}
We would be pleased to discuss your requirements and provide a solution tailored to your business needs.

We look forward to establishing a long-term and mutually beneficial business relationship with your esteemed company.

Kind regards,
Mehrdad Abutalebi
Export Marketing
Pars Baking Soda Group`;

/**
 * @param {{ english_name: string, country_en: string, target_grade?: string }} company
 * @returns {{ subject: string, body: string, grade: string, catalogLinks: object, missingLinks: string[] }}
 */
export function renderOutreachEmail(company) {
  const grade = classifyGrade(company.target_grade);
  const companyName = company.english_name || "Sir/Madam";
  const countryEn = company.country_en || company.country || "your country";

  const gradeSentenceTpl = GRADE_SENTENCE[grade];
  const gradeSentence = gradeSentenceTpl
    ? gradeSentenceTpl.replace("{COMPANY}", companyName) + "\n"
    : "";

  const catalogLinks = getCatalogLinks(grade);
  // وقتی لینکی هنوز تنظیم نشده، به‌جای فرستادن یک URL خالی/شکسته توی متن،
  // صراحتاً می‌نویسیم که لینک در دست تکمیله — تا هیچ ایمیل نیمه‌کاره‌ای
  // (حتی توی حالت پیش‌نمایش) شبیه چیز نهایی به نظر نرسه.
  const catalogLinksBlock =
    catalogLinks.links.map((l) => `${l.label}: ${l.url || "[LINK PENDING]"}`).join("\n") + "\n";

  const body = BASE_TEMPLATE
    .replaceAll("{{COMPANY}}", companyName)
    .replaceAll("{{COUNTRY_EN}}", countryEn)
    .replace("{{GRADE_SENTENCE}}", gradeSentence)
    .replace("{{CATALOG_LINKS}}", catalogLinksBlock);

  return {
    subject: SUBJECT,
    body,
    grade,
    catalogLinks,
    missingLinks: catalogLinks.missing,
  };
}
