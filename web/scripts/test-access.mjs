// دسترسی نقش‌ها: مشاهده‌گر، بازرگانی (همکار) و مدیر مغز (admin)
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
delete process.env.BRAIN_ADMINS;
const { createSession, SESSION_COOKIE_NAME } = await import("../lib/auth.js");
const { proxy } = await import("../proxy.js");

const call = (path, user) => {
  const headers = {};
  if (user) headers.cookie = `${SESSION_COOKIE_NAME}=${createSession(user)}`;
  return proxy(new NextRequest(`http://localhost${path}`, { headers }));
};
const redirected = (r) => r.status >= 300 && r.status < 400;
const viewer = { username: "manager", role: "viewer" };
const team = { username: "amini", role: "commercial" };
const owner = { username: "admin", role: "commercial" };

// بدون ورود
assert.equal(call("/api/sales/summary").status, 401);
// مشاهده‌گر: عمومی باز، بازرگانی و مغز بسته
assert.equal(call("/ask", viewer).status, 200);
assert.ok(redirected(call("/sales", viewer)));
assert.equal(call("/api/sales/countries", viewer).status, 403);
assert.ok(redirected(call("/brain/learning", viewer)));
// همکار بازرگانی: فروش و /ask باز، آموزش مغز بسته
assert.equal(call("/sales", team).status, 200);
assert.equal(call("/api/sales/countries", team).status, 200);
assert.equal(call("/ask", team).status, 200);
assert.ok(redirected(call("/brain/learning", team)));
assert.ok(redirected(call("/brain/skill", team)));
assert.equal(call("/api/brain/backtest", team).status, 403);
assert.equal(call("/api/brain/ai-health", team).status, 403);
// مدیر مغز
assert.equal(call("/brain/learning", owner).status, 200);
assert.equal(call("/api/brain/backtest", owner).status, 200);
// BRAIN_ADMINS چندنفره
process.env.BRAIN_ADMINS = "admin, kasrayi";
assert.equal(call("/brain/skill", { username: "kasrayi", role: "commercial" }).status, 200);
assert.ok(redirected(call("/brain/skill", team)));
console.log("test-access: ok");
