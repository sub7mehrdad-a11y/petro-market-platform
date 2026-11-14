// کالبدشکافی خطاهای آزمون بازپخش کشورها از خط فرمان (روی لپ‌تاپ؛ روی .local-state):
//   node --import ./scripts/alias-loader.mjs scripts/run-country-autopsy.mjs
// کلید: GEMINI_API_KEY_BRAIN یا GEMINI_API_KEY از .env ریشه. اگر مدل در دسترس نبود، روایت قالبی ثبت می‌شود (دسته را همیشه کد می‌دهد).
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.cwd(), "..", ".env");
const env = (k) => process.env[k] || (fs.existsSync(envFile) ? (fs.readFileSync(envFile, "utf-8").match(new RegExp(`^\\s*${k}\\s*=\\s*(.+?)\\s*$`, "m")) || [])[1]?.replace(/^["']|["']$/g, "") : "");
const apiKey = env("GEMINI_API_KEY_BRAIN") || env("GEMINI_API_KEY");

const { BRAIN_MODEL } = await import("../lib/brain.js");
const { generateContent } = await import("../lib/geminiFetch.js");
const LS = await import("../lib/brain2/learning/countryLessons.js");
const { ensureRepos } = await import("../lib/brain2/schema.js");
ensureRepos();

const generate = ({ system, input }) => generateContent({ apiKey, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json" } });
const r = await LS.runCountryAutopsies({ generate, useModel: !!apiKey });
console.log("کالبدشکافی:", JSON.stringify(r));
const o = LS.lessonsOverview();
for (const a of o.autopsies) console.log(`\n• ${a.country} / ${a.target} [${a.category_fa}${a.narrative_source === "model" ? "" : " — روایت قالبی"}]\n  ${a.statement}${a.lesson ? `\n  درس: ${a.lesson}` : ""}`);
console.log(`\nدرس‌های باز در صف: ${o.open_proposals}`);
