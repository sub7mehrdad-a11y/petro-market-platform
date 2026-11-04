import { NextResponse } from "next/server";
import { askBrain, getBrainScores, resolveBrainKey } from "@/lib/brain";
import { salesContextForBrain, summarizeSales } from "@/lib/salesAnalytics";
import { readSalesSnapshots, salesAiEnabled, writeSalesAnalysis } from "@/lib/salesStore";
import { ledgerContextForBrain } from "@/lib/salesLedger";
import { loadAccounts } from "@/lib/salesLedgerStore";

// «تحلیل هوشمند عملکرد هفته»: مغز، خلاصه‌ی بدون نام مشتری فروش را کنار دانش کل پلتفرم می‌خواند و نتیجه می‌گیرد.
// پیش‌فرض خاموش (SALES_AI_ENABLED) چون داده‌ی قراردادها محرمانه است. نتیجه هر هفته یک‌بار ذخیره می‌شود. فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";

const QUESTION = `
عملکرد فروش تیم بازرگانی را تحلیل کن (فقط بر اساس «عملکرد فروش خودمان» و خلاصه‌ی جامع). با همین ساختار، حداکثر ۴۵۰ کلمه:
۱) وضعیت ۳۰ روز اخیر نسبت به ۳۰ روز قبل و روند هفتگی (تناژ، قیمت، تعداد سفارش).
۲) کیفیت قیمت‌ها نسبت به قیمت مرجع و بازار هر کشور (فقط FOB/FCA/EXW با مرجع مقایسه می‌شود).
۳) ترکیب کشور/گرید/شرایط تحویل و میزان هم‌خوانی آن با اولویت‌ها و رتبه‌بندی مغز؛ پیشنهادهای باز (Just quoted) که باید بسته شوند.
۴) ریسک‌ها: تمرکز مشتری یا بازار، افت قیمت، و بدهی‌های پرداخت‌نشده (سن بدهی).
۵) سه اقدام مشخص و قابل‌اجرا برای هفته‌ی آینده (کدام کشور/گرید/قیمت/پیگیری).
اگر داده برای قضاوت کافی نیست صریح بگو.
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
  const summary = summarizeSales(readSalesSnapshots(), {
    countryScores: (scores?.countries || []).map((c) => ({ country: c.country, tier: c.tier, rank: c.rank })),
  });
  if (summary.empty) return NextResponse.json({ error: "هنوز گزارشی بارگذاری نشده." }, { status: 400 });

  try {
    const salesContext = [salesContextForBrain(summary), ledgerContextForBrain(loadAccounts().accounts)].filter(Boolean).join("\n");
    const { answer, ungrounded } = await askBrain({ apiKey: key, question: QUESTION, salesContext });
    const analysis = { as_of: summary.as_of, generated_at: new Date().toISOString(), text: answer, ungrounded_numbers: ungrounded };
    writeSalesAnalysis(analysis);
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    return NextResponse.json({ error: `تحلیل انجام نشد: ${String(err?.message || err).slice(0, 200)}` }, { status: 502 });
  }
}
