// node --test web/lib/outreachEmailRepairCore.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { extractEmailsFromHtml, findContactLinks, pickBestEmail, looksLikeRealEmail, registeredDomain, decodeCfEmail } from "./outreachEmailRepairCore.js";

test("ایمیل آشغال/ردیاب/placeholder رد می‌شود", () => {
  for (const e of [
    "605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com", "email@example.com", "example@example.com", "you@yourdomain.com",
    "logo@2x.png", "noreply@acme.com", "18d2f96d279149989b95faf0a4b41882@sentry.io", "postmaster@acme.com",
  ]) assert.equal(looksLikeRealEmail(e), false, e);
  for (const e of ["info@acme.kg", "sales@avita.kg", "ceo.office@maxrazmah.kz", "name.surname@gmail.com"]) assert.equal(looksLikeRealEmail(e), true, e);
});

test("دامنه‌ی ثبت‌شده", () => {
  assert.equal(registeredDomain("www.avita.kg"), "avita.kg");
  assert.equal(registeredDomain("mail.acme.co.uk"), "acme.co.uk");
  assert.equal(registeredDomain("shop.farm.com.tr"), "farm.com.tr");
});

test("استخراج: mailto، متن ساده، مبهم‌شده، Cloudflare، entity", () => {
  // cfemail برای info@avita.kg با کلید 0x2a
  const key = 0x2a;
  const target = "info@avita.kg";
  const hex = key.toString(16).padStart(2, "0") + [...target].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");
  assert.equal(decodeCfEmail(hex), target);
  const html = `
    <a href="mailto:Sales@Avita.KG?subject=Hi">mail us</a>
    <p>Export: export [at] avita [dot] kg</p>
    <span data-cfemail="${hex}">[email&#160;protected]</span>
    <p>office&#64;avita.kg</p>
    <img src="logo@2x.png"> junk 605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com
    <script>var x = "hidden@scripted.com"</script>`;
  const m = extractEmailsFromHtml(html);
  assert.deepEqual([...m.keys()].sort(), ["export@avita.kg", "info@avita.kg", "office@avita.kg", "sales@avita.kg"]);
  assert.equal(m.get("sales@avita.kg").kind, "mailto");
  assert.equal(m.get("info@avita.kg").kind, "cloudflare");
});

test("لینک تماس فقط هم‌دامنه", () => {
  const html = `<a href="/contacts">Контакты</a><a href="https://other.com/contact">x</a><a href="/products">p</a><a href="/about-us">About</a>`;
  assert.deepEqual(findContactLinks(html, "https://avita.kg/"), ["https://avita.kg/contacts", "https://avita.kg/about-us"]);
});

test("انتخاب بهترین: هم‌دامنه > رایگان-mailto؛ ایمیل خراب و حذف‌شده نیست؛ info بر شخصی ارجح", () => {
  const emails = new Map([
    ["john.smith@avita.kg", { kind: "text" }],
    ["info@avita.kg", { kind: "text" }],
    ["avita.office@gmail.com", { kind: "mailto" }],
    ["random@elsewhere.com", { kind: "mailto" }],
  ]);
  const best = pickBestEmail({ emails, websiteUrl: "https://avita.kg", companyName: "Avita Kyrgyzstan" });
  assert.equal(best.email, "info@avita.kg");
  assert.equal(best.confidence, "same_domain");

  // ایمیل غلط (که برگشت خورده) نباید دوباره پیشنهاد شود
  const again = pickBestEmail({ emails, websiteUrl: "https://avita.kg", companyName: "Avita", exclude: new Set(["info@avita.kg", "john.smith@avita.kg"]) });
  assert.equal(again.email, "avita.office@gmail.com");
  assert.equal(again.confidence, "other_domain");

  // فقط دامنه‌ی نامرتبط → هیچ
  assert.equal(pickBestEmail({ emails: new Map([["random@elsewhere.com", { kind: "mailto" }]]), websiteUrl: "https://avita.kg", companyName: "Avita" }), null);
  // دامنه‌ی دیگر با واژه‌ی نام شرکت → other_domain
  const named = pickBestEmail({ emails: new Map([["info@vitamedgroup.com", { kind: "text" }]]), websiteUrl: "https://vitamedltd.kg", companyName: "Vitamed Group Ltd" });
  assert.equal(named.confidence, "other_domain");
});
