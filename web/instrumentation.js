// اجرا فقط یک‌بار موقع بالاآمدن سرور (نگاه کن docs: instrumentation.js). کارگر صف ارسال
// ایمیل معرفی و زمان‌بند ارسال خودکار/گزارش هفتگی اینجا شروع می‌شن — فقط توی runtime نود (نه edge/proxy).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startOutreachWorker } = await import("./lib/outreachQueue.js");
    startOutreachWorker();
    const { startOutreachAuto } = await import("./lib/outreachAuto.js");
    startOutreachAuto();
  }
}
