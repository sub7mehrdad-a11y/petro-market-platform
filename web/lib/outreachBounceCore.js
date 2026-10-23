// منطق «خالص» تشخیص علت برگشتی (bounce) — بدون IO و بدون alias «@/» تا با `node --test` تست شود.
//
// سرور ایمیل شرکت (SmarterMail) برای هر برگشتی یک پیام «Failed: <موضوع ایمیل ما>» می‌فرستد که متنش
// «Remote Server returned: '<پاسخ سرور مقصد>'» دارد. از همان پاسخ علت واقعی درمی‌آید. نمونه‌های واقعی (اکتبر ۲۰۲۶):
//   550 User not found / 550 No Such User Here / 550 5.1.1 The email account … does not exist  → صندوق وجود ندارد
//   600 … No DNS information was found for the 'x' domain … Host not found                       → دامنه وجود ندارد
//   602 … No MX records were found for the 'x' domain                                             → دامنه سرور ایمیل ندارد
//   552 Message size of '2717308' exceeds max message size of '1150976'                           → حجم ایمیل بیش از سقف مقصد
//   554 5.7.1 Message rejected under suspicion of SPAM                                            → رد به‌عنوان اسپم
//
// کلاس‌ها: no_mailbox | no_domain (آدرس غلط → قابل اصلاح) ، size | blocked | other (آدرس احتمالاً درست است).

export const BOUNCE_CLASSES = {
  no_mailbox: { label_fa: "صندوق این آدرس وجود ندارد", wrong_address: true },
  no_domain: { label_fa: "دامنه‌ی این آدرس وجود ندارد/سرور ایمیل ندارد", wrong_address: true },
  size: { label_fa: "حجم ایمیل بیش از سقف سرور مقصد بود", wrong_address: false },
  blocked: { label_fa: "سرور مقصد ایمیل را اسپم/ناخواسته دانست", wrong_address: false },
  other: { label_fa: "برگشت خورد (علت مشخص نیست)", wrong_address: false },
};

// بدنه‌ی DSN ممکن است quoted-printable باشد: «=\r\n» (شکستن خط) و «=3D».
function unQuote(text) {
  return String(text || "").replace(/=\r?\n/g, "").replace(/=3D/gi, "=");
}

/** پاسخ سرور مقصد (کوتاه) از متن خام DSN؛ رشته‌ی خالی اگر پیدا نشد. */
export function extractBounceReason(rawText) {
  const t = unQuote(rawText).replace(/\r/g, "");
  const m = /Remote Server returned:\s*'?([^\n]*(?:\n(?![\n-])[ \t]+[^\n]*)*)/i.exec(t);
  let reason = m ? m[1] : "";
  if (!reason) {
    const d = /Diagnostic-Code:\s*(?:smtp;)?\s*([^\n]+(?:\n[ \t]+[^\n]+)*)/i.exec(t);
    if (d) reason = d[1];
  }
  return reason.replace(/\s+/g, " ").replace(/'\s*$/, "").trim().slice(0, 300);
}

/** علت (متن پاسخ سرور مقصد) → کلاس برگشتی. ترتیب مهم است (مثلاً «5.7.1 No such user» اسپم نیست). */
export function classifyBounce(reason) {
  const r = String(reason || "");
  if (!r.trim()) return "other";
  if (/exceeds?.{0,40}(max|size)|message size|too large|size limit|552\b.*size/i.test(r)) return "size";
  if (/no dns information|host not found|not in dns|no mx records?|domain .{0,40}(not found|does not exist|doesn.t exist)|nxdomain|name or service not known|unable to resolve|couldn.t resolve/i.test(r)) return "no_domain";
  if (/user (not found|unknown|is terminated|does not exist)|no such (user|mailbox|recipient|account)|does not exist|doesn.t exist|invalid (mailbox|recipient|address)|mailbox (not found|unavailable|does not exist|is disabled)|unknown (user|recipient)|recipient (address )?rejected|account .{0,20}(disabled|inactive|suspended|terminated)|\bdisabled\b|5\.1\.[1-6]\b|address rejected|not a valid mailbox|no mailbox here/i.test(r)) return "no_mailbox";
  if (/spam|blocked|blacklist|black list|reputation|policy|dmarc|spf|denied|rejected under|not (allowed|permitted)|refused to accept/i.test(r)) return "blocked";
  return "other";
}

export function describeBounce(reason) {
  const cls = classifyBounce(reason);
  return { class: cls, label_fa: BOUNCE_CLASSES[cls].label_fa, wrong_address: BOUNCE_CLASSES[cls].wrong_address, reason: String(reason || "").slice(0, 300) };
}
