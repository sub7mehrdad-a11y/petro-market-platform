// اجرای آزمون بازپخش کشورها از خط فرمان (روی لپ‌تاپ؛ نتیجه در .local-state/brain می‌ماند، نه روی سرور):
//   node --import ./scripts/alias-loader.mjs scripts/run-country-backtest.mjs [کشور ...]   (بدون آرگومان: همه)
// کلید: GEMINI_API_KEY_BRAIN یا GEMINI_API_KEY از .env ریشه؛ پراکسی از HTTPS_PROXY همان فایل. چیزی ارسال یا منتشر نمی‌شود.
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.cwd(), "..", ".env");
const env = (k) => process.env[k] || (fs.existsSync(envFile) ? (fs.readFileSync(envFile, "utf-8").match(new RegExp(`^\\s*${k}\\s*=\\s*(.+?)\\s*$`, "m")) || [])[1]?.replace(/^["']|["']$/g, "") : "");
const apiKey = env("GEMINI_API_KEY_BRAIN") || env("GEMINI_API_KEY");
if (!apiKey) throw new Error("کلید Gemini پیدا نشد.");

const { BRAIN_MODEL } = await import("../lib/brain.js");
const { generateContent } = await import("../lib/geminiFetch.js");
const BT = await import("../lib/brain2/learning/countryBacktest.js");
const { ensureRepos } = await import("../lib/brain2/schema.js");
ensureRepos();

const generate = ({ system, input }) => generateContent({ apiKey, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" } });
const countries = process.argv.slice(2).length ? process.argv.slice(2) : BT.backtestCountries();
const fa = (n, d = 2) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d }));
const runId = `bt_${Date.now().toString(36)}`;

for (const c of countries) {
  let r = await BT.runCountryBacktest(c, { generate, model: BRAIN_MODEL, runId });
  if (!r.ok) { await new Promise((x) => setTimeout(x, 3000)); r = await BT.runCountryBacktest(c, { generate, model: BRAIN_MODEL, runId }); } // یک تلاش دوباره (قطع شبکه)
  if (!r.ok) { console.log(`✗ ${c}: ${r.error}`); continue; }
  console.log(`\n== ${c}`);
  for (const x of r.rows) {
    const f = x.forecast ? (x.forecast.p !== undefined ? `p=${fa(x.forecast.p)}` : `${fa(x.forecast.point)} [${fa(x.forecast.lo)}–${fa(x.forecast.hi)}]`) : "—";
    const res = x.result.scored ? (x.result.brier !== undefined ? `brier ${fa(x.result.brier)} skill ${fa(x.result.skill)}` : `خطا ${fa(x.result.abs_rel_err * 100, 0)}٪ ${x.result.inside ? "داخل" : "بیرون"} skill ${fa(x.result.skill)}`) : `سنجیده نشد (${x.result.reason})`;
    console.log(`  ${x.target.padEnd(24)} پیش‌بینی ${f.padEnd(26)} واقعی ${fa(x.truth).padEnd(9)} مبنا ${fa(x.baseline).padEnd(9)} | ${res}`);
  }
}
const s = BT.summarizeBacktests();
console.log("\n== جمع‌بندی (آخرین اجرا)\nکل:", JSON.stringify(s.overall));
for (const t of s.by_target) console.log(`  ${t.id.padEnd(24)} n=${t.n} مهارت ${fa(t.mean_skill)} بهتر از مبنا ${t.beats_baseline_pct ?? "—"}٪ پوشش ${fa(t.coverage)} خطای نسبی ${fa(t.mean_abs_rel_err)}`);
