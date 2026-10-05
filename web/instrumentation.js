// اجرا فقط یک‌بار موقع بالاآمدن سرور (نگاه کن docs: instrumentation.js). کارگر صف ارسال
// ایمیل معرفی اینجا شروع می‌شه — فقط توی runtime نود (نه edge/proxy).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startOutreachWorker } = await import("./lib/outreachQueue.js");
    startOutreachWorker();
  }
}
