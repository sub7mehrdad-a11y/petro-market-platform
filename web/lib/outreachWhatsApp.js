// پیام واتساپِ نیمه‌خودکار برای شرکت‌هایی که خودِ سایتشان لینک واتساپ گذاشته (data/whatsapp_leads.json،
// ساخته‌ی scripts/build_whatsapp_leads.py). سایت هیچ پیامی نمی‌فرستد: دکمه فقط واتساپ را با شماره و متن
// آماده باز می‌کند (لینک wa.me) و ارسال نهایی با کلیکِ انسان در خود واتساپ است. اینجا فقط متن ساخته و وضعیت
// (باز شد / ارسال شد) ثبت می‌شود تا یک شرکت دوباره پیام نگیرد.

import fs from "fs";
import path from "path";
import { classifyGrade, getCatalogLinks } from "@/lib/outreachTemplate";
import { getOutreachSentStatePath } from "@/lib/data";

const LEADS_FILE = path.join(process.cwd(), "..", "data", "whatsapp_leads.json");
export const WA_ACTIONS = ["opened", "sent", "reset"];
const MAX_TEXT = 2000; // سقف امن طول متن در لینک wa.me
const MAX_HISTORY = 20;

export function getWhatsAppLeads() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LEADS_FILE, "utf-8"));
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}

// مثل صف ایمیل (outreach_queue.json): کنار لاگ ایمیل‌ها، پس با OUTREACH_STATE_DIR روی دیسک دائمی می‌رود.
export function getWhatsAppStatePath() {
  return path.join(path.dirname(getOutreachSentStatePath()), "whatsapp_outreach.json");
}

export function whatsAppStateProblem() {
  if (process.env.NODE_ENV === "production" && !process.env.OUTREACH_STATE_DIR) {
    return "OUTREACH_STATE_DIR تنظیم نشده: وضعیت ارسال واتساپ روی سرور باید روی دیسک دائمی باشد (وگرنه با دیپلوی بعدی پاک می‌شود و پیام تکراری می‌رود).";
  }
  return null;
}

export function readWhatsAppState() {
  try {
    const p = JSON.parse(fs.readFileSync(getWhatsAppStatePath(), "utf-8"));
    return p && typeof p.items === "object" && p.items ? p : { items: {} };
  } catch {
    return { items: {} };
  }
}

function writeWhatsAppState(state) {
  const file = getWhatsAppStatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

/** ثبت وضعیت یک شرکت. opened: واتساپ باز شد؛ sent: کاربر تأیید کرد فرستاده؛ reset: پاک شدن وضعیت. */
export function recordWhatsApp(id, action, { text, lang, at = new Date() } = {}) {
  const state = readWhatsAppState();
  const iso = at.toISOString();
  if (action === "reset") {
    delete state.items[id];
  } else {
    const prev = state.items[id] || { history: [] };
    const history = [...prev.history, { at: iso, action, ...(lang ? { lang } : {}), ...(text ? { text: String(text).slice(0, MAX_TEXT) } : {}) }].slice(-MAX_HISTORY);
    state.items[id] = { status: action, opened_at: action === "opened" ? iso : prev.opened_at || null, sent_at: action === "sent" ? iso : prev.sent_at || null, history };
  }
  writeWhatsAppState(state);
  return state.items[id] || null;
}

export const WA_LANGS = ["en", "ru", "ar"];
export const WA_LANG_LABEL_FA = { en: "انگلیسی", ru: "روسی", ar: "عربی" };

// زبان محلیِ کشورهایی که پیام به زبان خودشان برایشان معنی دارد. بقیه (هند، چین، ترکیه …) فقط انگلیسی.
// اوکراین و قفقاز عمداً روسی نیستند. کاربر در رابط می‌تواند برای هر شرکت زبان را دستی عوض کند.
const RU_COUNTRIES = new Set(["russia", "russian federation", "belarus", "kazakhstan", "kyrgyzstan", "uzbekistan", "tajikistan"]);
const AR_COUNTRIES = new Set([
  "united arab emirates", "saudi arabia", "egypt", "kuwait", "syria", "bahrain", "jordan", "lebanon", "morocco", "palestine",
  "qatar", "oman", "iraq", "yemen", "libya", "tunisia", "algeria", "sudan",
]);

/** "ru" | "ar" | null (null = فقط انگلیسی) */
export function localLanguageFor(countryEn) {
  const c = String(countryEn || "").trim().toLowerCase();
  if (RU_COUNTRIES.has(c)) return "ru";
  if (AR_COUNTRIES.has(c)) return "ar";
  return null;
}

// فقط ادعاهای متن تأییدشده‌ی ایمیل (تا ۱۵٬۰۰۰ تن در ماه، سه گرید، SGS و COA برای خوراکی). قیمت نیست.
const T = {
  en: {
    hello: (n) => `Hello ${n} team,`,
    intro: "I am Mehrdad Abutalebi, Export Marketing at Pars Baking Soda Group (Iran). We are a direct producer of sodium bicarbonate, with capacity of up to 15,000 metric tons per month, in Food, Feed and Industrial grades.",
    grade: {
      food: "We understand you may be sourcing Food Grade sodium bicarbonate. Ours is backed by SGS and COA certification.",
      feed: "We understand you may be sourcing Feed Grade sodium bicarbonate for animal nutrition.",
      industrial: "We understand you may be sourcing Industrial Grade sodium bicarbonate.",
    },
    catalog: { food: "Food Grade Catalogue", industrial: "Industrial Grade Catalogue" },
    ask: "Could you share your required grade, packaging and estimated quantity? We will prepare our best quotation.",
    bye: ["Thank you,", "Mehrdad Abutalebi", "Export Marketing, Pars Baking Soda Group"],
  },
  ru: {
    hello: (n) => `Здравствуйте, команда ${n}!`,
    intro: "Меня зовут Мехрдад Абуталеби, я отвечаю за экспортный маркетинг в Pars Baking Soda Group (Иран). Мы — прямой производитель гидрокарбоната натрия (пищевой соды) мощностью до 15 000 тонн в месяц; выпускаем пищевой, кормовой и технический сорта.",
    grade: {
      food: "Насколько мы понимаем, вас может интересовать гидрокарбонат натрия пищевого сорта. Наша продукция подтверждена сертификатами SGS и COA.",
      feed: "Насколько мы понимаем, вас может интересовать гидрокарбонат натрия кормового сорта для питания животных.",
      industrial: "Насколько мы понимаем, вас может интересовать гидрокарбонат натрия технического сорта.",
    },
    catalog: { food: "Каталог (пищевой сорт)", industrial: "Каталог (технический сорт)" },
    ask: "Не могли бы вы сообщить, какой сорт, фасовка и ориентировочный объём вам нужны? Мы подготовим для вас лучшее коммерческое предложение.",
    bye: ["С уважением,", "Мехрдад Абуталеби", "Экспортный маркетинг, Pars Baking Soda Group"],
  },
  ar: {
    hello: (n) => `السادة فريق ${n} المحترمون،`,
    intro: "أنا مهرداد أبوطالبي، مسؤول التسويق التصديري في مجموعة بارس لصودا الخبز (Pars Baking Soda Group) في إيران. نحن منتج مباشر لبيكربونات الصوديوم بطاقة إنتاجية تصل إلى 15,000 طن متري شهريًا، بالدرجات الغذائية والعلفية والصناعية.",
    grade: {
      food: "نتفهم أنكم قد تبحثون عن بيكربونات الصوديوم بالدرجة الغذائية. منتجنا حاصل على شهادتي SGS وCOA.",
      feed: "نتفهم أنكم قد تبحثون عن بيكربونات الصوديوم بالدرجة العلفية لتغذية الحيوان.",
      industrial: "نتفهم أنكم قد تبحثون عن بيكربونات الصوديوم بالدرجة الصناعية.",
    },
    catalog: { food: "كتالوج الدرجة الغذائية", industrial: "كتالوج الدرجة الصناعية" },
    ask: "هل يمكنكم تزويدنا بالدرجة المطلوبة ونوع التعبئة والكمية التقديرية؟ سنعدّ لكم أفضل عرض سعر.",
    bye: ["مع خالص التحية،", "مهرداد أبوطالبي", "التسويق التصديري، مجموعة بارس لصودا الخبز"],
  },
};

// عنوان کاتالوگ به زبان پیام. کاتالوگ‌های دامی (فقط انگلیسی در env) برچسب انگلیسی می‌مانند.
function catalogLabel(lang, label) {
  if (/^Food Grade/i.test(label)) return T[lang].catalog.food;
  if (/^Industrial Grade/i.test(label)) return T[lang].catalog.industrial;
  return label;
}

/**
 * متن کوتاه بر پایه‌ی متن تأییدشده‌ی ایمیل معرفی (فقط ادعاهای همان متن). گرید نامعلوم ← جمله‌ی گرید نمی‌آید.
 * lang: en | ru | ar (پیش‌فرض انگلیسی).
 */
export function renderWhatsAppMessage(lead, lang = "en") {
  const L = T[WA_LANGS.includes(lang) ? lang : "en"];
  const lg = WA_LANGS.includes(lang) ? lang : "en";
  const grade = classifyGrade(lead.target_grade);
  const catalogs = getCatalogLinks(grade).links.filter((l) => l.url);
  const lines = [L.hello(lead.name || "Sir/Madam"), "", L.intro];
  if (L.grade[grade]) lines.push("", L.grade[grade]);
  if (catalogs.length) lines.push("", ...catalogs.map((l) => `${catalogLabel(lg, l.label)}: ${l.url}`));
  lines.push("", L.ask, "", ...L.bye);
  return { text: lines.join("\n"), grade, lang: lg, missing_catalog: getCatalogLinks(grade).missing };
}

/** لینک باز‌کردن واتساپ با متن آماده. شماره فقط رقم. */
export function whatsAppLink(e164, text) {
  const digits = String(e164 || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(String(text || "").slice(0, MAX_TEXT))}`;
}
