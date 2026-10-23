// منطق «خالص» پیدا کردن ایمیل صحیح یک شرکت (بدون IO/alias) تا با `node --test` تست شود.
// IO (دانلود صفحه‌ها، DNS، وضعیت پایدار) در outreachEmailRepair.js است.
//
// ورودی: HTML صفحه‌های خودِ سایت شرکت (صفحه‌ی اصلی + تماس). خروجی: ایمیل‌های «واقعی» روی همان صفحه‌ها،
// رتبه‌بندی‌شده. قاعده‌ی اعتماد (محافظه‌کارانه — «حدس» برنمی‌گردانیم):
//   same_domain  : دامنه‌ی ایمیل = دامنه‌ی سایت شرکت (اطمینان بالا؛ تنها حالتی که حالت خودکار می‌پذیرد)
//   other_domain : دامنه‌ی دیگر ولی یا mailto رایگان (gmail…) روی صفحه‌ی تماس، یا دامنه‌اش واژه‌ی نام شرکت را دارد
//                  → فقط پیشنهاد؛ تأیید انسانی لازم است.

const FREE_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com", "icloud.com",
  "mail.ru", "bk.ru", "list.ru", "inbox.ru", "yandex.ru", "yandex.com", "i.ua", "ukr.net", "rambler.ru", "aol.com", "proton.me", "protonmail.com",
]);

const BAD_LOCAL = /^(example|test|testing|your|yourname|name|user|username|email|e-?mail|mail|domain|someone|john\.?doe|abc|xxx|noreply|no-?reply|donotreply|do-?not-?reply|mailer-daemon|postmaster|webmaster|abuse|privacy|dpo|gdpr|unsubscribe|root|admin@admin)$/i;
const BAD_LOCAL_SUBSTR = /noreply|no-reply|donotreply|unsubscribe|sentry|wixpress|u003e|%20/i;
const BAD_DOMAIN = /(^|\.)(example\.(com|org|net)|domain\.com|email\.com|yoursite\.com|yourdomain\.com|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|wix\.com|godaddy\.com|schema\.org|w3\.org|sentry\.wixpress\.com)$/i;
const FILE_EXT = /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|eot|pdf|mp4)$/i;

// کشورهایی که سطح دوم دارند (co.uk, com.tr …) برای «دامنه‌ی ثبت‌شده»
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "or", "ne"]);

export function registeredDomain(host) {
  const parts = String(host || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (tld.length === 2 && SECOND_LEVEL.has(sld)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

export function hostOf(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** ایمیل «واقعی» به نظر می‌رسد؟ (نه placeholder/ردیاب/نام فایل). */
export function looksLikeRealEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  const m = /^([a-z0-9._%+\-]+)@([a-z0-9.\-]+\.[a-z]{2,})$/.exec(e);
  if (!m) return false;
  const [, local, domain] = m;
  if (FILE_EXT.test(e) || FILE_EXT.test(domain)) return false;
  if (BAD_LOCAL.test(local) || BAD_LOCAL_SUBSTR.test(local)) return false;
  if (BAD_DOMAIN.test(domain)) return false;
  if (/^[0-9a-f]{24,}$/.test(local)) return false; // شناسه‌ی ردیابی (Wix/Sentry)
  return true;
}

// رمزگشایی ایمیل محافظت‌شده‌ی Cloudflare (data-cfemail="<hex>")
export function decodeCfEmail(hex) {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return decodeURIComponent(escape(out));
  } catch {
    return "";
  }
}

const decodeEntities = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&commat;|&#64;|&#x40;/gi, "@")
    .replace(/&amp;/g, "&");

/**
 * همه‌ی ایمیل‌های یک صفحه‌ی HTML → Map(email → {kind: "mailto"|"text"|"cloudflare"}).
 * mailto قوی‌تر از متن ساده است؛ هر ایمیل با قوی‌ترین نوعش می‌ماند.
 */
export function extractEmailsFromHtml(html) {
  const found = new Map();
  const add = (raw, kind) => {
    const e = decodeEntities(raw).trim().toLowerCase().replace(/^mailto:/, "").split("?")[0].replace(/[.,;:)>\]]+$/, "");
    if (!looksLikeRealEmail(e)) return;
    const prev = found.get(e);
    const rank = { mailto: 3, cloudflare: 2, text: 1 };
    if (!prev || rank[kind] > rank[prev.kind]) found.set(e, { kind });
  };
  const src = String(html || "");
  for (const m of src.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) add(decodeCfEmail(m[1]), "cloudflare");
  for (const m of src.matchAll(/href=["']mailto:([^"'>\s]+)["']/gi)) add(decodeURIComponent(m[1].replace(/%(?![0-9a-f]{2})/gi, "%25")), "mailto");
  // نسخه‌های مبهم‌شده: name [at] domain [dot] com
  const text = decodeEntities(src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s*[\[(]\s*at\s*[\])]\s*/gi, "@")
    .replace(/\s*[\[(]\s*dot\s*[\])]\s*/gi, ".");
  for (const m of text.matchAll(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g)) add(m[0], "text");
  return found;
}

/** لینک‌های «تماس/درباره» داخل HTML (همان دامنه) برای صفحه‌ی بعدی. */
export function findContactLinks(html, baseUrl) {
  const out = new Set();
  const base = hostOf(baseUrl);
  for (const m of String(html || "").matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, " ");
    if (!/contact|kontakt|контакт|связ|about|o-nas|о-компании|о нас|rekvizit|реквизит|bog.?lan|aloqa|байланыс|зв.?язок|تماس/i.test(`${href} ${label}`)) continue;
    try {
      const u = new URL(href, baseUrl);
      if (!/^https?:$/.test(u.protocol) || hostOf(u.href) !== base) continue;
      u.hash = "";
      out.add(u.href);
    } catch {}
  }
  return [...out].slice(0, 6);
}

const ROLE_ORDER = ["info", "sales", "export", "contact", "office", "mail", "marketing", "commercial", "market", "director", "hello", "support"];

function roleScore(local) {
  const l = local.toLowerCase();
  const i = ROLE_ORDER.findIndex((r) => l === r || l.startsWith(`${r}.`) || l.startsWith(`${r}@`));
  return i === -1 ? ROLE_ORDER.length : i;
}

const nameTokens = (name) =>
  String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length >= 4 && !/^(company|limited|group|trading|industries|industry|food|foods|products|international|factory|plant|corporation|holding)$/.test(t));

// فهرست‌ها/شبکه‌های اجتماعی/دایرکتوری‌ها: «وب‌سایت شرکت» نیستند؛ ایمیلی که از آن‌ها بیاید به شرکت نمی‌چسبد.
const DIRECTORY_HOSTS = /(^|\.)(yellowpages|tradeatlas|exportgenius|spyur|yell|barcodes|commercialsy|mino|facebook|instagram|linkedin|twitter|x|youtube|alibaba|made-in-china|europages|kompass|2gis|zoon|orgpage|panjiva|volza|importgenius|globalsources|indiamart|tiu|wa|t)\.[a-z.]{2,}$/i;

export function isDirectoryHost(host) {
  return DIRECTORY_HOSTS.test(String(host || "").toLowerCase());
}

const LEGAL = /^(company|limited|ltd|llc|llp|jsc|ooo|group|trading|industries|industry|food|foods|products|international|factory|plant|corporation|holding|the|and|co|inc|for|of)$/;
const nameTokensLoose = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !LEGAL.test(t));

/** صفحه‌ی اصلی واقعاً مال همین شرکت است؟ (حداقل نیمی از واژه‌های متمایز نام در دامنه یا متن صفحه) */
export function siteMatchesCompany({ html, host, name }) {
  const tokens = nameTokensLoose(name);
  if (tokens.length === 0) return false; // نام لاتین ندارد → نمی‌شود با اطمینان تطبیق داد
  const text = String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").toLowerCase().slice(0, 30000);
  const h = String(host || "").toLowerCase();
  const hits = tokens.filter((t) => h.includes(t) || text.includes(t));
  return hits.length >= Math.ceil(tokens.length / 2);
}

/**
 * @param {{ emails: Map<string,{kind:string,page?:string}>, websiteUrl: string, companyName?: string, exclude?: Set<string> }} p
 * @returns {{ email: string, confidence: "same_domain"|"other_domain", kind: string, source_url: string|null } | null}
 */
export function pickBestEmail({ emails, websiteUrl, companyName, exclude = new Set() }) {
  const siteDom = registeredDomain(hostOf(websiteUrl));
  const tokens = nameTokens(companyName);
  const cands = [];
  for (const [email, info] of emails) {
    if (exclude.has(email)) continue;
    const dom = email.split("@")[1];
    const local = email.split("@")[0];
    const same = registeredDomain(dom) === siteDom;
    let tier = null;
    if (same) tier = 0;
    else {
      const label = registeredDomain(dom).split(".")[0].replace(/[^a-z0-9]/g, "");
      const hasNameToken = tokens.some((t) => label.includes(t));
      if (FREE_DOMAINS.has(dom) && info.kind === "mailto") tier = 1;
      else if (hasNameToken) tier = 1;
    }
    if (tier === null) continue;
    cands.push({ email, tier, role: roleScore(local), kind: info.kind, source_url: info.page || null });
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => a.tier - b.tier || (b.kind === "mailto") - (a.kind === "mailto") || a.role - b.role || a.email.localeCompare(b.email));
  const best = cands[0];
  return { email: best.email, confidence: best.tier === 0 ? "same_domain" : "other_domain", kind: best.kind, source_url: best.source_url };
}
