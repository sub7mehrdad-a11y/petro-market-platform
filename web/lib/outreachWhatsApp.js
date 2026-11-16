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
export function recordWhatsApp(id, action, { text, at = new Date() } = {}) {
  const state = readWhatsAppState();
  const iso = at.toISOString();
  if (action === "reset") {
    delete state.items[id];
  } else {
    const prev = state.items[id] || { history: [] };
    const history = [...prev.history, { at: iso, action, ...(text ? { text: String(text).slice(0, MAX_TEXT) } : {}) }].slice(-MAX_HISTORY);
    state.items[id] = { status: action, opened_at: action === "opened" ? iso : prev.opened_at || null, sent_at: action === "sent" ? iso : prev.sent_at || null, history };
  }
  writeWhatsAppState(state);
  return state.items[id] || null;
}

const GRADE_LINE = {
  food: "We understand you may be sourcing Food Grade sodium bicarbonate. Ours is backed by SGS and COA certification.",
  feed: "We understand you may be sourcing Feed Grade sodium bicarbonate for animal nutrition.",
  industrial: "We understand you may be sourcing Industrial Grade sodium bicarbonate.",
  unclear: null,
};

/** متن کوتاه انگلیسی بر پایه‌ی متن تأییدشده‌ی ایمیل معرفی (فقط ادعاهای همان متن). گرید نامعلوم ← جمله‌ی گرید نمی‌آید. */
export function renderWhatsAppMessage(lead) {
  const grade = classifyGrade(lead.target_grade);
  const catalogs = getCatalogLinks(grade).links.filter((l) => l.url);
  const lines = [
    `Hello ${lead.name || "Sir/Madam"} team,`,
    "",
    "I am Mehrdad Abutalebi, Export Marketing at Pars Baking Soda Group (Iran). We are a direct producer of sodium bicarbonate, with capacity of up to 15,000 metric tons per month, in Food, Feed and Industrial grades.",
  ];
  if (GRADE_LINE[grade]) lines.push("", GRADE_LINE[grade]);
  if (catalogs.length) lines.push("", ...catalogs.map((l) => `${l.label}: ${l.url}`));
  lines.push(
    "",
    "Could you share your required grade, packaging and estimated quantity? We will prepare our best quotation.",
    "",
    "Thank you,",
    "Mehrdad Abutalebi",
    "Export Marketing, Pars Baking Soda Group",
  );
  return { text: lines.join("\n"), grade, missing_catalog: getCatalogLinks(grade).missing };
}

/** لینک باز‌کردن واتساپ با متن آماده. شماره فقط رقم. */
export function whatsAppLink(e164, text) {
  const digits = String(e164 || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(String(text || "").slice(0, MAX_TEXT))}`;
}
