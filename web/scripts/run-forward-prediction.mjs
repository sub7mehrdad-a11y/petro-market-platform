// پیش‌ثبتِ پیش‌بینی برای کشور تازه از خط فرمان (روی لپ‌تاپ؛ نتیجه در .local-state):
//   node --import ./scripts/alias-loader.mjs scripts/run-forward-prediction.mjs کویت
// برای ثبت رسمی روی سرور از «/brain/learning ← پیش‌بینی برای کشور تازه» استفاده کنید.
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.cwd(), "..", ".env");
const env = (k) => process.env[k] || (fs.existsSync(envFile) ? (fs.readFileSync(envFile, "utf-8").match(new RegExp(`^\s*${k}\s*=\s*(.+?)\s*$`, "m")) || [])[1]?.replace(/^["']|["']$/g, "") : "");
const apiKey = env("GEMINI_API_KEY_BRAIN") || env("GEMINI_API_KEY");
const country = process.argv[2];
if (!apiKey || !country) throw new Error("کلید یا نام کشور نیست.");
const { BRAIN_MODEL } = await import("../lib/brain.js");
const { generateContent } = await import("../lib/geminiFetch.js");
const BT = await import("../lib/brain2/learning/countryBacktest.js");
(await import("../lib/brain2/schema.js")).ensureRepos();
const generate = ({ system, input }) => generateContent({ apiKey, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" } });
let r = await BT.predictNewCountry(country, { generate, model: BRAIN_MODEL });
if (!r.ok && /Gemini|اتصال|مهلت/.test(r.error)) { await new Promise((x) => setTimeout(x, 3000)); r = await BT.predictNewCountry(country, { generate, model: BRAIN_MODEL }); }
if (!r.ok) { console.log("✗", r.error); process.exit(1); }
const fa = (n, d = 2) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d }));
console.log(`پیش‌ثبت ${country} (${r.forecaster}، روش ${r.method_version || "پایه"})`);
for (const x of r.rows) console.log(`  ${x.target.padEnd(24)} ${x.forecast ? (x.forecast.p !== undefined ? `p=${fa(x.forecast.p)}` : `${fa(x.forecast.point)} [${fa(x.forecast.lo)}–${fa(x.forecast.hi)}]`) : `نامعتبر: ${x.invalid}`}   مبنا ${fa(x.baseline)}   | ${x.reason || ""}`);
