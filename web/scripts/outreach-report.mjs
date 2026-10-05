// گزارش عملکرد ایمیل معرفی از خط فرمان:  node scripts/outreach-report.mjs [روز|all]
// (از پوشه‌ی web/). فقط هدرهای صندوق ورودی شرکتی رو می‌خونه؛ چیزی نمی‌فرسته/پاک نمی‌کنه.
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { buildOutreachReport } from "../lib/outreachReport.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return fb; } };
const arg = process.argv[2] || "7";
const days = arg === "all" ? null : parseInt(arg, 10) || 7;

const baselineFile = path.join(ROOT, "data", "email_outreach_sent.json");
const stateDir = process.env.OUTREACH_STATE_DIR;
const stateFile = stateDir ? path.join(stateDir, "email_outreach_sent.json") : baselineFile;
const sentRecords = [...readJson(baselineFile, []), ...(stateFile !== baselineFile ? readJson(stateFile, []) : [])];
const companies = readJson(path.join(ROOT, "data", "companies.json"), []);

const GRADE_FA = { food: "خوراکی", feed: "دامی", industrial: "صنعتی", unclear: "نامشخص/چندگانه", unknown: "نامشخص (کمپین قبلی)" };
const r = await buildOutreachReport({ sentRecords, companies, days });
const line = (name, o) => `${name.padEnd(22)} ارسال ${String(o.sent).padStart(4)} | برگشتی ${String(o.failed).padStart(3)} | تحویل‌تأییدشده ${String(o.confirmed_delivered).padStart(4)} | تأخیر ${String(o.delayed).padStart(3)} | پاسخ ${String(o.replied).padStart(3)} | پاسخ‌خودکار ${String(o.auto_replied).padStart(3)}`;
console.log(`گزارش ایمیل معرفی — ${days ? `${days} روز اخیر` : "کل زمان"}`);
console.log(line("جمع", r.totals));
for (const [g, v] of Object.entries(r.by_grade)) console.log(line(GRADE_FA[g] || g, v));
console.log(`نرخ برگشتی: ${r.totals.bounce_rate_pct ?? "—"}٪ | نرخ پاسخ (از تحویل‌شده): ${r.totals.reply_rate_pct ?? "—"}٪`);
if (r.replied_companies.length) {
  console.log("پاسخ‌دهندگان:");
  for (const c of r.replied_companies) console.log(`  - ${c.name || "?"} (${c.country || "?"}) — گرید ${GRADE_FA[c.grade] || c.grade}`);
}
console.log(`[صندوق ورودی: ${r.inbox.scanned} پیام بررسی شد؛ پیام وضعیت بی‌تطبیق ${r.inbox.unmatched_dsn}؛ سایر ${r.inbox.other_mail}]`);
for (const n of r.notes) console.log("* " + n);
