// node --test web/lib/outreachBounceCore.test.mjs   — نمونه‌ها همه پاسخ‌های واقعی سرورهای مقصد در بایگانی برگشتی‌های اکتبر ۲۰۲۶ هستند.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyBounce, extractBounceReason, describeBounce } from "./outreachBounceCore.js";

const REAL = [
  ["550 User not found. See http://mail.i.ua/err/2/", "no_mailbox"],
  ["550 No Such User Here", "no_mailbox"],
  ["550 5.1.1 The email account that you tried to reach does not exist. Please try 5.1.1 double-checking the recipient's email address for typos or 5.1.1 unnecessary spaces. gsmtp", "no_mailbox"],
  ["550 Message was not accepted -- invalid mailbox.  Local mailbox asiaexport.uz@bk.ru is unavailable: user not found", "no_mailbox"],
  ["550 Message was not accepted -- invalid mailbox.  Local mailbox dushanbe@osonpharm.tj is unavailable: account is disabled", "no_mailbox"],
  ["550 Message was not accepted -- invalid mailbox.  Local mailbox astana@maxrazmah.kz is unavailable: user is terminated", "no_mailbox"],
  ["550 5.7.1 No such user! 1792224625-OASJwe4bwKo0", "no_mailbox"],
  ["550 Disabled", "no_mailbox"],
  ["600 Failed to connect to the recipient's mail server.  No DNS information was found for the 'urganchyog.uz' domain. Status: 544 5.4.4 Host not found (not in DNS).", "no_domain"],
  ["602 Failed to connect to the recipient's mail server.  No MX records were found for the 'tajnet.com' domain. Status: 544", "no_domain"],
  ["552 Message size of '2717308' exceeds max message size of '1150976'", "size"],
  ["554 5.7.1 Message rejected under suspicion of SPAM; https://ya.cc/1IrBc 1791873341-cZM06x7ffKo0", "blocked"],
  ["530 5.7.1 Connection refused", "other"],
  ["", "other"],
];

test("کلاس‌بندی علت‌های واقعی", () => {
  for (const [reason, cls] of REAL) assert.equal(classifyBounce(reason), cls, reason);
});

test("آدرس غلط فقط برای no_mailbox و no_domain", () => {
  assert.equal(describeBounce(REAL[0][0]).wrong_address, true);
  assert.equal(describeBounce(REAL[8][0]).wrong_address, true);
  assert.equal(describeBounce(REAL[10][0]).wrong_address, false);
  assert.equal(describeBounce(REAL[11][0]).wrong_address, false);
});

test("استخراج علت از متن خام DSN (ساده، quoted-printable، چندخطی)", () => {
  const plain = "Delivery has failed to these recipients:\r\ninfo@ata.kg\r\nSubject: Stable supply\r\nRemote Server returned: '550 No Such User Here'\r\n\r\n--boundary--";
  assert.equal(extractBounceReason(plain), "550 No Such User Here");
  const qp = "Remote Server returned: '550 5.1.1 The email account that you tried to reach does not exi=\r\nst. gsmtp'\r\n\r\nx";
  assert.match(extractBounceReason(qp), /does not exist\. gsmtp$/);
  const folded = "Remote Server returned: '600 Failed to connect.\r\n  No DNS information was found for the 'x.uz' domain.'\r\n\r\n";
  assert.match(extractBounceReason(folded), /No DNS information/);
  assert.equal(extractBounceReason("Diagnostic-Code: smtp; 550 5.1.1 user unknown\r\n\r\n"), "550 5.1.1 user unknown");
  assert.equal(extractBounceReason("هیچ علتی نیست"), "");
});
