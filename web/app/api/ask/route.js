import { NextResponse } from "next/server";
import { buildSearchIndex, searchIndex } from "@/lib/searchIndex";
import { generateContent, resolveApiKey } from "@/lib/geminiFetch";

const GEMINI_MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `
تو دستیار پژوهشی بخش تحقیق و توسعه‌ی بازرگانی شرکت سپهران شیمی هستی (تولیدکننده‌ی
ایرانی جوش شیرین، برند «جوش شیرین پارس»، قیمت پایه‌ی مرجع FOB حدود ۲۵۰ دلار بر تن،
رقیب اصلی: ترکیه).

به تو چند «قطعه» از محتوای پلتفرم داخلی شرکت داده می‌شه (گزارش‌های بازار، بانک شرکت‌ها،
نمایشگاه‌ها، اخبار تحلیلی، تحلیل رقبا، قیمت‌ها). به سؤال کاربر فقط و فقط بر اساس همین
قطعه‌ها جواب بده.

قوانین اجباری:
1. فقط از اطلاعات داخل قطعه‌ها استفاده کن. از دانش عمومی خودت چیزی اضافه نکن.
2. اگر جواب سؤال در قطعه‌ها نبود، صادقانه بگو «این اطلاعات در پلتفرم موجود نیست» و
   اگر می‌دانی کجا باید دنبالش گشت، همان را پیشنهاد بده. چیزی از خودت نساز.
3. عددها را دقیقاً همان‌طور که در قطعه‌ها آمده نقل کن؛ عدد را گرد یا تغییر نده.
4. هر ادعا را به شماره‌ی قطعه‌ی منبعش ارجاع بده، به شکل [۱] یا [۲].
5. جواب را فارسی، کوتاه و ساختاریافته بنویس (حداکثر ۲۵۰ کلمه). اگر چند مورد هست،
   فهرست کن.
6. تمایز FOB / CIF / قیمت داخلی را همیشه حفظ کن و این‌ها را با هم مقایسه نکن مگر
   اینکه صریحاً توضیح بدهی که مبناشان فرق دارد.
`;

export async function POST(request) {
  let question;
  try {
    ({ question } = await request.json());
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  if (!question || !question.trim()) {
    return NextResponse.json({ error: "سؤالی وارد نشده." }, { status: 400 });
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "کلید GEMINI_API_KEY پیدا نشد، پس «پاسخ هوشمند» در دسترس نیست. " +
          "کلید را در فایل .env ریشه‌ی پروژه بگذارید. " +
          "جست‌وجوی کلیدواژه‌ای پایین‌تر بدون کلید هم کار می‌کند.",
      },
      { status: 503 }
    );
  }

  // قطعه‌های مرتبط را با همان جست‌وجوی کلیدواژه‌ای پیدا می‌کنیم و فقط همان‌ها را
  // به مدل می‌دهیم — هم ارزان‌تر است، هم مدل نمی‌تواند از چیزی که ندیده حرف بزند.
  const index = buildSearchIndex();
  const hits = searchIndex(index, question, 8);

  if (hits.length === 0) {
    return NextResponse.json({
      answer:
        "هیچ محتوای مرتبطی با این سؤال در پلتفرم پیدا نشد. شاید عبارت دیگری را امتحان کنید، " +
        "یا اگر گزارش مربوطه هنوز وارد سایت نشده، اول باید ingest شود.",
      sources: [],
    });
  }

  const context = hits
    .map((h, i) => `### قطعه [${i + 1}] — ${h.typeLabel}: ${h.title}\n(${h.subtitle})\n${h.body.slice(0, 3500)}`)
    .join("\n\n");

  try {
    const answer = await generateContent({
      apiKey,
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      input: `سؤال کاربر: ${question}\n\n---\n\n${context}`,
    });

    return NextResponse.json({
      answer,
      sources: hits.map((h, i) => ({
        n: i + 1,
        title: h.title,
        typeLabel: h.typeLabel,
        url: h.url,
      })),
    });
  } catch (err) {
    const msg = String(err?.message || err);

    // خطاهای رایج را به پیام فارسی قابل‌فهم تبدیل می‌کنیم، چون کاربر نهایی
    // متن انگلیسی خام گوگل برایش معنایی ندارد.
    if (msg.includes("429")) {
      return NextResponse.json(
        {
          error:
            "سهمیه‌ی رایگان روزانه‌ی Gemini تمام شده است. سهمیه هر روز از نو شارژ می‌شود، " +
            "پس فردا دوباره کار می‌کند. تا آن موقع از جست‌وجوی کلیدواژه‌ای پایین‌تر استفاده کنید " +
            "— آن محدودیتی ندارد و کاملاً محلی کار می‌کند.",
        },
        { status: 429 }
      );
    }

    if (msg.includes("403") || msg.toLowerCase().includes("forbidden")) {
      return NextResponse.json(
        {
          error:
            "دسترسی به سرویس هوش مصنوعی مسدود شد (۴۰۳). معمولاً یعنی سرور به گوگل دسترسی " +
            "مستقیم ندارد. اگر از پراکسی/VPN استفاده می‌کنید، مطمئن شوید متغیر HTTPS_PROXY " +
            "برای همین سروری که سایت را اجرا می‌کند هم تنظیم شده باشد.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: `خطا در ارتباط با سرویس هوش مصنوعی: ${msg.slice(0, 300)}` },
      { status: 502 }
    );
  }
}
