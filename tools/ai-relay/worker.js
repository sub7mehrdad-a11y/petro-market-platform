// رله‌ی هوش مصنوعی برای Cloudflare Workers. سرور سایت (لیارا، ایران) به Gemini و Groq دسترسی مستقیم ندارد؛
// این Worker بیرون از ایران اجرا می‌شود و فقط دو مسیر ثابت را (با رمز مشترک) به سرویس اصلی می‌رساند.
// کلید Gemini/Groq همان هدر همیشگی است و روی خود Worker ذخیره نمی‌شود؛ فقط عبور می‌کند.
// متغیر لازم (Secret در Cloudflare): RELAY_TOKEN — همان مقدار AI_RELAY_TOKEN در لیارا.
// راه‌اندازی: tools/ai-relay/README.md

const ROUTES = [
  { service: "gemini", origin: "https://generativelanguage.googleapis.com", path: /^\/v1beta\/models\/[\w.\-]+:generateContent$/, keep: ["x-goog-api-key"] },
  { service: "groq", origin: "https://api.groq.com", path: /^\/openai\/v1\/chat\/completions$/, keep: ["authorization"] },
];

export async function handle(request, env, doFetch = fetch) {
  if (!env.RELAY_TOKEN || request.headers.get("x-relay-token") !== env.RELAY_TOKEN) return new Response("forbidden", { status: 403 });
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/(gemini|groq)(\/.*)$/);
  const route = m && ROUTES.find((r) => r.service === m[1] && r.path.test(m[2]));
  if (!route) return new Response("not found", { status: 404 });
  const headers = new Headers({ "content-type": "application/json" });
  for (const h of route.keep) if (request.headers.get(h)) headers.set(h, request.headers.get(h));
  const upstream = await doFetch(route.origin + m[2], { method: "POST", headers, body: request.body });
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "application/json" } });
}

export default { fetch: (request, env) => handle(request, env) };
