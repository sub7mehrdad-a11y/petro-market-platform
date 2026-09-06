// رندر ایمیل معرفی — متن پایه عیناً از «ایمیل بازاریابی/Email Marketing.docx»ه
// (همونی که قبلاً واقعاً برای عراق فرستاده شده)، فقط با سه محور شخصی‌سازی
// (نام شرکت، کشور، گرید) طبق خواسته‌ی صریح کاربر. هیچ جمله‌ی دیگه‌ای از خودمون
// اضافه/کم نشده تا متن تأییدشده دست‌نخورده بمونه.

import path from "path";

const ASSETS_DIR = path.join(process.cwd(), "..", "assets", "outreach");

export const ALL_PACKING_FILE = "All Packing.pdf";

// نگاشت گرید → کاتالوگ ضمیمه. برای "unclear" (گرید نامشخص/چندگانه در دیتابیس)
// طبق تصمیم صریح کاربر، پیش‌فرض روی Food Grade می‌مونه — چون پرمصرف‌ترین
// محصولمونه — ولی بر خلاف حالت‌های مطمئن، هیچ جمله‌ی «گرید موردنیازتون X است»
// به متن اضافه نمی‌شه (چون واقعاً مطمئن نیستیم؛ ادعای نادرست بدتر از سکوته).
const GRADE_CATALOG = {
  food: "Food Grade Catalougue.pdf",
  feed: "cattle catalog.pdf",
  industrial: "INDUSTRIAL catalog.pdf",
  unclear: "Food Grade Catalougue.pdf",
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

export function catalogForGrade(grade) {
  return GRADE_CATALOG[grade] || GRADE_CATALOG.unclear;
}

export function gradeLabelFa(grade) {
  return GRADE_LABEL_FA[grade] || GRADE_LABEL_FA.unclear;
}

export function outreachAssetPath(filename) {
  return path.join(ASSETS_DIR, filename);
}

const SUBJECT = "Sodium Bicarbonate (Food/Industrial Grade) from Iran — Sepehran Chemical";

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

For more information about our company and products, please find the attached documents.

We would be pleased to discuss your requirements and provide a solution tailored to your business needs.

We look forward to establishing a long-term and mutually beneficial business relationship with your esteemed company.

Kind regards,
Mehrdad Abutalebi
Export Marketing
Pars Baking Soda Group`;

/**
 * @param {{ english_name: string, country_en: string, target_grade?: string }} company
 * @returns {{ subject: string, body: string, grade: string, attachments: string[] }}
 */
export function renderOutreachEmail(company) {
  const grade = classifyGrade(company.target_grade);
  const companyName = company.english_name || "Sir/Madam";
  const countryEn = company.country_en || company.country || "your country";

  const gradeSentenceTpl = GRADE_SENTENCE[grade];
  const gradeSentence = gradeSentenceTpl
    ? gradeSentenceTpl.replace("{COMPANY}", companyName) + "\n"
    : "";

  const body = BASE_TEMPLATE
    .replaceAll("{{COMPANY}}", companyName)
    .replaceAll("{{COUNTRY_EN}}", countryEn)
    .replace("{{GRADE_SENTENCE}}", gradeSentence);

  return {
    subject: SUBJECT,
    body,
    grade,
    attachments: [ALL_PACKING_FILE, catalogForGrade(grade)],
  };
}
