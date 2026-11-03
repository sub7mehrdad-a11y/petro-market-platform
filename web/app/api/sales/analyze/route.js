import { NextResponse } from "next/server";
import { askBrain, getBrainScores, resolveBrainKey } from "@/lib/brain";
import { salesContextForBrain, summarizeSales } from "@/lib/salesAnalytics";
import { readSalesReports, salesAiEnabled, writeSalesAnalysis } from "@/lib/salesStore";

// «تحلیل هوشمند عملکرد هفته»: مغز، خلاصه‌ی بدون نام مشتری فروش را کنار دانش کل پلتفرم می‌خواند و نتیجه می‌گیرد.
// پیش‌فرض خاموش (SALES_AI_ENABLED) چون داده‌ی قراردادها محرمانه است. نتیجه هر هفته یک‌بار ذخیره می‌شود. فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";

const QUESTION = `
عملکرد فروش تیم بازرگانی را تحلیل کن (فقط بر اساس «عملکرد فروش خودمان» و خلاصه‌ی جامع). با همین ساختار، حداکثر ۴۵۰ کلمه:
۱) وضعیت آخرین هفته نسبت به روند هفته‌های قبل (تناژ، قیمت، تعداد قراردادها).
۲) کیفیت قیمت‌ها نسبت به قیمت مرجع و بازار هر کشور.
۳) ترکیب کشور/گرید و میزان هم‌خوانی آن با اولویت‌ها و رتبه‌بندی مغز.
۴) ریسک‌ها (تمرکز مشتری یا بازار، افت قیمت، وابستگی).
۵) سه اقدام مشخص و قابل‌اجرا برای هفته‌ی آینده (کدام کشور/گرید/قیمت).
اگر داده برای قضاوت کافی نیست (مثلاً فقط یک هفته گزارش داریم) صریح بگو.
`.trim();

export async function POST() {
  if (!salesAiEnabled()) {
    return NextResponse.json(
      { error: "تحلیل هوشمند فروش خاموش است (SALES_AI_ENABLED). داده‌ی قراردادها محرمانه است و خلاصه‌اش فقط با تصمیم صریح مدیریت به سرویس هوش مصنوعی فرستاده می‌شود." },
      { status: 403 }
    );
  }
  const key = resolveBrainKey();
  if (!key) return NextResponse.json({ error: "کلید مغز (GEMINI_API_KEY_BRAIN) تنظیم نشده." }, { status: 503 });

  const scores = getBrainScores();
  const summary = summarizeSales(readSalesReports(), {
    countryScores: (scores?.countries || []).map((c) => ({ country: c.country, tier: c.tier, rank: c.rank })),
  });
  if (summary.empty) return NextResponse.json({ error: "هنوز گزارشی بارگذاری نشده." }, { status: 400 });

  try {
    const { answer, ungrounded } = await askBrain({ apiKey: key, question: QUESTION, salesContext: salesContextForBrain(summary) });
    const analysis = { week: summary.generated_for_week, generated_at: new Date().toISOString(), text: answer, ungrounded_numbers: ungrounded };
    writeSalesAnalysis(analysis);
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    return NextResponse.json({ error: `تحلیل انجام نشد: ${String(err?.message || err).slice(0, 200)}` }, { status: 502 });
  }
}
