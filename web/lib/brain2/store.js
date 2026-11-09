import fs from "fs";
import path from "path";
import crypto from "crypto";

// لایه‌ی ذخیره‌ی حافظه‌ی مغز: فایل‌های JSONL «فقط‌افزودنی». هر خط یک رویداد است:
//   {"op":"put","row":{...}}                          ← ردیف تازه
//   {"op":"close","id":"…","at":"…","reason":"…"}      ← بستن ردیف (هیچ ردیفی پاک نمی‌شود)
// حالت جاری با بازپخش رویدادها ساخته می‌شود. هیچ تابعی برای حذف یا بازنویسی خط‌های قبلی وجود ندارد.
//
// ⚠ محل: دیسک دائمی سرور (BRAIN_STATE_DIR، یا زیرپوشه‌ی brain داخل OUTREACH_STATE_DIR = /app/persist لیارا).
// روی لپ‌تاپ .local-state/brain/ که در .gitignore است. مخزن گیت عمومی است: هیچ‌چیز از حافظه، پیش‌بینی‌ها،
// بازخوردها و اعتبارها هرگز داخل مخزن ذخیره نمی‌شود.
//
// چرا JSONL و نه SQLite: ایمیج لیارا node:22-alpine است و وابستگی بومی (better-sqlite3) ممکن است دیپلوی را بشکند؛
// حجم داده کوچک است. این لایه طوری است که بعداً می‌شود موتور را عوض کرد بدون تغییر بقیه‌ی کد.

const REPO_ROOT = path.join(process.cwd(), "..");
export const DOMAIN = process.env.BRAIN_DOMAIN || "baking-soda";

export function getBrainDir() {
  if (process.env.BRAIN_STATE_DIR) return process.env.BRAIN_STATE_DIR;
  if (process.env.OUTREACH_STATE_DIR) return path.join(process.env.OUTREACH_STATE_DIR, "brain");
  return path.join(REPO_ROOT, ".local-state", "brain");
}

/** روی سرور بدون دیسک دائمی ذخیره ممنوع است (با دیپلوی بعدی پاک می‌شد). null = آماده. */
export function brainStorageProblem() {
  if (process.env.NODE_ENV === "production" && !process.env.BRAIN_STATE_DIR && !process.env.OUTREACH_STATE_DIR) {
    return "حافظه‌ی مغز روی سرور نیاز به دیسک دائمی دارد: BRAIN_STATE_DIR (یا OUTREACH_STATE_DIR) تنظیم نشده و داده با دیپلوی بعدی پاک می‌شد.";
  }
  try {
    const dir = getBrainDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return null;
  } catch (err) {
    return `پوشه‌ی حافظه‌ی مغز قابل‌نوشتن نیست: ${err.message}`;
  }
}

const fileOf = (repo) => path.join(getBrainDir(), `${repo}.jsonl`);
const cache = new Map(); // repo → { key, events }

export function readEvents(repo) {
  const file = fileOf(repo);
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return [];
  }
  const key = `${file}:${st.size}:${st.mtimeMs}`;
  const hit = cache.get(repo);
  if (hit && hit.key === key) return hit.events;
  const events = [];
  const lines = fs.readFileSync(file, "utf-8").split("\n");
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      events.push(JSON.parse(line));
    } catch {
      // خط ناقص (مثلاً قطع شدن برق وسط نوشتن) فقط در انتهای فایل ممکن است؛ نادیده گرفته می‌شود و خراب‌کننده نیست
      if (i < lines.length - 2) throw new Error(`خط خراب در وسط ${repo}.jsonl (شماره ${i + 1})؛ فایل دستکاری شده است.`);
    }
  });
  cache.set(repo, { key, events });
  return events;
}

/** تنها راه نوشتن: افزودن یک خط. (همگام است، پس در یک پردازش Node نوشتن‌ها پشت‌سرهم و بدون تداخل‌اند.) */
export function appendEvent(repo, event) {
  // نمره‌ها (scores.jsonl) را فقط جزء سنجش می‌نویسد (پروتکل ۸-۵)؛ از مسیر عمومی مغز نوشتنشان ممنوع است.
  if (repo === SCORES_REPO) throw new Error("نوشتن در scores فقط برای جزء سنجش (lib/brain2/scoring/writer.js) مجاز است.");
  const problem = brainStorageProblem();
  if (problem) throw new Error(problem);
  fs.appendFileSync(fileOf(repo), JSON.stringify(event) + "\n", "utf-8");
  cache.delete(repo);
}

/** فایل خالی مخزن را (اگر نبود) می‌سازد؛ هرگز چیزی را کوتاه یا بازنویسی نمی‌کند ("a" = افزودن). */
export function ensureRepoFile(repo) {
  const problem = brainStorageProblem();
  if (problem) throw new Error(problem);
  fs.closeSync(fs.openSync(fileOf(repo), "a"));
}

export const SCORES_REPO = "scores";

/** تنها راه نوشتن در scores.jsonl. فقط scoring/writer.js آن را import می‌کند (آزمون جداسازی این را می‌سنجد). خواندن از readEvents/currentRows آزاد است. */
export function appendScoreEvent(event) {
  const problem = brainStorageProblem();
  if (problem) throw new Error(problem);
  fs.appendFileSync(fileOf(SCORES_REPO), JSON.stringify(event) + "\n", "utf-8");
  cache.delete(SCORES_REPO);
}

export const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;

/** فیلدهای مشترک همه‌ی مخزن‌ها (بخش ۴-۱ سند): دو خط زمانی، جایگزینی و دلیل تغییر. */
export function stampRow(prefix, fields = {}, now = new Date().toISOString()) {
  return {
    id: newId(prefix),
    created_at: now,
    valid_from: fields.valid_from || now,
    valid_to: fields.valid_to || null,
    recorded_from: now,
    recorded_to: null,
    supersedes: fields.supersedes || null,
    change_reason: fields.change_reason || null,
    domain: DOMAIN,
    ...fields,
  };
}

export function putRow(repo, row) {
  appendEvent(repo, { op: "put", row });
  return row;
}

/** بستن ردیف (نه حذف): recorded_to پر می‌شود. ردیف قدیمی در فایل می‌ماند. */
export function closeRow(repo, id, { reason, by, valid_to, at } = {}) {
  appendEvent(repo, { op: "close", id, at: at || new Date().toISOString(), reason: reason || null, by: by || null, valid_to: valid_to || null });
}

/** حالت جاری: Map(id → ردیف). ردیف‌های بسته‌شده با recorded_to پر برمی‌گردند (تا بشود «در تاریخ X چه باور داشتیم» پرسید). */
export function currentRows(repo) {
  const rows = new Map();
  for (const ev of readEvents(repo)) {
    if (ev.op === "put" && ev.row?.id) rows.set(ev.row.id, { ...ev.row });
    else if (ev.op === "close" && rows.has(ev.id)) {
      const r = rows.get(ev.id);
      r.recorded_to = ev.at;
      if (ev.valid_to) r.valid_to = ev.valid_to;
      r.closed_reason = ev.reason;
    }
  }
  return rows;
}
