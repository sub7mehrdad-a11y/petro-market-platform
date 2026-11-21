import { getBrainScores } from "./brain";
import { readContracts, readEffectiveSnapshots } from "./salesContractsStore";
import { buildLoadingList } from "./salesLoading";
import { ledgerContextForBrain } from "./salesLedger";
import { loadAccounts } from "./salesLedgerStore";
import { salesContextForBrain, summarizeSales } from "./salesAnalytics";
import { salesAiEnabled } from "./salesStore";
import { countryTable } from "./salesCountryServer";

// خلاصه‌ی عملکرد شرکت برای «مغز پلتفرم» (پرسش و تحلیل): فروش، حساب‌ها، وضعیت بارگیری و عملکرد هر کشور (سهم از بازار، قیمت، روند).
// نام مشتری و شماره‌ی قرارداد هرگز نمی‌رود. فقط برای نقش بازرگانی و فقط با SALES_AI_ENABLED=true.

const f = (v, d = 0) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));

function countryContext() {
  const t = countryTable();
  if (t.empty || !t.table.length) return null;
  const sold = t.table.filter((r) => r.has_sales).slice(0, 18);
  const unsold = t.table.filter((r) => !r.has_sales && r.market_imports_tons > 0).sort((a, b) => b.market_imports_tons - a.market_imports_tons).slice(0, 8);
  const L = [`عملکرد هر کشور (پنجره‌ی داده ${f(t.window_months, 1)} ماه؛ تن سالانه‌شده = تن/ماه × ۱۲):`];
  for (const r of sold) {
    L.push(`- ${r.country}: بازار واردات ${f(r.market_imports_tons)} تن (${r.market_source || "—"}${r.market_unreliable ? "؛ آمار ناقص" : ""}); صادرات ما ${f(r.tons, 1)} تن، میانگین ماهانه ${f(r.monthly_avg_tons, 1)}؛ سهم از بازار ${r.share_pct != null ? `${f(r.share_pct, 1)}٪` : "نامشخص"}؛ قیمت ما ${f(r.avg_price, 1)} دلار؛ آخرین سفارش ${r.last_date || "—"}؛ روند ۹۰ روز ${r.trend_pct != null ? `${r.trend_pct}٪` : "—"}.`);
  }
  if (unsold.length) L.push("کشورهای بدون صادرکرد ولی دارای بازار پژوهش‌شده: " + unsold.map((r) => `${r.country} ${f(r.market_imports_tons)} تن`).join("، ") + ".");
  return L.join("\n");
}

function loadingContext(accounts) {
  try {
    const l = buildLoadingList(readContracts(), accounts.contracts || []);
    return `بارگیری: در صف ${f(l.totals.queued_tons, 1)} تن؛ پرداخت‌شده‌ی بدون برنامه ${f(l.totals.unplanned_tons, 1)} تن؛ بارگیری‌شده‌ی منتظر ارسال ${f(l.totals.loaded_tons, 1)} تن؛ قرارداد منتظر پرداخت ${l.totals.waiting_contracts}.`;
  } catch {
    return null;
  }
}

/** { used, reason, text } — reason: used | disabled | empty */
export function salesBrainContext() {
  if (!salesAiEnabled()) return { used: false, reason: "disabled", text: null };
  const scores = getBrainScores();
  const summary = summarizeSales(readEffectiveSnapshots(), { countryScores: (scores?.countries || []).map((c) => ({ country: c.country, tier: c.tier, rank: c.rank })) });
  if (summary.empty) return { used: false, reason: "empty", text: null };
  const { accounts } = loadAccounts();
  const text = [salesContextForBrain(summary), ledgerContextForBrain(accounts), loadingContext(accounts), countryContext()].filter(Boolean).join("\n");
  return { used: true, reason: "used", text };
}
