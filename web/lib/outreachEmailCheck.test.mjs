// node --test web/lib/outreachEmailCheck.test.mjs — بررسی پیش از ارسال: آدرس ساختگی، دامنه‌ی بدون MX، خطای موقت DNS، کش
import test from "node:test";
import assert from "node:assert/strict";
import { checkEmailDeliverable, clearEmailCheckCache, isPlaceholderEmail } from "./outreachEmailCheck.js";
import { isValidEmail } from "./outreachTemplate.js";

test("آدرس‌های ساختگیِ واقعیِ داده‌ی شرکت‌ها ردّ می‌شوند", () => {
  for (const e of ["example@gmail.com", "info@example.com", "name@domain.com", "test@sample.com", "email@xyz.com", "you@example.com", "abc@abc.abc", "hello@yoursite.com"]) assert.equal(isPlaceholderEmail(e), true, e);
  for (const e of ["info@atias.com.br", "sales@neochem.am", "export@tamaragroup.am", "exampleco@gmail.com", "info@hamle.kz"]) assert.equal(isPlaceholderEmail(e), false, e);
  assert.equal(isValidEmail("example@gmail.com"), false);
  assert.equal(isValidEmail("info@hamle.kz"), true);
});

const err = (code) => Object.assign(new Error(code), { code });

test("دامنه‌ی دارای MX قبول، بدون MX یا ناموجود ردّ دائم، خطای DNS موقت", async () => {
  clearEmailCheckCache();
  assert.deepEqual(await checkEmailDeliverable("a@good.kz", { resolveMx: async () => [{ exchange: "mx.good.kz", priority: 10 }] }), { ok: true });
  const noMx = await checkEmailDeliverable("a@chick-peas.com", { resolveMx: async () => { throw err("ENODATA"); } });
  assert.equal(noMx.ok, false); assert.equal(noMx.permanent, true); assert.match(noMx.reason, /MX/);
  const gone = await checkEmailDeliverable("a@hamle.kz", { resolveMx: async () => { throw err("ENOTFOUND"); } });
  assert.equal(gone.permanent, true); assert.match(gone.reason, /وجود ندارد/);
  const nullMx = await checkEmailDeliverable("a@nullmx.com", { resolveMx: async () => [{ exchange: ".", priority: 0 }] });
  assert.equal(nullMx.permanent, true);
  const temp = await checkEmailDeliverable("a@slow.com", { resolveMx: async () => { throw err("ETIMEOUT"); } });
  assert.equal(temp.ok, false); assert.equal(temp.permanent, false);
  assert.equal((await checkEmailDeliverable("example@gmail.com", { resolveMx: async () => { throw new Error("نباید DNS زده شود"); } })).permanent, true);
  assert.equal((await checkEmailDeliverable("bad", { resolveMx: async () => [] })).permanent, true);
});

test("کش: نتیجه‌ی دائم دوباره DNS نمی‌زند؛ خطای موقت پس از ۵ دقیقه دوباره امتحان می‌شود", async () => {
  clearEmailCheckCache();
  let n = 0;
  const mx = async () => { n += 1; return [{ exchange: "m.x", priority: 1 }]; };
  await checkEmailDeliverable("a@c.com", { resolveMx: mx, now: 1000 });
  await checkEmailDeliverable("b@c.com", { resolveMx: mx, now: 2000 });
  assert.equal(n, 1);
  let t = 0;
  const flaky = async () => { t += 1; if (t === 1) throw err("ESERVFAIL"); return [{ exchange: "m.x", priority: 1 }]; };
  assert.equal((await checkEmailDeliverable("a@flaky.com", { resolveMx: flaky, now: 0 })).permanent, false);
  assert.equal((await checkEmailDeliverable("a@flaky.com", { resolveMx: flaky, now: 60 * 1000 })).ok, false, "هنوز در کش موقت");
  assert.equal((await checkEmailDeliverable("a@flaky.com", { resolveMx: flaky, now: 6 * 60 * 1000 })).ok, true);
});
