import { FOB_LIKE, addDays, daysBetween, todayIso, weekStartOf } from "./salesFormat";

// تحلیل گزارش فروش — توابع خالص (بدون خواندن فایل)، تا هم صفحه‌ی /sales هم «مغز» از همین‌ها استفاده کنند.
//
// معنی‌ها (طبق فایل «Sales Report 2026» تیم):
//  - سفارش قطعی (firm) = «PI issued»؛ پیشنهاد (quote) = «Just quoted» که هنوز سفارش نیست و در فروش نمی‌آید.
//  - فقط ردیف‌های دلاری و دارای مبلغ در جمع مبلغ می‌آیند؛ تناژ همه‌ی ردیف‌ها می‌آید.
//  - میانگین قیمت = میانگین وزنی بر حسب تناژ روی ردیف‌های دلاریِ دارای قیمت.
//  - بدهی پرداخت‌نشده = سفارش قطعیِ با وضعیت پرداخت «Yet to pay».

const REF_PRICE_DEFAULT = 250;
const round = (n, d = 0) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const sum = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0);

function agg(rows) {
  const tons = sum(rows, (r) => r.tons);
  const usd = rows.filter((r) => r.currency === "USD");
  const priced = usd.filter((r) => r.price != null);
  const pricedTons = sum(priced, (r) => r.tons);
  return {
    tons: round(tons, 1),
    revenue_usd: round(sum(usd.filter((r) => r.amount != null), (r) => r.amount)),
    avg_price: pricedTons > 0 ? round(sum(priced, (r) => r.price * r.tons) / pricedTons, 1) : null,
    deals: rows.length,
    countries: new Set(rows.map((r) => r.country)).size,
    buyers: new Set(rows.map((r) => r.buyer.toLowerCase())).size,
  };
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r) || "نامشخص";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

const pct = (cur, prev) => (cur == null || prev == null || prev === 0 ? null : round(((cur - prev) / prev) * 100, 1));
const rowKey = (r) => r.file_no || r.doc_no || `${r.buyer}|${r.date}|${r.tons}`;

/**
 * @param snapshots [{as_of, rows}] عکس‌های لحظه‌ای گزارش (آخرین = مبنا)
 * @param opts { refPrice, countryScores:[{country,tier,rank}], today }
 */
export function summarizeSales(snapshots, opts = {}) {
  const ref = opts.refPrice || REF_PRICE_DEFAULT;
  if (!snapshots?.length) return { empty: true, ref_price: ref };
  const sorted = [...snapshots].sort((a, b) => a.as_of.localeCompare(b.as_of));
  const latest = sorted[sorted.length - 1];
  const prevSnap = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const asOf = latest.as_of;
  const rows = latest.rows;

  const firm = rows.filter((r) => r.stage === "firm");
  const quotes = rows.filter((r) => r.stage === "quote");
  const unknown = rows.filter((r) => r.stage === "unknown");
  const firmDated = firm.filter((r) => r.date);

  // ---- روند هفتگی (فقط سفارش‌های قطعی دارای تاریخ؛ هفته‌های بدون سفارش هم با صفر می‌آیند)
  const weekly = [];
  if (firmDated.length) {
    const byWeek = groupBy(firmDated, (r) => weekStartOf(r.date));
    const first = [...byWeek.keys()].sort()[0];
    const lastWeek = weekStartOf(asOf);
    for (let w = first; w <= lastWeek; w = addDays(w, 7)) {
      const rs = byWeek.get(w) || [];
      weekly.push({ week: w, ...agg(rs), in_progress: w === lastWeek });
    }
  }
  const fullWeeks = weekly.filter((w) => !w.in_progress);

  // ---- ۳۰ روز اخیر در برابر ۳۰ روز قبل از آن (نسبت به تاریخ گزارش)
  const inWindow = (r, from, to) => r.date && r.date > addDays(asOf, -from) && r.date <= addDays(asOf, -to);
  const last30 = firmDated.filter((r) => inWindow(r, 30, 0));
  const prev30 = firmDated.filter((r) => inWindow(r, 60, 30));
  const a30 = agg(last30);
  const p30 = agg(prev30);

  // ---- تفکیک‌ها (سفارش قطعی، از ابتدای داده)
  const ytdTons = sum(firm, (r) => r.tons);
  const mapGroup = (list, keyFn) =>
    [...groupBy(list, keyFn).entries()]
      .map(([k, rs]) => ({ key: k, ...agg(rs), share_tons: ytdTons ? round((sum(rs, (r) => r.tons) / ytdTons) * 100, 1) : null }))
      .sort((a, b) => b.tons - a.tons);

  const byCountry = mapGroup(firm, (r) => r.country).map((c) => {
    const rs = firmDated.filter((r) => r.country === c.key).map((r) => r.date).sort();
    return { ...c, first_date: rs[0] || null, last_date: rs[rs.length - 1] || null };
  });
  const byGrade = mapGroup(firm, (r) => r.grade);
  const byIncoterm = mapGroup(firm, (r) => r.incoterm || "نامشخص");
  const byPlant = mapGroup(firm, (r) => r.plant || "نامشخص");

  const buyerMap = groupBy(firm, (r) => r.buyer.toLowerCase());
  const buyers = [...buyerMap.entries()]
    .map(([, rs]) => {
      const dates = rs.map((r) => r.date).filter(Boolean).sort();
      return {
        name: rs[0].buyer, ...agg(rs), country: [...new Set(rs.map((r) => r.country))].join("، "),
        first_date: dates[0] || null, last_date: dates[dates.length - 1] || null,
        share_tons: ytdTons ? round((sum(rs, (r) => r.tons) / ytdTons) * 100, 1) : null,
      };
    })
    .sort((a, b) => b.tons - a.tons);
  const top1 = buyers[0]?.share_tons ?? null;
  const top3 = buyers.length ? round(sum(buyers.slice(0, 3), (b) => b.share_tons), 1) : null;
  const hhi = buyers.length ? round(sum(buyers, (b) => (b.share_tons / 100) ** 2) * 10000) : null;

  // ---- قیمت در برابر مرجع (سفارش قطعی FOB/FCA/EXW دلاری)
  const fobRows = firm.filter((r) => r.currency === "USD" && FOB_LIKE.includes(r.incoterm) && r.price != null);
  const fobTons = sum(fobRows, (r) => r.tons);
  const fobAvg = fobTons ? round(sum(fobRows, (r) => r.price * r.tons) / fobTons, 1) : null;
  const belowRefRecent = fobRows.filter((r) => r.date && r.date > addDays(asOf, -30) && r.price < ref * 0.9);

  // ---- پرداخت و سن بدهی
  const unpaid = firm.filter((r) => r.payment_status === "unpaid");
  const aged = (min, max) => unpaid.filter((r) => r.date && daysBetween(r.date, asOf) >= min && daysBetween(r.date, asOf) < max);
  const receivables = {
    unpaid_tons: round(sum(unpaid, (r) => r.tons), 1),
    unpaid_usd: round(sum(unpaid.filter((r) => r.currency === "USD" && r.amount != null), (r) => r.amount)),
    unpaid_deals: unpaid.length,
    paid_tons: round(sum(firm.filter((r) => r.payment_status === "paid"), (r) => r.tons), 1),
    partial_tons: round(sum(firm.filter((r) => r.payment_status === "partial"), (r) => r.tons), 1),
    unknown_tons: round(sum(firm.filter((r) => r.payment_status === "unknown"), (r) => r.tons), 1),
    aging: [
      { label: "تا ۳۰ روز", ...agg(aged(0, 31)) },
      { label: "۳۱ تا ۶۰ روز", ...agg(aged(31, 61)) },
      { label: "بیش از ۶۰ روز", ...agg(aged(61, 100000)) },
    ],
  };
  const unpaidOver30 = aged(31, 100000);

  // ---- تولید/بارگیری (سفارش قطعی)
  const production = {
    produced_tons: round(sum(firm.filter((r) => r.production_done), (r) => r.tons), 1),
    loaded_tons: round(sum(firm.filter((r) => r.loaded), (r) => r.tons), 1),
    firm_tons: round(ytdTons, 1),
  };

  // ---- پیشنهادهای باز (pipeline)
  const staleQuotes = quotes.filter((r) => r.date && daysBetween(r.date, asOf) > 45);
  const pipeline = { ...agg(quotes), by_country: mapGroup(quotes, (r) => r.country).slice(0, 8), stale_over_45d: agg(staleQuotes) };

  // ---- مقایسه با عکس قبلی
  let sinceLast = null;
  if (prevSnap) {
    const prevMap = new Map(prevSnap.rows.map((r) => [rowKey(r), r]));
    const newFirm = firm.filter((r) => !(prevMap.get(rowKey(r))?.stage === "firm"));
    const newlyPaid = firm.filter((r) => r.payment_status === "paid" && prevMap.get(rowKey(r)) && prevMap.get(rowKey(r)).payment_status !== "paid");
    sinceLast = { prev_as_of: prevSnap.as_of, new_firm: { ...agg(newFirm) }, newly_paid: { ...agg(newlyPaid) } };
  }

  // ---- هم‌خوانی با ردهٔ کشورها در مغز
  let alignment = null;
  if (Array.isArray(opts.countryScores) && opts.countryScores.length) {
    const tier = Object.fromEntries(opts.countryScores.map((c) => [c.country, c]));
    const recent = firmDated.filter((r) => r.date > addDays(asOf, -90));
    const soldRecent = new Set(recent.map((r) => r.country));
    const rt = sum(recent, (r) => r.tons);
    const tierTons = { A: 0, B: 0, C: 0, "خارج از رتبه‌بندی": 0 };
    for (const r of recent) tierTons[tier[r.country]?.tier || "خارج از رتبه‌بندی"] += r.tons;
    alignment = {
      window_days: 90,
      tier_share_tons: Object.fromEntries(Object.entries(tierTons).map(([k, v]) => [k, rt ? round((v / rt) * 100, 1) : 0])),
      tier_a_without_sales: opts.countryScores.filter((c) => c.tier === "A" && !soldRecent.has(c.country)).map((c) => c.country),
      sold_outside_ranking: [...soldRecent].filter((c) => !tier[c]),
    };
  }

  // ---- هشدارها
  const alerts = [];
  const lastFirmDate = firmDated.map((r) => r.date).sort().pop();
  if (lastFirmDate && daysBetween(lastFirmDate, asOf) > 14) {
    alerts.push({ level: "warn", text: `از آخرین سفارش قطعی (${lastFirmDate}) ${daysBetween(lastFirmDate, asOf)} روز گذشته است.` });
  }
  if (pct(a30.tons, p30.tons) != null && pct(a30.tons, p30.tons) <= -30 && p30.tons >= 50) {
    alerts.push({ level: "warn", text: `تناژ سفارش‌های ۳۰ روز اخیر (${a30.tons}) ${Math.abs(pct(a30.tons, p30.tons))}٪ کمتر از ۳۰ روز قبلش (${p30.tons}) است.` });
  }
  if (belowRefRecent.length) {
    alerts.push({ level: "warn", text: `${belowRefRecent.length} سفارش FOB/FCA در ۳۰ روز اخیر بیش از ۱۰٪ زیر قیمت مرجع ${ref} دلار بسته شده است.` });
  }
  if (unpaidOver30.length) {
    alerts.push({ level: "warn", text: `${unpaidOver30.length} سفارش بیش از ۳۰ روز از PI گذشته و هنوز «Yet to pay» است (${round(sum(unpaidOver30, (r) => r.tons), 1)} تن).` });
  }
  if (top1 != null && top1 >= 40 && buyers.length > 1) alerts.push({ level: "warn", text: `بزرگ‌ترین مشتری ${top1}٪ تناژ سفارش‌ها را دارد (ریسک تمرکز).` });
  if (byCountry[0] && byCountry[0].share_tons >= 60 && byCountry.length > 1) {
    alerts.push({ level: "warn", text: `${byCountry[0].share_tons}٪ تناژ فقط به ${byCountry[0].key} رفته است (وابستگی به یک بازار).` });
  }
  if (staleQuotes.length) alerts.push({ level: "info", text: `${staleQuotes.length} پیشنهاد (${round(sum(staleQuotes, (r) => r.tons), 1)} تن) بیش از ۴۵ روز است «Just quoted» مانده؛ پیگیری یا بستن لازم است.` });
  if (sinceLast?.new_firm.deals) alerts.push({ level: "info", text: `از گزارش قبلی (${sinceLast.prev_as_of}): ${sinceLast.new_firm.deals} سفارش قطعی جدید (${sinceLast.new_firm.tons} تن).` });
  if (sinceLast?.newly_paid.deals) alerts.push({ level: "info", text: `از گزارش قبلی ${sinceLast.newly_paid.deals} سفارش به وضعیت پرداخت‌شده رسید.` });
  if (alignment?.tier_a_without_sales.length) alerts.push({ level: "info", text: `کشورهای ردهٔ A مغز بدون سفارش در ۹۰ روز اخیر: ${alignment.tier_a_without_sales.join("، ")}.` });
  const noPrice = firm.filter((r) => r.price == null).length;
  const noDate = firm.filter((r) => !r.date).length;
  if (noPrice || noDate || unknown.length) {
    alerts.push({ level: "info", text: `کیفیت داده: ${noPrice} سفارش قطعی بدون قیمت، ${noDate} بدون تاریخ PI، ${unknown.length} ردیف با وضعیت PI نامشخص.` });
  }

  return {
    empty: false,
    ref_price: ref,
    as_of: asOf,
    snapshot_count: sorted.length,
    firm_totals: agg(firm),
    window30: { last: a30, prev: p30, tons_pct: pct(a30.tons, p30.tons), revenue_pct: pct(a30.revenue_usd, p30.revenue_usd), price_pct: pct(a30.avg_price, p30.avg_price) },
    last_full_week: fullWeeks[fullWeeks.length - 1] || null,
    weekly,
    by_country: byCountry, by_grade: byGrade, by_incoterm: byIncoterm, by_plant: byPlant,
    buyers: buyers.slice(0, 15),
    concentration: { top1_share: top1, top3_share: top3, hhi, buyer_count: buyers.length },
    price: { fob_avg: fobAvg, fob_vs_ref_pct: fobAvg ? round(((fobAvg - ref) / ref) * 100, 1) : null, below_ref_recent: belowRefRecent.length },
    receivables, production, pipeline, since_last: sinceLast, alignment, alerts,
    quality: { rows: rows.length, firm: firm.length, quote: quotes.length, unknown: unknown.length, firm_no_price: noPrice, firm_no_date: noDate },
  };
}

// خلاصه‌ی متنی «بدون نام مشتری/شماره PI» برای «مغز» (فقط وقتی SALES_AI_ENABLED=true). نام مشتری هرگز نمی‌رود.
export function salesContextForBrain(s) {
  if (!s || s.empty) return null;
  const L = [];
  L.push(`تاریخ گزارش: ${s.as_of}. «سفارش قطعی» یعنی PI صادرشده؛ «پیشنهاد» یعنی Just quoted و هنوز سفارش نیست. قیمت مرجع ${s.ref_price} دلار FOB.`);
  L.push(`سفارش قطعی از ابتدای سال: ${s.firm_totals.tons} تن، ${s.firm_totals.revenue_usd} دلار، میانگین وزنی قیمت ${s.firm_totals.avg_price}، ${s.firm_totals.deals} سفارش، ${s.firm_totals.countries} کشور، ${s.firm_totals.buyers} مشتری.`);
  L.push(`۳۰ روز اخیر: ${s.window30.last.tons} تن (${s.window30.last.deals} سفارش، قیمت ${s.window30.last.avg_price ?? "—"}) در برابر ۳۰ روز قبل از آن ${s.window30.prev.tons} تن (${s.window30.prev.deals} سفارش، قیمت ${s.window30.prev.avg_price ?? "—"}).`);
  L.push("هفته‌های اخیر (هفته | تن | دلار | قیمت | سفارش):");
  for (const w of s.weekly.slice(-8)) L.push(`- ${w.week}${w.in_progress ? " (در جریان)" : ""} | ${w.tons} | ${w.revenue_usd} | ${w.avg_price ?? "—"} | ${w.deals}`);
  L.push("به تفکیک کشور (تن، سهم، قیمت، آخرین سفارش): " + s.by_country.slice(0, 10).map((c) => `${c.key} ${c.tons} (${c.share_tons}٪، ${c.avg_price ?? "—"}، ${c.last_date ?? "—"})`).join("؛ "));
  L.push("به تفکیک گرید: " + s.by_grade.map((g) => `${g.key} ${g.tons} تن (${g.share_tons}٪، قیمت ${g.avg_price ?? "—"})`).join("؛ "));
  L.push("به تفکیک شرایط تحویل: " + s.by_incoterm.map((g) => `${g.key} ${g.tons} تن`).join("؛ "));
  L.push(`تمرکز مشتری (بدون نام): بزرگ‌ترین ${s.concentration.top1_share}٪، سه مشتری برتر ${s.concentration.top3_share}٪، HHI ${s.concentration.hhi}.`);
  if (s.price.fob_avg != null) L.push(`میانگین وزنی قیمت FOB/FCA/EXW: ${s.price.fob_avg} (${s.price.fob_vs_ref_pct}٪ نسبت به مرجع).`);
  L.push(`پرداخت: منتظر پرداخت ${s.receivables.unpaid_tons} تن (${s.receivables.unpaid_deals} سفارش، ${s.receivables.unpaid_usd} دلار)؛ پرداخت‌شده ${s.receivables.paid_tons} تن؛ سن بدهی: ` + s.receivables.aging.map((a) => `${a.label} ${a.deals} سفارش/${a.tons} تن`).join("، ") + ".");
  L.push(`تولید/بارگیری: تولیدشده ${s.production.produced_tons} از ${s.production.firm_tons} تن؛ بارگیری‌شده ${s.production.loaded_tons} تن.`);
  L.push(`پیشنهادهای باز: ${s.pipeline.tons} تن در ${s.pipeline.deals} پیشنهاد؛ بالای ۴۵ روز مانده ${s.pipeline.stale_over_45d.deals} پیشنهاد/${s.pipeline.stale_over_45d.tons} تن. کشورها: ` + s.pipeline.by_country.map((c) => `${c.key} ${c.tons}`).join("، ") + ".");
  if (s.alignment) {
    L.push(`سهم تناژ ۹۰ روز اخیر به تفکیک ردهٔ مغز: ${Object.entries(s.alignment.tier_share_tons).map(([k, v]) => `${k}=${v}٪`).join("، ")}. ردهٔ A بدون سفارش: ${s.alignment.tier_a_without_sales.join("، ") || "ندارد"}.`);
  }
  if (s.alerts.length) L.push("هشدارها: " + s.alerts.map((a) => a.text).join(" | "));
  return L.join("\n");
}

export { todayIso };
