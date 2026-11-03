import { FOB_LIKE } from "./salesFormat";

// تحلیل گزارش‌های هفتگی فروش — توابع خالص (بدون خواندن فایل)، تا هم صفحه‌ی /sales هم «مغز» از همین‌ها استفاده کنند.
// فقط ردیف‌های دلاری در مبلغ و میانگین قیمت می‌آیند؛ تناژ همه‌ی ردیف‌ها می‌آید.

const REF_PRICE_DEFAULT = 250;
const round = (n, d = 0) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

function agg(rows) {
  const tons = rows.reduce((s, r) => s + r.tons, 0);
  const usd = rows.filter((r) => r.currency === "USD");
  const usdTons = usd.reduce((s, r) => s + r.tons, 0);
  const revenue = usd.reduce((s, r) => s + r.amount, 0);
  return {
    tons: round(tons, 1),
    revenue_usd: round(revenue),
    avg_price: usdTons > 0 ? round(revenue / usdTons, 1) : null, // میانگین وزنی بر حسب تناژ
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

function delta(cur, prev) {
  if (cur == null || prev == null || prev === 0) return null;
  return round(((cur - prev) / prev) * 100, 1);
}

/**
 * @param reports گزارش‌های ذخیره‌شده [{week_start, rows}]
 * @param opts { refPrice, countryScores: [{country, tier, rank}] } — countryScores از «مغز» برای تطبیق فروش با اولویت‌ها
 */
export function summarizeSales(reports, opts = {}) {
  const ref = opts.refPrice || REF_PRICE_DEFAULT;
  const sorted = [...reports].sort((a, b) => a.week_start.localeCompare(b.week_start));
  const all = sorted.flatMap((r) => r.rows.map((x) => ({ ...x, week: r.week_start })));
  if (!sorted.length) return { empty: true, ref_price: ref };

  const weekly = sorted.map((r) => ({ week: r.week_start, uploaded_at: r.uploaded_at, filename: r.filename, replaced_count: r.replaced_count || 0, ...agg(r.rows) }));
  // میانگین وزنی قیمت FOB-محور هر هفته
  for (const w of weekly) {
    const rows = sorted.find((r) => r.week_start === w.week).rows.filter((x) => x.currency === "USD" && FOB_LIKE.includes(x.incoterm));
    const t = rows.reduce((s, x) => s + x.tons, 0);
    w.fob_avg_price = t > 0 ? round(rows.reduce((s, x) => s + x.amount, 0) / t, 1) : null;
  }

  const latest = weekly[weekly.length - 1];
  const prev = weekly.length > 1 ? weekly[weekly.length - 2] : null;
  const last4 = weekly.slice(-5, -1); // ۴ هفته‌ی قبل از آخرین هفته
  const avg4Tons = last4.length ? round(last4.reduce((s, w) => s + w.tons, 0) / last4.length, 1) : null;

  const mapGroup = (rows, keyFn, totalTons) =>
    [...groupBy(rows, keyFn).entries()]
      .map(([k, rs]) => ({ key: k, ...agg(rs), share_tons: totalTons ? round((rs.reduce((s, r) => s + r.tons, 0) / totalTons) * 100, 1) : null }))
      .sort((a, b) => b.tons - a.tons);

  const totalTons = all.reduce((s, r) => s + r.tons, 0);
  const recent = all.filter((r) => weekly.slice(-8).some((w) => w.week === r.week)); // ۸ هفته‌ی اخیر
  const recentTons = recent.reduce((s, r) => s + r.tons, 0);

  const byCountry = mapGroup(all, (r) => r.country, totalTons).map((c) => {
    const rs = all.filter((r) => r.country === c.key);
    const weeks = rs.map((r) => r.week).sort();
    return { ...c, first_week: weeks[0], last_week: weeks[weeks.length - 1] };
  });
  const byGrade = mapGroup(all, (r) => r.grade, totalTons);
  const byIncoterm = mapGroup(all, (r) => r.incoterm || "نامشخص", totalTons);
  const byStatus = mapGroup(all, (r) => r.status || "نامشخص", totalTons);

  // مشتری‌ها (نام فقط در صفحه‌ی بازرگانی نشان داده می‌شود؛ به مدل هوش مصنوعی داده نمی‌شود)
  const buyerMap = groupBy(all, (r) => r.buyer.toLowerCase());
  const buyers = [...buyerMap.entries()]
    .map(([, rs]) => {
      const weeks = rs.map((r) => r.week).sort();
      return {
        name: rs[0].buyer, ...agg(rs), country: [...new Set(rs.map((r) => r.country))].join("، "),
        first_week: weeks[0], last_week: weeks[weeks.length - 1], weeks_active: new Set(weeks).size,
        share_tons: totalTons ? round((rs.reduce((s, r) => s + r.tons, 0) / totalTons) * 100, 1) : null,
      };
    })
    .sort((a, b) => b.tons - a.tons);
  const hhi = buyers.length ? round(buyers.reduce((s, b) => s + (b.share_tons / 100) ** 2, 0) * 10000) : null; // ۱۰۰۰۰ = یک مشتری
  const top1Share = buyers[0]?.share_tons ?? null;
  const top3Share = buyers.length ? round(buyers.slice(0, 3).reduce((s, b) => s + b.share_tons, 0), 1) : null;
  const newBuyersLatest = buyers.filter((b) => b.first_week === latest.week).map((b) => ({ name: b.name, country: b.country, tons: b.tons }));
  const newCountriesLatest = byCountry.filter((c) => c.first_week === latest.week).map((c) => c.key);

  // قیمت در برابر مرجع (فقط FOB/EXW/FCA دلاری)
  const fobRows = all.filter((r) => r.currency === "USD" && FOB_LIKE.includes(r.incoterm));
  const fobTons = fobRows.reduce((s, r) => s + r.tons, 0);
  const fobAvg = fobTons ? round(fobRows.reduce((s, r) => s + r.amount, 0) / fobTons, 1) : null;
  const latestFobRows = fobRows.filter((r) => r.week === latest.week);
  const belowRef = latestFobRows.filter((r) => r.price < ref * 0.9);

  // تطبیق با اولویت‌های مغز
  let alignment = null;
  if (Array.isArray(opts.countryScores) && opts.countryScores.length) {
    const tier = Object.fromEntries(opts.countryScores.map((c) => [c.country, c]));
    const soldRecent = new Set(recent.map((r) => r.country));
    const tierTons = { A: 0, B: 0, C: 0, "خارج از رتبه‌بندی": 0 };
    for (const r of recent) tierTons[tier[r.country]?.tier || "خارج از رتبه‌بندی"] += r.tons;
    alignment = {
      tier_share_tons: Object.fromEntries(Object.entries(tierTons).map(([k, v]) => [k, recentTons ? round((v / recentTons) * 100, 1) : 0])),
      tier_a_without_sales: opts.countryScores.filter((c) => c.tier === "A" && !soldRecent.has(c.country)).map((c) => c.country),
      sold_outside_ranking: [...soldRecent].filter((c) => !tier[c]),
    };
  }

  const alerts = [];
  if (prev && delta(latest.tons, prev.tons) != null && delta(latest.tons, prev.tons) <= -30) {
    alerts.push({ level: "warn", text: `تناژ هفته‌ی آخر ${Math.abs(delta(latest.tons, prev.tons))}٪ کمتر از هفته‌ی قبل است.` });
  }
  if (avg4Tons && latest.tons < avg4Tons * 0.6) {
    alerts.push({ level: "warn", text: `تناژ هفته‌ی آخر (${latest.tons}) کمتر از ۶۰٪ میانگین ${last4.length} هفته‌ی قبل (${avg4Tons}) است.` });
  }
  if (belowRef.length) {
    alerts.push({ level: "warn", text: `${belowRef.length} فروش FOB این هفته بیش از ۱۰٪ زیر قیمت مرجع ${ref} دلار بوده است.` });
  }
  if (top1Share != null && top1Share >= 40 && buyers.length > 1) {
    alerts.push({ level: "warn", text: `بزرگ‌ترین مشتری ${top1Share}٪ کل تناژ را دارد (ریسک تمرکز).` });
  }
  const topCountry = byCountry[0];
  if (topCountry && topCountry.share_tons >= 60 && byCountry.length > 1) {
    alerts.push({ level: "warn", text: `${topCountry.share_tons}٪ تناژ فقط به ${topCountry.key} رفته است (وابستگی به یک بازار).` });
  }
  if (newBuyersLatest.length) alerts.push({ level: "info", text: `${newBuyersLatest.length} مشتری جدید این هفته.` });
  if (newCountriesLatest.length) alerts.push({ level: "info", text: `بازار جدید این هفته: ${newCountriesLatest.join("، ")}.` });
  if (alignment?.tier_a_without_sales.length) {
    alerts.push({ level: "info", text: `کشورهای ردهٔ A مغز که در ۸ هفته‌ی اخیر فروش نداشته‌اند: ${alignment.tier_a_without_sales.join("، ")}.` });
  }
  const nonUsd = all.filter((r) => r.currency !== "USD").length;
  if (nonUsd) alerts.push({ level: "info", text: `${nonUsd} ردیف غیر دلاری فقط در تناژ آمده‌اند (مبلغ/میانگین قیمت دلاری را عوض نمی‌کنند).` });

  return {
    empty: false,
    ref_price: ref,
    generated_for_week: latest.week,
    totals: { ...agg(all), weeks: weekly.length },
    latest, prev,
    changes: prev ? { tons_pct: delta(latest.tons, prev.tons), revenue_pct: delta(latest.revenue_usd, prev.revenue_usd), price_pct: delta(latest.avg_price, prev.avg_price) } : null,
    avg4_tons: avg4Tons,
    avg4_weeks: last4.length, // تعداد هفته‌های واقعاً داخل «میانگین هفته‌های قبل» (کمتر از ۴ وقتی تاریخچه کم است)
    weekly,
    by_country: byCountry, by_grade: byGrade, by_incoterm: byIncoterm, by_status: byStatus,
    buyers: buyers.slice(0, 15),
    concentration: { top1_share: top1Share, top3_share: top3Share, hhi, buyer_count: buyers.length },
    price: { fob_avg_all: fobAvg, fob_vs_ref_pct: fobAvg ? round(((fobAvg - ref) / ref) * 100, 1) : null, latest_below_ref_count: belowRef.length },
    new_buyers_latest: newBuyersLatest,
    new_countries_latest: newCountriesLatest,
    alignment,
    alerts,
  };
}

// خلاصه‌ی متنی «بدون نام مشتری/شماره قرارداد» برای «مغز» (فقط وقتی SALES_AI_ENABLED=true). نام مشتری هرگز نمی‌رود.
export function salesContextForBrain(summary) {
  if (!summary || summary.empty) return null;
  const L = [];
  L.push(`دوره: ${summary.totals.weeks} هفته گزارش؛ آخرین هفته‌ی گزارش (شروع شنبه): ${summary.generated_for_week}. قیمت مرجع ${summary.ref_price} دلار FOB.`);
  L.push(`جمع کل: ${summary.totals.tons} تن، ${summary.totals.revenue_usd} دلار (ردیف‌های دلاری)، میانگین وزنی قیمت ${summary.totals.avg_price} دلار/تن، ${summary.totals.deals} قرارداد، ${summary.totals.countries} کشور، ${summary.totals.buyers} مشتری.`);
  L.push("هفته‌های اخیر (هفته | تن | دلار | میانگین قیمت | قراردادها | کشورها):");
  for (const w of summary.weekly.slice(-8)) L.push(`- ${w.week} | ${w.tons} | ${w.revenue_usd} | ${w.avg_price ?? "—"} | ${w.deals} | ${w.countries}`);
  L.push("به تفکیک کشور (تن، سهم، میانگین قیمت، آخرین هفته):");
  for (const c of summary.by_country.slice(0, 10)) L.push(`- ${c.key}: ${c.tons} تن (${c.share_tons}٪)، قیمت ${c.avg_price ?? "—"}، آخرین فروش ${c.last_week}`);
  L.push("به تفکیک گرید: " + summary.by_grade.map((g) => `${g.key} ${g.tons} تن (${g.share_tons}٪، قیمت ${g.avg_price ?? "—"})`).join("؛ "));
  L.push("به تفکیک اینکوترمز: " + summary.by_incoterm.map((g) => `${g.key} ${g.tons} تن`).join("؛ "));
  L.push(`تمرکز مشتری (بدون نام): بزرگ‌ترین مشتری ${summary.concentration.top1_share}٪، سه مشتری برتر ${summary.concentration.top3_share}٪، HHI ${summary.concentration.hhi}.`);
  if (summary.price.fob_avg_all != null) L.push(`میانگین وزنی قیمت FOB-محور: ${summary.price.fob_avg_all} (${summary.price.fob_vs_ref_pct}٪ نسبت به مرجع).`);
  if (summary.alignment) {
    L.push(`سهم تناژ ۸ هفته‌ی اخیر به تفکیک ردهٔ مغز: ${Object.entries(summary.alignment.tier_share_tons).map(([k, v]) => `${k}=${v}٪`).join("، ")}. ردهٔ A بدون فروش: ${summary.alignment.tier_a_without_sales.join("، ") || "ندارد"}.`);
  }
  if (summary.alerts.length) L.push("هشدارها: " + summary.alerts.map((a) => a.text).join(" | "));
  return L.join("\n");
}
