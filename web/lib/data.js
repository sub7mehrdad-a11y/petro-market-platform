import fs from "fs";
import path from "path";

// data/ و reports/ کنار web/ هستن (خواهر پوشه)، نه داخلش — چون هم اسکریپت‌های
// پایتون و هم سایت باید بهشون دسترسی داشته باشن.
const ROOT = path.join(process.cwd(), "..");
const DATA_DIR = path.join(ROOT, "data");
const REPORTS_DIR = path.join(ROOT, "reports");
const MANIFEST_FILE = path.join(REPORTS_DIR, "manifest.json");

function readJsonSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function getPriceHistory() {
  return readJsonSafe(path.join(DATA_DIR, "price_history.json"), []);
}

export function getFlatPriceRecords() {
  const batches = getPriceHistory();
  const rows = [];
  for (const batch of batches) {
    for (const r of batch.records || []) {
      rows.push({ ...r, batch_date: batch.date });
    }
  }
  return rows;
}

export function getNewsAnalysis() {
  const log = readJsonSafe(path.join(DATA_DIR, "news_analysis_log.json"), []);
  return [...log].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getReportsManifest() {
  return readJsonSafe(MANIFEST_FILE, []);
}

export function getReportsDir() {
  return REPORTS_DIR;
}

export function getManifestFile() {
  return MANIFEST_FILE;
}

export function getCompanies() {
  return readJsonSafe(path.join(DATA_DIR, "companies.json"), []);
}

export function getExhibitions() {
  return readJsonSafe(path.join(DATA_DIR, "exhibitions.json"), []);
}

export function getParsedReport(id) {
  const manifest = getReportsManifest();
  const entry = manifest.find((r) => r.id === id);
  if (!entry || !entry.parsed_path) return null;
  const parsed = readJsonSafe(path.join(REPORTS_DIR, entry.parsed_path), null);
  return parsed ? { ...parsed, manifest: entry } : null;
}

// فهرست همه‌ی کشورهایی که حداقل توی یکی از منابع (شرکت/نمایشگاه/گزارش/قیمت) هستن.
export function getCountries() {
  const set = new Set();
  for (const c of getCompanies()) if (c.country) set.add(c.country);
  for (const e of getExhibitions()) if (e.country) set.add(e.country);
  for (const r of getReportsManifest()) if (r.country) set.add(r.country);
  return Array.from(set).sort();
}

export function getCountrySummary(country) {
  const companies = getCompanies().filter((c) => c.country === country);
  const exhibitions = getExhibitions().filter((e) => e.country === country);
  const reports = getReportsManifest().filter((r) => r.country === country);
  const prices = getFlatPriceRecords().filter((p) => p.country_or_region === country);
  return { companies, exhibitions, reports, prices };
}
