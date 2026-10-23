// اصلاح خودکار ایمیل‌های برگشتی — بخش IO (دانلود صفحه‌های سایت شرکت، DNS، وضعیت پایدار، زمان‌بند). منطق خالص در
// outreachEmailRepairCore.js (تست‌شده).
//
// جریان:
//  ۱) شرکتی که ایمیل معرفی‌اش «برگشت قطعی» خورد با علت «آدرس غلط» (صندوق/دامنه وجود ندارد — کلاس‌بندی outreachBounceCore.js)
//     در صف جست‌وجو می‌رود. برگشت‌های «حجم»، «اسپم» و نامشخص آدرس را غلط نمی‌دانند و دست‌نخورده می‌مانند.
//  ۲) سایت خودِ شرکت (فقط اگر دایرکتوری/شبکه‌ی اجتماعی نباشد و نام شرکت واقعاً روی صفحه باشد) با صفحه‌های تماس خوانده
//     و ایمیل «دیده‌شده روی صفحه» پیدا می‌شود؛ دامنه‌اش باید MX/A داشته باشد؛ ایمیل خراب و ایمیل‌های قبلاً ردشده پیشنهاد نمی‌شوند.
//  ۳) نتیجه = «پیشنهاد» (status=suggested) با لینک منبع. جایگزینی با تأیید کاربر (دکمه در صفحه‌ی شرکت‌های کشور) یا —اگر
//     OUTREACH_EMAIL_REPAIR_AUTO=true— خودکار و فقط برای ایمیل هم‌دامنه با سایت (اطمینان بالا) انجام می‌شود.
//     جایگزینی = ثبت در email_overrides (کنار لاگ ارسال) که getCompanies() اعمال می‌کند؛ بعد از آن شرکت «ارسال‌نشده» است
//     و می‌تواند ایمیل معرفی بگیرد. هیچ ایمیلی خودکار ارسال نمی‌شود.
//
// env: OUTREACH_EMAIL_REPAIR_ENABLED (پیش‌فرض true — فقط خواندن سایت‌ها و DNS است)، OUTREACH_EMAIL_REPAIR_AUTO (پیش‌فرض false)،
//      OUTREACH_EMAIL_REPAIR_PER_RUN (پیش‌فرض ۳، هر ۳۰ دقیقه).

import dns from "node:dns/promises";
import { getCompanies } from "@/lib/data";
import { readFollowupState, mutateFollowupState } from "@/lib/outreachFollowupState";
import { getCompanyEmailStatuses } from "@/lib/outreachCompanyStatus";
import {
  extractEmailsFromHtml, findContactLinks, pickBestEmail, hostOf, siteMatchesCompany, isDirectoryHost, looksLikeRealEmail,
} from "@/lib/outreachEmailRepairCore.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const FALLBACK_PATHS = ["/contact", "/contacts", "/contact-us", "/kontakty", "/en/contact", "/about"];
const MAX_PAGES = 5;
const RETRY_AFTER_DAYS = 7;
const MAX_ATTEMPTS = 2;

export function repairConfig() {
  const per = Number(process.env.OUTREACH_EMAIL_REPAIR_PER_RUN);
  return {
    enabled: process.env.OUTREACH_EMAIL_REPAIR_ENABLED !== "false",
    auto: process.env.OUTREACH_EMAIL_REPAIR_AUTO === "true",
    perRun: Number.isFinite(per) && per > 0 ? Math.min(per, 10) : 3,
  };
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i;

async function fetchHtml(url, { fetchImpl = fetch, timeoutMs = 12000, maxChars = 1_500_000 } = {}) {
  const host = hostOf(url);
  if (!host || PRIVATE_HOST.test(host)) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (type && !/html|xml|text/i.test(type)) return null;
    return { html: (await res.text()).slice(0, maxChars), url: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function domainAcceptsMail(domain, { resolveMx = dns.resolveMx, resolve4 = dns.resolve4 } = {}) {
  try {
    if ((await resolveMx(domain)).length > 0) return true;
  } catch {}
  try {
    return (await resolve4(domain)).length > 0;
  } catch {
    return false;
  }
}

/**
 * ایمیل صحیح یک شرکت را از سایت خودش پیدا می‌کند. deps برای تست جایگزین می‌شود.
 * @returns {Promise<{ok:true,email:string,confidence:string,source_url:string|null,kind:string}|{ok:false,reason:string}>}
 */
export async function findCorrectEmail(company, { badEmail, exclude = [], deps = {} } = {}) {
  const site = String(company.website || "").trim();
  if (!site) return { ok: false, reason: "وب‌سایت ثبت نشده" };
  const rootUrl = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  const host = hostOf(rootUrl);
  if (!host) return { ok: false, reason: "آدرس وب‌سایت نامعتبر" };
  if (isDirectoryHost(host)) return { ok: false, reason: `وب‌سایت ثبت‌شده یک فهرست/شبکه‌ی اجتماعی است (${host})، نه سایت خود شرکت` };

  const first = await fetchHtml(rootUrl, deps);
  if (!first) return { ok: false, reason: "سایت شرکت باز نشد (در دسترس نیست/خطا)" };
  if (!siteMatchesCompany({ html: first.html, host: hostOf(first.url), name: company.english_name })) {
    return { ok: false, reason: "نام شرکت روی صفحه‌ی اصلی سایت دیده نشد (احتمالاً سایت متعلق به شرکت دیگری است)" };
  }

  const base = first.url;
  const emails = new Map();
  const collect = (page) => {
    for (const [e, info] of extractEmailsFromHtml(page.html)) {
      const prev = emails.get(e);
      if (!prev || (info.kind === "mailto" && prev.kind !== "mailto")) emails.set(e, { kind: info.kind, page: page.url });
    }
  };
  collect(first);

  const excluded = new Set([String(badEmail || "").toLowerCase(), ...exclude.map((e) => String(e).toLowerCase())]);
  const domainOk = new Map();
  const tryPick = async () => {
    const usable = new Map();
    for (const [e, info] of emails) {
      if (excluded.has(e)) continue;
      const dom = e.split("@")[1];
      if (!domainOk.has(dom)) domainOk.set(dom, await domainAcceptsMail(dom, deps));
      if (domainOk.get(dom)) usable.set(e, info);
    }
    return pickBestEmail({ emails: usable, websiteUrl: base, companyName: company.english_name, exclude: excluded });
  };

  let best = await tryPick();
  if (!best || best.confidence !== "same_domain") {
    const links = findContactLinks(first.html, base);
    for (const p of FALLBACK_PATHS) { try { links.push(new URL(p, base).href); } catch {} }
    const seen = new Set([first.url]);
    let n = 1;
    for (const link of links) {
      if (n >= MAX_PAGES) break;
      if (seen.has(link)) continue;
      seen.add(link);
      const page = await fetchHtml(link, deps);
      n += 1;
      if (!page) continue;
      collect(page);
      best = await tryPick();
      if (best?.confidence === "same_domain") break;
    }
  }
  if (!best) return { ok: false, reason: "ایمیل معتبری روی صفحه‌های سایت (صفحه‌ی اصلی/تماس) دیده نشد" };
  return { ok: true, email: best.email, confidence: best.confidence, source_url: best.source_url, kind: best.kind };
}

// ---------------------------------------------------------------- وضعیت پایدار (کنار وضعیت پیگیری)
export const getRepairs = () => readFollowupState().repairs || {};

function patchRepair(companyId, patch) {
  mutateFollowupState((s) => {
    s.repairs = s.repairs || {};
    s.repairs[companyId] = { ...(s.repairs[companyId] || {}), ...patch };
  });
}

const nowIso = () => new Date().toISOString();

/** جست‌وجوی ایمیل صحیح برای یک شرکت (دستی یا خودکار) و ثبت نتیجه. `bounce` = وضعیت برگشتی از getCompanyEmailStatuses. */
export async function searchRepair(companyId, { badEmail, bounce, deps } = {}) {
  const company = getCompanies().find((c) => c.id === companyId);
  if (!company) return { ok: false, error: "شرکت پیدا نشد" };
  const prev = getRepairs()[companyId] || {};
  const tried = [...new Set([...(prev.tried || []), ...(prev.suggestion?.email && prev.status === "rejected" ? [prev.suggestion.email] : [])])];
  patchRepair(companyId, { status: "searching", bad_email: badEmail || company.email, bounce_class: bounce?.class || prev.bounce_class || null, attempts: (prev.attempts || 0) + 1, started_at: nowIso() });
  let res;
  try {
    res = await findCorrectEmail(company, { badEmail: badEmail || company.email, exclude: tried, deps });
  } catch (err) {
    res = { ok: false, reason: `خطای غیرمنتظره: ${String(err?.message || err)}` };
  }
  if (res.ok) {
    patchRepair(companyId, { status: "suggested", suggestion: { email: res.email, source_url: res.source_url, confidence: res.confidence, kind: res.kind }, reason: null, checked_at: nowIso(), tried });
  } else {
    patchRepair(companyId, { status: "none_found", suggestion: null, reason: res.reason, checked_at: nowIso(), tried });
  }
  return { ok: true, repair: getRepairs()[companyId] };
}

/** تأیید پیشنهاد: ایمیل جایگزین ثبت می‌شود. by = "manual" | "auto". */
export function approveRepair(companyId, { by = "manual" } = {}) {
  const repair = getRepairs()[companyId];
  const sug = repair?.suggestion;
  if (!sug?.email || repair.status !== "suggested") return { ok: false, error: "پیشنهادی برای تأیید وجود ندارد" };
  if (!looksLikeRealEmail(sug.email)) return { ok: false, error: "ایمیل پیشنهادی معتبر نیست" };
  const company = getCompanies().find((c) => c.id === companyId);
  if (!company) return { ok: false, error: "شرکت پیدا نشد" };
  const dup = getCompanies().find((c) => c.id !== companyId && String(c.email || "").toLowerCase() === sug.email.toLowerCase());
  if (dup) return { ok: false, error: `این ایمیل برای شرکت دیگری (${dup.english_name}) ثبت است` };
  mutateFollowupState((s) => {
    s.email_overrides = s.email_overrides || {};
    s.email_overrides[companyId] = { email: sug.email, bad_email: repair.bad_email || company.email, applied_at: nowIso(), source_url: sug.source_url || null, confidence: sug.confidence, by };
    s.repairs[companyId] = { ...s.repairs[companyId], status: "applied", applied_at: nowIso(), by };
  });
  console.log(`[email-repair] ایمیل «${company.english_name}» اصلاح شد: ${repair.bad_email} → ${sug.email} (${by}, ${sug.confidence})`);
  return { ok: true };
}

export function rejectRepair(companyId) {
  const repair = getRepairs()[companyId];
  if (!repair?.suggestion) return { ok: false, error: "پیشنهادی برای رد وجود ندارد" };
  patchRepair(companyId, { status: "rejected", rejected_at: nowIso(), tried: [...new Set([...(repair.tried || []), repair.suggestion.email])] });
  return { ok: true };
}

// ---------------------------------------------------------------- زمان‌بند
let running = false;

export async function runEmailRepairs({ deps } = {}) {
  const cfg = repairConfig();
  // بخشی از سیستم ایمیل معرفی است: تا رابط آن روشن نشده (OUTREACH_UI_ENABLED) هیچ کاری نمی‌کند.
  if (!cfg.enabled || process.env.OUTREACH_UI_ENABLED !== "true") return { skipped: "disabled" };
  if (running) return { skipped: "busy" };
  running = true;
  try {
    const { companies } = await getCompanyEmailStatuses({});
    const repairs = getRepairs();
    const byId = new Map(getCompanies().map((c) => [c.id, c]));
    const dayMs = 86400000;
    const targets = Object.entries(companies)
      .filter(([id, s]) => {
        if (!s.bounced || !s.bounce?.wrong_address || s.email_overridden) return false;
        const r = repairs[id];
        if (!r) return true;
        if (r.status === "none_found") return (r.attempts || 0) < MAX_ATTEMPTS && Date.now() - Date.parse(r.checked_at || 0) > RETRY_AFTER_DAYS * dayMs;
        return false;
      })
      .slice(0, cfg.perRun);
    let found = 0;
    let applied = 0;
    for (const [id, s] of targets) {
      if (!byId.get(id)) continue;
      const out = await searchRepair(id, { badEmail: s.email, bounce: s.bounce, deps });
      if (out.ok && out.repair?.status === "suggested") {
        found += 1;
        if (cfg.auto && out.repair.suggestion.confidence === "same_domain") {
          if (approveRepair(id, { by: "auto" }).ok) applied += 1;
        }
      }
    }
    if (targets.length) console.log(`[email-repair] ${targets.length} شرکت بررسی شد؛ پیشنهاد: ${found}؛ اعمال خودکار: ${applied}`);
    return { checked: targets.length, found, applied };
  } finally {
    running = false;
  }
}

export function startEmailRepair() {
  if (globalThis.__emailRepairStarted) return;
  globalThis.__emailRepairStarted = true;
  const tick = async () => {
    try { await runEmailRepairs(); } catch (err) { console.error("[email-repair]", err); }
  };
  setTimeout(tick, 3 * 60 * 1000);
  setInterval(tick, 30 * 60 * 1000);
  console.log("[email-repair] زمان‌بند اصلاح ایمیل‌های برگشتی شروع شد (فقط پیشنهاد؛ اعمال خودکار پیش‌فرض خاموش)");
}
