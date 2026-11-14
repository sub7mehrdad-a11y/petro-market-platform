// ابزار مشترک آزمون یادگیری خودکار کشور: محیط موقت، مدل ساختگی که رفتارش به قاعده‌های داخل دستور بستگی دارد.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function setupEnv(tag) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `brainsl-${tag}-`));
  const REAL = path.join(process.cwd(), "..", "data");
  const dataDir = path.join(tmp, "data");
  fs.mkdirSync(path.join(dataDir, "brain"), { recursive: true });
  for (const f of ["country_profiles.json", "country_population.json", "import_suppliers.json"]) fs.copyFileSync(path.join(REAL, f), path.join(dataDir, f));
  const cfg = JSON.parse(fs.readFileSync(path.join(REAL, "brain", "learning_config.json"), "utf-8"));
  cfg.country_learning = { min_pairs: 4, min_gain_err: 0.02, max_iterations: 4, plateau: 2, max_rules: 6, bad_err: 0.25, max_fix_chars: 260 };
  fs.writeFileSync(path.join(dataDir, "brain", "learning_config.json"), JSON.stringify(cfg));
  process.env.BRAIN_DATA_DIR = dataDir;
  process.env.BRAIN_STATE_DIR = path.join(tmp, "state");
  process.env.SALES_STATE_DIR = path.join(tmp, "sales");
  delete process.env.OUTREACH_STATE_DIR;
  return { tmp, dataDir };
}

/** مدل ساختگی: پیش‌بینی‌ها ۵۰٪ بالاتر از واقعی‌اند، مگر دستور شامل «قاعده‌ی خوب» باشد (آن‌وقت دقیق). کالبدشکافی و بازنویسی هم ساختگی. */
export function fakeModel({ Dom, goodMarker, goodRule, diagCalls, reviseCalls, predictCalls, goodWorks = true }) {
  const table = Dom.loadCountryTable();
  const truthOf = (country) => table.find((r) => r.country === country).truth;
  return async ({ system, input }) => {
    if (/بازبین روش‌شناسی/.test(system)) {
      diagCalls.push(input);
      const targets = [...input.matchAll(/--- target: (\w+)/g)].map((m) => m[1]);
      return JSON.stringify({ items: targets.map((t, i) => ({
        target: t, answers: { info: "کشورهای نامرتبط هم در جدول بودند", rule: "میانگین ساده‌ی همه‌ی کشورها را ملاک گرفتم", method: "از میانگین شروع کردم", country_factor: "عامل خاصی نبود", calibration: "بازه تنگ بود" },
        root_cause: i % 4 === 3 ? "unknowable_country_factor" : "reasoning_rule",
        general_fix: i % 4 === 3 ? null : i % 4 === 2 ? "برآورد را همیشه ۲۰٪ پایین‌تر بگیر" : goodRule,
      })) });
    }
    if (/بازنویسی می‌کنی/.test(system)) {
      reviseCalls.push(input);
      return JSON.stringify({ rules: [goodRule, "برای کشور عراق جداگانه تعدیل کن و محتاط باش", "همیشه عدد ۱۲۳ را در نظر بگیر و ضرب کن", goodRule], comparables: { mode: "nearest", k: 6 }, rationale: "قاعده‌ی کلی هم‌درآمد جایگزین میانگین همه‌ی کشورها شد" });
    }
    predictCalls.push(system);
    const country = /کشور هدف: (.+)/.exec(input)[1].trim();
    const truth = truthOf(country);
    const accurate = goodWorks && system.includes(goodMarker);
    const t = {};
    for (const d of Dom.COUNTRY_TARGETS) {
      const v = truth[d.id];
      if (v === null || v === undefined || !input.includes(`- ${d.id}:`)) continue;
      if (d.kind === "probability") { t[d.id] = { p: v ? 0.9 : 0.1, reason: "آزمون" }; continue; }
      const point = accurate ? v : v * 1.5;
      t[d.id] = { point, lo: point * 0.9, hi: point * 1.1, reason: "آزمون" };
    }
    return JSON.stringify({ targets: t });
  };
}
