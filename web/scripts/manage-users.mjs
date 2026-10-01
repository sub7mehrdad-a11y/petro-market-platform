// مدیریت کاربران سیستم لاگین (data/users.json) از خط فرمان — چون رمزها باید
// هش (scrypt) ذخیره شن، نه متن‌خام، و دستی ویرایش‌کردن JSON برای این کار
// مستعد خطاست.
//
// استفاده (از پوشه‌ی web/ اجرا کن):
//   node scripts/manage-users.mjs add <username> <password> <viewer|commercial>
//   node scripts/manage-users.mjs remove <username>
//   node scripts/manage-users.mjs list
//
// "add" برای یوزرنیم تکراری، رمز/نقش رو به‌روزرسانی می‌کنه (نه رکورد جدید).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { hashPassword, ROLES } from "../lib/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, "..", "..", "data", "users.json");

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + "\n", "utf-8");
}

function fail(message) {
  console.error("خطا: " + message);
  process.exit(1);
}

const [, , command, ...args] = process.argv;

if (command === "add") {
  const [username, password, role] = args;
  if (!username || !password || !role) {
    fail("استفاده: node scripts/manage-users.mjs add <username> <password> <viewer|commercial>");
  }
  if (!ROLES.includes(role)) {
    fail(`نقش نامعتبر «${role}» — باید یکی از: ${ROLES.join(", ")}`);
  }
  const users = readUsers();
  const existing = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  const passwordHash = hashPassword(password);
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = role;
    console.log(`کاربر «${username}» به‌روزرسانی شد (نقش: ${role}).`);
  } else {
    users.push({ username, passwordHash, role });
    console.log(`کاربر «${username}» اضافه شد (نقش: ${role}).`);
  }
  writeUsers(users);
} else if (command === "remove") {
  const [username] = args;
  if (!username) fail("استفاده: node scripts/manage-users.mjs remove <username>");
  const users = readUsers();
  const next = users.filter((u) => u.username.toLowerCase() !== username.toLowerCase());
  if (next.length === users.length) {
    console.log(`کاربری با نام «${username}» پیدا نشد.`);
  } else {
    writeUsers(next);
    console.log(`کاربر «${username}» حذف شد.`);
  }
} else if (command === "list") {
  const users = readUsers();
  if (users.length === 0) {
    console.log("هیچ کاربری ثبت نشده.");
  } else {
    for (const u of users) console.log(`${u.username}\t${u.role}`);
  }
} else {
  fail(
    "دستور نامعتبر. یکی از این‌ها را استفاده کن:\n" +
      "  node scripts/manage-users.mjs add <username> <password> <viewer|commercial>\n" +
      "  node scripts/manage-users.mjs remove <username>\n" +
      "  node scripts/manage-users.mjs list"
  );
}
