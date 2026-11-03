import fs from "fs";
import path from "path";
import { generateContent } from "./geminiFetch";

// «مغز پلتفرم»: خلاصه‌ی جامع و رتبه‌بندی کشورها را scripts/build_brain.py از کل داده‌ها می‌سازد (data/brain/)
// و این‌جا فقط خوانده و به مدل داده می‌شود. فایل‌ها هر روز با ربات‌های روزانه به‌روز می‌شوند.

const BRAIN_DIR = path.join(process.cwd(), "..", "data", "brain");
export const BRAIN_MODEL = process.env.GEMINI_BRAIN_MODEL || "gemini-3.6-flash";

function readText(name) {
  try {
    return fs.readFileSync(path.join(BRAIN_DIR, name), "utf-8");
  } catch {
    return null;
  }
}

function readJson(name) {
  const raw = readText(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const getBrainDigest = () => readText("digest.md");
export const getBrainScores = () => readJson("country_scores.json");
export const getBrainRadar = () => readJson("radar.json");
export const getBrainBriefing = () => readJson("briefing.json");

/**
 * کلید اختصاصی «مغز». عمداً بدون fallback به کلید مشترک ایجنت‌های روزانه: مغز کل پرونده‌ها را می‌خواند و
 * پرمصرف است، پس با سهمیه‌ی رصد روزانه نباید قاطی شود (تصمیم کاربر ۲۰۲۶-۱۱-۰۲).
 */
export function resolveBrainKey() {
  if (process.env.GEMINI_API_KEY_BRAIN) return process.env.GEMINI_API_KEY_BRAIN;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "..", ".env"), "utf-8");
    const m = raw.match(/^\s*GEMINI_API_KEY_BRAIN\s*=\s*(.+?)\s*$/m);
    return m ? m[1].replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

export const BRAIN_SYSTEM_PROMPT = `
تو «مغز متفکر» پلتفرم تحقیق و توسعه‌ی شرکت سپهران شیمی هستی؛ تولیدکننده‌ی ایرانی جوش شیرین (سدیم بی‌کربنات،
HS 283630)، برند «جوش شیرین پارس». مخاطبت تیم بازرگانی و مدیران‌اند. تو همه‌ی داده‌های پلتفرم را در «خلاصه‌ی جامع»
(پایین) داری: رتبه‌بندی کشورها با فرمول شفاف، قیمت‌ها، رقبا، پرونده‌ی هر کشور، بانک شرکت‌ها، نمایشگاه‌ها، اخبار و حمل.
وظیفه‌ات فقط نقل داده نیست: باید نتیجه‌گیری کنی، اولویت بدهی و راهکار عملی بدهی.

قوانین اجباری:
1. فقط از «خلاصه‌ی جامع»، «قطعه‌های مرتبط» و (اگر آمده) «عملکرد فروش خودمان» استفاده کن. چیزی از خودت نساز؛
   اگر داده نیست بگو «این داده در پلتفرم نیست» و بگو برای رسیدن به آن چه تحقیقی لازم است.
2. عددها را دقیقاً همان‌طور که آمده نقل کن (گرد نکن). FOB / CIF / قیمت داخلی / ارزش واحد واردات را با هم قاطی نکن.
   ادعای عددی که در داده نیست (روز حمل، درصد صرفه‌جویی، هزینه‌ی کرایه، سهم و ...) ممنوع است؛ اگر لازم است بگو
   «در پلتفرم نیست و باید استعلام شود». اگر از تو پیشنهاد قیمت/عدد خواستند، پیشنهاد را صریحاً «پیشنهاد تحلیلی من» بنام
   و مبنای محاسبه را از عددهای موجود بگو (مثلاً «۲۵۰ FOB مرجع + حاشیه»)، نه اینکه آن را داده جلوه دهی.
3. وقتی توصیه می‌کنی همیشه چهار چیز بگو: (الف) چرا این کشور (۲ تا ۳ دلیل با عدد)، (ب) با چه شرایطی (گرید محصول، مسیر
   و بندر، بازه‌ی قیمت نسبت به قیمت مرجع ۲۵۰ دلار FOB و رقیبی که باید پشت سر گذاشت)، (ج) ریسک‌ها و ناطمینانی‌ها،
   (د) قدم بعدی مشخص و قابل‌اجرا (مثلاً کدام نمایشگاه، کدام دسته از شرکت‌ها، کدام تحقیق).
4. رتبه‌بندی خلاصه‌ی جامع یک نقطه‌ی شروع شفاف است نه حکم: اگر از روی اخبار یا ریسک‌ها لازم است رتبه را تعدیل
   کنی، صریح بگو چه چیزی و چرا. اگر امتیازی با واقعیت‌های پرونده‌ی کشور نمی‌خواند (مثلاً بازار کوچک اما رقیب‌گریز)
   همین را بگو.
5. بین «داده‌ی قوی» و «برآورد/حدس» فرق بگذار. هرجا داده‌ی خنثی یا نامشخص بوده، همان را اعلام کن.
6. جواب فارسی، ساختاریافته و کوتاه‌ترین حالتِ کامل باشد (حداکثر حدود ۴۰۰ کلمه؛ برای «کدام کشورها» فهرست شماره‌دار با
   حداکثر ۴ کشور). مقدمه‌ی تکراری ننویس؛ مستقیم برو سر نتیجه. منبع را کنار ادعا بیاور، مثل (رتبه‌بندی)، (پرونده‌ی عراق)، (قیمت‌ها) یا [۱] برای قطعه‌ها.
7. «عملکرد فروش خودمان» (اگر آمده) محرمانه‌ی تیم بازرگانی است؛ فقط برای تحلیل استفاده کن.
`.trim();

// ---- بررسی ریشه‌دار بودن عددها: هر عددِ پاسخ که در داده‌های داده‌شده به مدل نباشد، علامت می‌خورد ----
const P2A = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9", "٫": ".", "٬": "," };

export function numbersIn(text) {
  const norm = String(text || "").replace(/[۰-۹٫٬]/g, (c) => P2A[c]);
  const out = new Set();
  for (const m of norm.match(/\d[\d,]*(?:\.\d+)?/g) || []) {
    const n = m.replace(/,/g, "").replace(/\.$/, "");
    if (n.replace(".", "").length >= 2) out.add(n); // عدد تک‌رقمی (شماره‌ی منبع، «۳ دلیل») مهم نیست
  }
  return out;
}

function toContents(history, finalUserText) {
  const turns = [];
  for (const h of Array.isArray(history) ? history.slice(-6) : []) {
    if (!h || !h.text) continue;
    turns.push({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text).slice(0, 4000) }] });
  }
  turns.push({ role: "user", parts: [{ text: finalUserText }] });
  return turns;
}

export async function askBrain({ apiKey, question, history, retrievedContext, salesContext }) {
  const digest = getBrainDigest();
  if (!digest) throw new Error("خلاصه‌ی جامع (data/brain/digest.md) پیدا نشد؛ اول scripts/build_brain.py را اجرا کنید.");

  const system = `${BRAIN_SYSTEM_PROMPT}\n\n===== خلاصه‌ی جامع پلتفرم =====\n${digest}`;
  const parts = [`سؤال: ${question}`];
  if (retrievedContext) parts.push(`===== قطعه‌های مرتبط (برای جزئیات بیشتر) =====\n${retrievedContext}`);
  if (salesContext) parts.push(`===== عملکرد فروش خودمان (محرمانه) =====\n${salesContext}`);

  const contents = toContents(history, parts.join("\n\n"));
  let answer;
  // «تقاضای زیاد» (۵۰۳) و ۴۲۹ گذرا هستند (در بررسی دیده شد)؛ تا ۳ بار با فاصله تلاش می‌کنیم، بعد خطا می‌رود و
  // route به پاسخ‌دهنده‌ی ساده برمی‌گردد.
  for (let attempt = 1; ; attempt++) {
    try {
      answer = await generateContent({
        apiKey,
        model: BRAIN_MODEL,
        systemInstruction: system,
        contents,
        // سقف بالا چون مدل پیش از جواب «فکر» می‌کند و آن هم از همین سقف مصرف می‌شود؛ جواب بریده نشود.
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      });
      break;
    } catch (err) {
      const transient = /\b(429|500|502|503|504)\b/.test(String(err?.message || err));
      if (!transient || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }

  const known = numbersIn(
    [digest, question, retrievedContext, salesContext, ...(Array.isArray(history) ? history.map((h) => h?.text) : [])].join("\n")
  );
  const ungrounded = [...numbersIn(answer)].filter((n) => !known.has(n));
  return { answer, ungrounded };
}
