// ساخت حساب برای چند کاربر تازه با رمز تصادفی، بدون دست‌زدن به data/users.json (که در مخزن عمومی است).
// خروجی فقط داخل «فایلی که خودت مسیرش را می‌دهی» نوشته می‌شود (رمزها هرگز روی صفحه چاپ نمی‌شوند):
//   - مقدار متغیر PLATFORM_EXTRA_USERS_JSON برای لیارا (هش رمزها، یک خط JSON)
//   - رمز هر کاربر (برای دادن به خودش)
// فایل خروجی را حتماً بیرون از مخزن بگذار و بعد از توزیع رمزها پاکش کن.
//
// استفاده (از پوشه‌ی web):
//   node scripts/make-users-env.mjs <مسیر-فایل-خروجی> <نقش: commercial|viewer> نام1 نام2 ...

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { hashPassword, ROLES } from "../lib/auth.js";

const [, , outFile, role, ...names] = process.argv;
if (!outFile || !ROLES.includes(role) || names.length === 0) {
  console.error("استفاده: node scripts/make-users-env.mjs <فایل-خروجی> <commercial|viewer> نام1 نام2 ...");
  process.exit(1);
}
const repoRoot = path.resolve(process.cwd(), "..");
if (path.resolve(outFile).startsWith(repoRoot)) {
  console.error("خطا: فایل خروجی نباید داخل مخزن گیت باشد (رمزها در آن است).");
  process.exit(1);
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // بدون حروف مشابه (0/O، 1/l/I)
const randomPassword = (len = 14) => Array.from(crypto.randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");

const users = [];
const lines = [];
for (const name of names) {
  const password = randomPassword();
  users.push({ username: name, passwordHash: hashPassword(password), role });
  lines.push(`${name}\t${password}`);
}
const text = [
  "# حساب‌های جدید — محرمانه. بعد از دادن رمزها به صاحبانشان این فایل را پاک کنید.",
  "",
  "## ۱) نام کاربری و رمز (هر کس رمز خودش را دریافت کند)",
  ...lines,
  "",
  "## ۲) متغیر لیارا: پنل لیارا ← برنامه ← تنظیمات ← متغیرهای محیطی ← افزودن",
  "نام متغیر:  PLATFORM_EXTRA_USERS_JSON",
  "مقدار (یک خط، دقیقاً همین):",
  JSON.stringify(users),
  "",
  "## ۳) بعد از ذخیره‌ی متغیر، برنامه را دوباره‌راه‌اندازی/دیپلوی کنید.",
  "",
].join("\n");
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, text, "utf-8");
console.log(`فایل ساخته شد: ${outFile} (${users.length} کاربر با نقش ${role}؛ رمزها فقط داخل همین فایل است).`);
