import { NextResponse } from "next/server";
import { buildSearchIndex, searchIndex } from "@/lib/searchIndex";
import { generateGroqContent, resolveGroqApiKey } from "@/lib/groqFetch";
// موتور پشتیبان: اگر سهمیه‌ی روزانه‌ی Groq تمام شود، «پاسخ هوشمند» خاموش نمی‌شود.
import { generateContent as generateGeminiContent, resolveApiKey as resolveGeminiApiKey } from "@/lib/geminiFetch";

// «پاسخ هوشمند» عمداً از Groq استفاده می‌کنه، نه Gemini — چون Groq یک شرکت
// کاملاً جداست و سهمیه‌ی مستقل داره؛ این‌طوری مصرف انسانی این بخش هیچ‌وقت
// سهمیه‌ی روزانه‌ی Gemini (که ایجنت‌های خودکار قیمت/خبر/رصد باهاش کار می‌کنن)
// رو نمی‌خوابونه. تصمیم ۲۰۲۶-۰۸-۲۱.

const SYSTEM_PROMPT = `
تو دستیار پژوهشی بخش تحقیق و توسعه‌ی بازرگانی شرکت سپهران شیمی هستی (تولیدکننده‌ی
ایرانی جوش شیرین، برند «جوش شیرین پارس»، قیمت پایه‌ی مرجع FOB حدود ۲۵۰ دلار بر تن،
رقبای تحت رصد: ترکیه و چین — روسیه هم به‌زودی اضافه می‌شود).

اصطلاح فنی: «40-foot container» یعنی «کانتینر ۴۰ فوتی» (فوت واحد طول است)، نه «۴۰ قدمی».

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

  const apiKey = resolveGroqApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "کلید GROQ_API_KEY پیدا نشد، پس «پاسخ هوشمند» در دسترس نیست. " +
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

  // بودجه‌بندی متن ارسالی به مدل.
  //
  // چرا لازم است: سرویس رایگان Groq سقف ۸۰۰۰ توکن در دقیقه دارد و «توکن پرامپت +
  // max_tokens» را پیش از اجرا با همان سقف می‌سنجد. نسخه‌ی قبلی تا ۸ قطعه × ۳۵۰۰
  // کاراکتر (~۲۸٬۰۰۰ کاراکتر ≈ بیش از ۱۱٬۰۰۰ توکن) می‌فرستاد، پس هر سؤالی که به
  // متن گزارش‌های بلند می‌خورد با خطای ۴۱۳ شکست می‌خورد — فقط سؤال‌هایی جواب
  // می‌گرفتند که قطعه‌های کوتاه (مثل یک شرکت) پیدا می‌کردند.
  const CONTEXT_CHAR_BUDGET = 10000; // ≈ ۴۰۰۰ توکن فارسی
  const PER_CHUNK_CHARS = 1600;

  const picked = [];
  let usedChars = 0;
  for (const h of hits) {
    const piece =
      `### قطعه [${picked.length + 1}] — ${h.typeLabel}: ${h.title}\n` +
      `(${h.subtitle})\n${(h.body || "").slice(0, PER_CHUNK_CHARS)}`;
    if (usedChars + piece.length > CONTEXT_CHAR_BUDGET && picked.length > 0) break;
    picked.push({ hit: h, piece });
    usedChars += piece.length;
  }

  const context = picked.map((p) => p.piece).join("\n\n");

  const userInput = `سؤال کاربر: ${question}\n\n---\n\n${context}`;

  try {
    let answer;
    try {
      answer = await generateGroqContent({
        apiKey,
        systemInstruction: SYSTEM_PROMPT,
        input: userInput,
        maxTokens: 1500,
      });
    } catch (groqErr) {
      // اگر سهمیه‌ی روزانه‌ی Groq تمام شده باشد، به‌جای پیام خطا با کلید جداگانه‌ی
      // Gemini جواب می‌دهیم. این کلید مخصوص «پاسخ هوشمند» است و سهمیه‌اش از
      // ایجنت‌های روزانه جداست (تصمیم ۲۰۲۶-۰۸-۲۱)، پس رصد روزانه را نمی‌خواباند.
      // ۴۲۹ = سهمیه تمام شده، ۴۰۳ = دسترسی از این شبکه بسته است، ۵xx = خودِ سرویس
      // بالا نیست. هر سه یعنی «Groq الان در دسترس نیست»، پس سراغ موتور دوم می‌رویم.
      // فقط خطاهای مربوط به خود درخواست (مثل ۴۱۳) نباید fallback بگیرند، چون با
      // موتور دیگر هم همان مشکل تکرار می‌شود.
      const msg = String(groqErr?.message || groqErr);
      const geminiKey = resolveGeminiApiKey();
      const retryable = /\b(429|403|500|502|503|504)\b|rate.?limit|quota|forbidden/i.test(msg);
      if (!retryable || !geminiKey) throw groqErr;

      console.warn(`[ask] Groq در دسترس نبود (${msg.slice(0, 80)})؛ پاسخ با Gemini داده می‌شود.`);
      answer = await generateGeminiContent({
        apiKey: geminiKey,
        model: "gemini-3.6-flash",
        systemInstruction: SYSTEM_PROMPT,
        input: userInput,
      });
    }

    return NextResponse.json({
      answer,
      // فقط قطعه‌هایی که واقعاً به مدل داده شدند به‌عنوان منبع اعلام می‌شوند،
      // وگرنه شماره‌ی ارجاع‌های داخل جواب با فهرست منابع نمی‌خواند.
      sources: picked.map((p, i) => ({
        n: i + 1,
        title: p.hit.title,
        typeLabel: p.hit.typeLabel,
        url: p.hit.url,
      })),
    });
  } catch (err) {
    const msg = String(err?.message || err);

    // خطاهای رایج را به پیام فارسی قابل‌فهم تبدیل می‌کنیم، چون کاربر نهایی
    // متن انگلیسی خام Groq برایش معنایی ندارد.
    if (msg.includes("429")) {
      return NextResponse.json(
        {
          error:
            "سهمیه‌ی رایگان روزانه‌ی Groq تمام شده است. سهمیه هر روز از نو شارژ می‌شود، " +
            "پس فردا دوباره کار می‌کند. تا آن موقع از جست‌وجوی کلیدواژه‌ای پایین‌تر استفاده کنید " +
            "— آن محدودیتی ندارد و کاملاً محلی کار می‌کند.",
        },
        { status: 429 }
      );
    }

    // ۴۱۳ = حجم درخواست از سقف توکن‌در‌دقیقه‌ی Groq بیشتر بوده. با بودجه‌بندی متن
    // بالا نباید رخ بدهد، ولی اگر سؤال خیلی طولانی باشد باز ممکن است.
    if (msg.includes("413") || msg.includes("Request too large")) {
      return NextResponse.json(
        {
          error:
            "سؤال یا متن‌های مرتبط با آن، از سقف یک درخواست سرویس رایگان بزرگ‌تر شد. " +
            "سؤال را کوتاه‌تر و مشخص‌تر بپرسید (مثلاً نام یک کشور یا یک شرکت). " +
            "جست‌وجوی کلیدواژه‌ای پایین‌تر هم بدون هیچ محدودیتی کار می‌کند.",
        },
        { status: 413 }
      );
    }

    if (msg.includes("403") || msg.toLowerCase().includes("forbidden")) {
      return NextResponse.json(
        {
          error:
            "دسترسی به سرویس هوش مصنوعی مسدود شد (۴۰۳). معمولاً یعنی سرور به Groq دسترسی " +
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
