// تست رله‌ی هوش مصنوعی: مسیر درخواست‌ها با AI_RELAY_URL، هدرها، رفتار پیش‌فرض بدون رله، منطق Worker و پیام فارسی خطای منطقه.
//   node --import ./scripts/alias-loader.mjs scripts/test-ai-relay.mjs
import http from "node:http";
import assert from "node:assert/strict";

delete process.env.HTTPS_PROXY; delete process.env.https_proxy; delete process.env.HTTP_PROXY; delete process.env.http_proxy;
const { upstream, locationErrorFa } = await import("../lib/aiRelay.js");
const { generateContent } = await import("../lib/geminiFetch.js");
const { generateGroqContent } = await import("../lib/groqFetch.js");
const worker = await import("../../tools/ai-relay/worker.js");

// بدون رله: مستقیم
delete process.env.AI_RELAY_URL;
assert.equal(upstream("gemini", "/v1beta/models/m:generateContent").url, "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent");
assert.equal(upstream("groq", "/openai/v1/chat/completions").url, "https://api.groq.com/openai/v1/chat/completions");
assert.deepEqual(upstream("groq", "/x").headers, {});

// با رله: سرور محلی به‌جای Worker
const seen = [];
const srv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push({ url: req.url, token: req.headers["x-relay-token"], gkey: req.headers["x-goog-api-key"], auth: req.headers.authorization, body });
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/gemini/")) res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: "پاسخ جمینای" }] } }] }));
    else res.end(JSON.stringify({ choices: [{ message: { content: "پاسخ گروق" } }] }));
  });
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
process.env.AI_RELAY_URL = `http://127.0.0.1:${srv.address().port}/`;
process.env.AI_RELAY_TOKEN = "tok123";
assert.equal(upstream("gemini", "/v1beta/x").url, `http://127.0.0.1:${srv.address().port}/gemini/v1beta/x`, "اسلش آخر حذف می‌شود");
assert.equal(await generateContent({ apiKey: "K1", model: "gemini-x", systemInstruction: "s", input: "q" }), "پاسخ جمینای");
assert.equal(await generateGroqContent({ apiKey: "K2", systemInstruction: "s", input: "q", maxTokens: 100 }), "پاسخ گروق");
srv.close();
assert.equal(seen[0].url, "/gemini/v1beta/models/gemini-x:generateContent");
assert.equal(seen[0].token, "tok123");
assert.equal(seen[0].gkey, "K1");
assert.equal(seen[1].url, "/groq/openai/v1/chat/completions");
assert.equal(seen[1].token, "tok123");
assert.equal(seen[1].auth, "Bearer K2");
delete process.env.AI_RELAY_URL; delete process.env.AI_RELAY_TOKEN;

// رله یا شبکه‌ای که هرگز جواب نمی‌دهد: پس از مهلت خطای فارسی می‌آید، نه انتظار بی‌پایان
const hang = http.createServer(() => {}); // اتصال را می‌پذیرد و هیچ‌وقت پاسخ نمی‌دهد
await new Promise((r) => hang.listen(0, "127.0.0.1", r));
process.env.AI_RELAY_URL = `http://127.0.0.1:${hang.address().port}`;
process.env.AI_RELAY_TOKEN = "t";
process.env.AI_TIMEOUT_MS = "400";
const t0 = Date.now();
await assert.rejects(() => generateContent({ apiKey: "K", model: "m", systemInstruction: "s", input: "q" }), /Gemini: پاسخی در مهلت مجاز نیامد.*رله/);
await assert.rejects(() => generateGroqContent({ apiKey: "K", systemInstruction: "s", input: "q", maxTokens: 100 }), /Groq: پاسخی در مهلت مجاز نیامد/);
assert.ok(Date.now() - t0 < 5000, "گیر نکرد");
hang.closeAllConnections?.(); hang.close();
delete process.env.AI_RELAY_URL; delete process.env.AI_RELAY_TOKEN; delete process.env.AI_TIMEOUT_MS;

// منطق Worker (بدون شبکه)
const calls = [];
const fakeFetch = async (url, init) => { calls.push({ url, headers: Object.fromEntries(init.headers) }); return new Response('{"ok":1}', { status: 200, headers: { "content-type": "application/json" } }); };
const env = { RELAY_TOKEN: "sec" };
const mk = (path, { token = "sec", method = "POST", extra = {} } = {}) => new Request(`https://relay.example${path}`, { method, headers: { "x-relay-token": token, "x-goog-api-key": "G", authorization: "Bearer R", cookie: "no", ...extra }, body: method === "POST" ? "{}" : undefined });
assert.equal((await worker.handle(mk("/gemini/v1beta/models/gemini-3.6-flash:generateContent", { token: "bad" }), env, fakeFetch)).status, 403, "رمز غلط");
assert.equal((await worker.handle(mk("/gemini/v1beta/models/m:generateContent"), {}, fakeFetch)).status, 403, "بدون RELAY_TOKEN در محیط همیشه رد");
assert.equal((await worker.handle(mk("/gemini/v1beta/models/m:generateContent", { method: "GET" }), env, fakeFetch)).status, 405);
assert.equal((await worker.handle(mk("/gemini/v1beta/models/m:streamGenerateContent"), env, fakeFetch)).status, 404, "فقط مسیر مجاز");
assert.equal((await worker.handle(mk("/groq/v1/models"), env, fakeFetch)).status, 404);
assert.equal((await worker.handle(mk("/other/x"), env, fakeFetch)).status, 404);
assert.equal(calls.length, 0, "درخواست رد‌شده هرگز به بالادست نمی‌رود");
const ok = await worker.handle(mk("/gemini/v1beta/models/gemini-3.6-flash:generateContent"), env, fakeFetch);
assert.equal(ok.status, 200);
assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent");
assert.equal(calls[0].headers["x-goog-api-key"], "G");
assert.ok(!("authorization" in calls[0].headers) && !("cookie" in calls[0].headers) && !("x-relay-token" in calls[0].headers), "فقط هدر کلیدِ همان سرویس عبور می‌کند");
await worker.handle(mk("/groq/openai/v1/chat/completions"), env, fakeFetch);
assert.equal(calls[1].url, "https://api.groq.com/openai/v1/chat/completions");
assert.equal(calls[1].headers.authorization, "Bearer R");
assert.ok(!("x-goog-api-key" in calls[1].headers));

// پیام خطای منطقه
assert.match(locationErrorFa("Gemini 400: User location is not supported for the API use."), /AI_RELAY_URL/);
assert.equal(locationErrorFa("Groq 429: rate limit"), null);

console.log("✔ تست رله‌ی هوش مصنوعی گذشت");
