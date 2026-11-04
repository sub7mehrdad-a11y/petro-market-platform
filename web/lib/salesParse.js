import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  digitsToLatin, editDistance, extractIncoterm, normalizeGrade, normalizePayment, normalizeStage, normalizeText, parseDateCell,
} from "./salesFormat";

// ---------------------------------------------------------------------------------------------------------
// نگاشت نام کشور (انگلیسی/فارسی) به نام فارسی استاندارد پلتفرم + تصحیح غلط‌های املایی رایج تیم
// (Uzbakistan، UZB، Aremenai، Belarous، afghinisn، ...). منبع: scripts/country_name_map.json که ورود شرکت‌ها هم استفاده می‌کند.
let COUNTRY_INDEX = null;
const MANUAL_ALIASES = {
  uzb: "ازبکستان", uzbek: "ازبکستان", uae: "امارات", uk: "بریتانیا", usa: "آمریکا", ksa: "عربستان سعودی", ksa2: "عربستان سعودی",
  rus: "روسیه", kaz: "قزاقستان", tj: "تاجیکستان", kg: "قرقیزستان", afg: "افغانستان", arm: "ارمنستان", aze: "آذربایجان",
};

function countryIndex() {
  if (COUNTRY_INDEX) return COUNTRY_INDEX;
  const idx = { en: new Map(), fa: new Set() };
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "scripts", "country_name_map.json"), "utf-8"));
    for (const [en, v] of Object.entries(raw)) {
      idx.en.set(en.toLowerCase(), v.fa);
      idx.fa.add(v.fa);
    }
  } catch {
    // بدون نگاشت هم کار می‌کند؛ فقط هشدار «کشور ناشناخته» بیشتر می‌شود
  }
  for (const [en, fa] of Object.entries({ iraq: "عراق", "saudi arabia": "عربستان سعودی", russia: "روسیه", iran: "ایران", turkey: "ترکیه", "united arab emirates": "امارات" })) {
    idx.en.set(en, fa);
    idx.fa.add(fa);
  }
  for (const [k, fa] of Object.entries(MANUAL_ALIASES)) idx.en.set(k, fa);
  COUNTRY_INDEX = idx;
  return idx;
}

/** → { name, known, corrected_from } */
export function normalizeCountry(v) {
  // «Iraq(Kurdestan)» → «Iraq»؛ توضیح داخل پرانتز نام کشور نیست
  const t = normalizeText(v).replace(/\(.*?\)/g, "").trim() || normalizeText(v);
  if (!t) return { name: "", known: false };
  const { en, fa } = countryIndex();
  if (fa.has(t)) return { name: t, known: true };
  const key = t.toLowerCase();
  if (en.has(key)) return MANUAL_ALIASES[key] && /[a-z]/i.test(t) ? { name: en.get(key), known: true, corrected_from: t } : { name: en.get(key), known: true };
  // غلط املایی: نزدیک‌ترین نام انگلیسی؛ فاصله‌ی مجاز با طول نام بیشتر می‌شود (۱ برای ≤۵ حرف، ۲ برای ۶–۷، ۳ از ۸ حرف به بالا).
  // اگر دو کشور متفاوت هم‌فاصله باشند (مثل Niger/Nigeria) حدس نمی‌زنیم و «ناشناخته» می‌ماند.
  if (/^[a-z .'-]+$/i.test(key) && key.length >= 4) {
    const limit = key.length <= 5 ? 1 : key.length <= 7 ? 2 : 3;
    let best = null;
    let tie = false;
    for (const cand of en.keys()) {
      if (cand.length < 4 || Math.abs(cand.length - key.length) > limit) continue;
      const d = editDistance(key, cand);
      if (d > limit) continue;
      if (!best || d < best.d) { best = { d, cand }; tie = false; }
      else if (d === best.d && en.get(cand) !== en.get(best.cand)) tie = true;
    }
    if (best && !tie) return { name: en.get(best.cand), known: true, corrected_from: t };
  }
  return { name: t, known: false };
}

// ---------------------------------------------------------------------------------------------------------
// خواندن اکسل. فایل‌های واقعی گاهی «اعتبارسنجی داده»ی تمام‌ستونی دارند که exceljs را می‌ترکاند
// ("Too many properties to enumerate")؛ در آن حالت بلوک dataValidations از XML حذف و دوباره خوانده می‌شود
// (فقط در حافظه؛ هیچ داده‌ای از سلول‌ها عوض نمی‌شود).
async function loadWorkbook(buffer) {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    return wb;
  } catch (firstErr) {
    const zip = await JSZip.loadAsync(buffer);
    for (const name of Object.keys(zip.files)) {
      if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
        const xml = await zip.file(name).async("string");
        zip.file(name, xml.replace(/<dataValidations[\s\S]*?<\/dataValidations>/g, "").replace(/<conditionalFormatting[\s\S]*?<\/conditionalFormatting>/g, ""));
      }
    }
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await zip.generateAsync({ type: "nodebuffer" }));
    } catch {
      throw firstErr;
    }
    return wb;
  }
}

function cellValue(cell) {
  const v = cell?.value;
  if (v == null) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return v.result ?? null; // فرمول
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return v.text;
    return null;
  }
  return v;
}

function toNumber(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(digitsToLatin(v).replace(/[,\s٬$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const alnum = (s) => normalizeText(s).toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, "");

// سرستون‌های فایل «Sales Report 2026» (بعد از alnum) → کلید داخلی
const HEADERS = {
  fileno: "file_no", plant: "plant", customername: "contact", company: "buyer", finaldestination: "country", pidate: "date",
  proposaloffer: "stage", pibachno: "doc_no", pibatchno: "doc_no", grade: "grade", primerypackaging: "packaging", primarypackaging: "packaging",
  secondrypackaging: "packaging2", ordervolumemt: "tons", netpriceperton: "price", netpricepertonne: "price", currency: "currency",
  netweightmt: "net_weight", grossweightmt: "gross_weight", deliveryterms: "delivery", portofdischarge: "port", totalprice: "amount",
  paymentterms: "payment_terms", paymentstatus: "payment_status", productionstatus: "production_status",
  ladingloadingstatus: "loading_status", dateofloading: "loading_date",
};
export const REQUIRED_HEADERS = ["ordervolumemt", "netpriceperton"];

function findHeaderRow(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
    const keys = new Set();
    ws.getRow(r).eachCell({ includeEmpty: false }, (c) => keys.add(alnum(cellValue(c))));
    if (keys.has("ordervolumemt") && (keys.has("netpriceperton") || keys.has("netpricepertonne")) && (keys.has("finaldestination") || keys.has("company"))) return r;
  }
  return null;
}

/**
 * فایل تجمعی فروش را می‌خواند (فرمت «Sales Report 2026»). هر ردیف یک سفارش/پیشنهاد است.
 *  - rows: ردیف‌های دارای تناژ (سفارش قطعی/پیشنهاد/نامشخص با stage)
 *  - errors: ردیف‌هایی که نمی‌توان خواند و ذخیره نمی‌شوند (الان فقط: تناژ نامعتبر)
 *  - warnings: ذخیره می‌شوند ولی نیاز به توجه دارند (قیمت/تاریخ/کشور ندارد، کشور تصحیح شد، ...)
 *  - skipped_empty: ردیف‌های خالی/ناقص بدون تناژ که نادیده گرفته شدند
 */
export async function parseSalesXlsx(buffer) {
  const wb = await loadWorkbook(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: [{ row: 0, message: "فایل شیتی ندارد." }], warnings: [], skipped_empty: 0 };

  const headerRowNo = findHeaderRow(ws);
  if (!headerRowNo) {
    return {
      rows: [], warnings: [], skipped_empty: 0,
      errors: [{ row: 1, message: "سرستون‌های فایل فروش پیدا نشد (باید ستون‌های Order volume(mt) و Net price(per ton) و Final destination باشد). از همان فایل «Sales Report» تیم یا قالب پلتفرم استفاده کنید." }],
    };
  }
  const colOf = {};
  ws.getRow(headerRowNo).eachCell({ includeEmpty: false }, (cell, n) => {
    const key = HEADERS[alnum(cellValue(cell))];
    if (key && !colOf[key]) colOf[key] = n;
  });
  const get = (r, key) => (colOf[key] ? cellValue(r.getCell(colOf[key])) : null);
  const text = (r, key) => normalizeText(get(r, key));

  const rows = [];
  const errors = [];
  const warnings = [];
  let skipped = 0;
  const corrected = new Map();

  ws.eachRow({ includeEmpty: false }, (r, rowNumber) => {
    if (rowNumber <= headerRowNo) return;
    const tonsRaw = get(r, "tons");
    const tons = toNumber(tonsRaw);
    const price = toNumber(get(r, "price"));
    const buyer = text(r, "buyer") || text(r, "contact");
    if (tons == null && price == null && !buyer) { skipped++; return; } // ردیف خالی
    if (/^sample\b/i.test(buyer)) { skipped++; return; } // ردیف نمونه‌ی قالب
    if (tons == null) {
      // ردیفی با مشتری ولی بدون حجم سفارش: هنوز قابل‌شمارش نیست
      if (tonsRaw != null && String(tonsRaw).trim() !== "") errors.push({ row: rowNumber, message: `حجم سفارش «${String(tonsRaw).slice(0, 20)}» عدد نیست` });
      else skipped++;
      return;
    }
    if (tons <= 0) { errors.push({ row: rowNumber, message: "حجم سفارش باید بزرگ‌تر از صفر باشد" }); return; }

    const warn = [];
    const country = normalizeCountry(get(r, "country"));
    if (!country.name) warn.push("کشور مقصد خالی");
    else if (!country.known) warn.push(`کشور «${country.name}» در فهرست پلتفرم نیست`);
    else if (country.corrected_from) corrected.set(country.corrected_from, country.name);

    const date = parseDateCell(get(r, "date"));
    const stage = normalizeStage(get(r, "stage"));
    if (!date) warn.push("تاریخ PI ندارد (در روند هفتگی نمی‌آید)");
    if (price == null) warn.push("قیمت واحد ندارد (در میانگین قیمت و مبلغ نمی‌آید)");
    if (stage === "unknown") warn.push("وضعیت PI (PI issued / Just quoted) خالی است");

    const currencyRaw = text(r, "currency").toUpperCase();
    const currency = currencyRaw || "USD"; // بیشتر ردیف‌ها ارز ندارند و قیمت‌ها دلاری‌اند
    const amountCell = toNumber(get(r, "amount"));
    const amount = amountCell != null ? amountCell : price != null ? Math.round(tons * price * 100) / 100 : null;
    if (amountCell != null && price != null && Math.abs(amountCell - tons * price) > Math.max(5, 0.03 * tons * price)) {
      warn.push(`مبلغ کل (${amountCell}) با حجم × قیمت (${Math.round(tons * price)}) نمی‌خواند`);
    }
    if (currency !== "USD") warn.push(`ارز ${currency} (در مبلغ و میانگین قیمت دلاری نمی‌آید)`);

    const delivery = text(r, "delivery");
    const incoterm = extractIncoterm(delivery);
    if (!incoterm && delivery) warn.push(`شرایط تحویل «${delivery}» اینکوترمز شناخته‌شده ندارد`);
    const loadingStatus = text(r, "loading_status");
    const loadingDate = text(r, "loading_date");
    const loaded = /done/i.test(loadingStatus) || /\d{3,4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}/.test(digitsToLatin(`${loadingStatus} ${loadingDate}`));

    if (warn.length) warnings.push({ row: rowNumber, message: warn.join("؛ ") });
    rows.push({
      row: rowNumber,
      file_no: get(r, "file_no") != null ? String(get(r, "file_no")).trim() : null,
      doc_no: get(r, "doc_no") != null ? String(get(r, "doc_no")).trim() : null,
      date,
      stage,
      buyer: buyer || "نامشخص",
      contact: text(r, "contact") || null,
      country: country.name || "نامشخص",
      grade: normalizeGrade(get(r, "grade")) || "نامشخص",
      tons,
      price,
      currency,
      amount,
      incoterm: incoterm || null,
      delivery_terms: delivery || null,
      plant: text(r, "plant") || null,
      port: text(r, "port") || null,
      payment_terms: text(r, "payment_terms") || null,
      payment_status: normalizePayment(get(r, "payment_status")),
      production_done: /done/i.test(text(r, "production_status")),
      loaded,
    });
  });

  if (corrected.size) {
    warnings.unshift({ row: 0, message: `نام کشور تصحیح شد: ${[...corrected.entries()].map(([a, b]) => `${a} → ${b}`).join("، ")}` });
  }
  return { rows, errors, warnings, skipped_empty: skipped, header_row: headerRowNo };
}
