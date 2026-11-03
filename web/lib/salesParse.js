import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { COLUMNS, INCOTERMS, digitsToLatin, normalizeGrade, normalizeStatus, normalizeText, parseDateCell, weekStartOf } from "./salesFormat";

// نگاشت نام کشور (انگلیسی/فارسی) به نام فارسی استاندارد پلتفرم — از همان فایلی که ورود شرکت‌ها استفاده می‌کند.
let COUNTRY_INDEX = null;
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
  for (const [en, fa] of Object.entries({ iraq: "عراق", "saudi arabia": "عربستان سعودی", russia: "روسیه", iran: "ایران", turkey: "ترکیه", uae: "امارات", "united arab emirates": "امارات" })) {
    idx.en.set(en, fa);
    idx.fa.add(fa);
  }
  COUNTRY_INDEX = idx;
  return idx;
}

export function normalizeCountry(v) {
  const t = normalizeText(v);
  if (!t) return { name: "", known: false };
  const { en, fa } = countryIndex();
  if (fa.has(t)) return { name: t, known: true };
  const hit = en.get(t.toLowerCase());
  if (hit) return { name: hit, known: true };
  return { name: t, known: false };
}

function cellValue(cell) {
  const v = cell?.value;
  if (v == null) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return v.result ?? null; // فرمول
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return v.text;
  }
  return v;
}

function toNumber(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(digitsToLatin(v).replace(/[,\s٬]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const HEADER_TO_KEY = Object.fromEntries(COLUMNS.map((c) => [normalizeText(c.header), c.key]));

/**
 * اکسل گزارش هفتگی را می‌خواند. خروجی: { rows, errors[], warnings[], weeks[] }.
 *  - errors: ردیف‌هایی که ذخیره نمی‌شوند (فیلد الزامی نامعتبر).
 *  - warnings: ردیف ذخیره می‌شود ولی نیاز به توجه دارد (کشور ناشناخته، ارز غیردلاری، اینکوترمز خالی، ...).
 */
export async function parseSalesXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: [{ row: 0, message: "فایل شیتی ندارد." }], warnings: [], weeks: [] };

  const headerRow = ws.getRow(1);
  const colOf = {};
  headerRow.eachCell((cell, n) => {
    const key = HEADER_TO_KEY[normalizeText(cellValue(cell))];
    if (key) colOf[key] = n;
  });
  const missing = ["date", "buyer", "country", "tons", "price"].filter((k) => !colOf[k]);
  if (missing.length) {
    const names = missing.map((k) => COLUMNS.find((c) => c.key === k).header).join("، ");
    return { rows: [], errors: [{ row: 1, message: `ستون‌های الزامی در ردیف اول پیدا نشد: ${names}. از قالب رسمی استفاده کنید.` }], warnings: [], weeks: [] };
  }

  const rows = [];
  const errors = [];
  const warnings = [];
  const get = (r, key) => (colOf[key] ? cellValue(r.getCell(colOf[key])) : null);

  ws.eachRow((r, rowNumber) => {
    if (rowNumber === 1) return;
    const buyerRaw = normalizeText(get(r, "buyer"));
    const anyData = COLUMNS.some((c) => {
      const v = get(r, c.key);
      return v != null && String(v).trim() !== "";
    });
    if (!anyData) return; // ردیف خالی
    if (/^نمونه/.test(buyerRaw) || /^نمونه/.test(normalizeText(get(r, "doc_no")))) return; // ردیف نمونه

    const date = parseDateCell(get(r, "date"));
    const tons = toNumber(get(r, "tons"));
    const price = toNumber(get(r, "price"));
    const country = normalizeCountry(get(r, "country"));
    const problems = [];
    if (!date) problems.push("تاریخ نامعتبر یا خالی");
    if (!buyerRaw) problems.push("شرکت طرف قرارداد خالی");
    if (!country.name) problems.push("کشور مقصد خالی");
    if (tons == null || tons <= 0) problems.push("تناژ باید عددی بزرگ‌تر از صفر باشد");
    if (price == null || price < 0) problems.push("قیمت واحد نامعتبر");
    if (problems.length) {
      errors.push({ row: rowNumber, message: problems.join("؛ ") });
      return;
    }

    const currency = (normalizeText(get(r, "currency")) || "USD").toUpperCase();
    const incoterm = normalizeText(get(r, "incoterm")).toUpperCase();
    const amountCell = toNumber(get(r, "amount"));
    const amount = amountCell != null && amountCell >= 0 ? amountCell : Math.round(tons * price * 100) / 100;
    const warn = [];
    if (!country.known) warn.push(`کشور «${country.name}» در فهرست پلتفرم نیست`);
    if (!incoterm) warn.push("اینکوترمز خالی (در مقایسه با قیمت مرجع نمی‌آید)");
    else if (!INCOTERMS.includes(incoterm)) warn.push(`اینکوترمز «${incoterm}» ناشناخته`);
    if (currency !== "USD") warn.push(`ارز ${currency} (در جمع مبلغ و میانگین قیمت دلاری نمی‌آید)`);
    if (amountCell != null && Math.abs(amountCell - tons * price) > Math.max(1, 0.02 * tons * price)) {
      warn.push("مبلغ کل با تناژ × قیمت نمی‌خواند");
    }
    if (warn.length) warnings.push({ row: rowNumber, message: warn.join("؛ ") });

    rows.push({
      date,
      doc_no: normalizeText(get(r, "doc_no")) || null,
      buyer: buyerRaw,
      country: country.name,
      grade: normalizeGrade(get(r, "grade")) || "سایر",
      tons,
      price,
      incoterm: INCOTERMS.includes(incoterm) ? incoterm : incoterm || null,
      currency,
      amount,
      status: normalizeStatus(get(r, "status")) || null,
      payment_terms: normalizeText(get(r, "payment_terms")) || null,
      notes: normalizeText(get(r, "notes")) || null,
    });
  });

  const weeks = [...new Set(rows.map((x) => weekStartOf(x.date)))].sort();
  return { rows, errors, warnings, weeks };
}
