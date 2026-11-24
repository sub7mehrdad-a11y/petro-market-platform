// متن ایمیل یادآوری به زبان محلی هر کشور (بدون IO و بدون alias «@/» تا با `node --test` تست شود).
//
// تصمیم مدیران (۱۴۰۵/۰۹/۰۲): یادآوری برای هر شرکت در هر کشور به زبان محلی همان کشور ارسال شود.
// فقط ادعاهای همان ایمیل اول (معرفی گروه و بی‌کربنات سدیم + درخواست گرید/بسته‌بندی/مقدار) و گزینه‌ی انصراف؛ قیمت و ادعای تازه نیست.
// کشورهایی که زبان‌شان این‌جا نیست انگلیسی می‌گیرند. ⚠ ترجمه‌ها را هوش مصنوعی نوشته؛ پیش از ارسال گسترده بازبینی بومی بهتر است
// (نمونه‌ی همه‌ی زبان‌ها: GET /api/outreach/followup?preview=1).

const NAME = "Mehrdad Abutalebi";
const COMPANY = "Pars Baking Soda Group";

export const REMINDER_TEXT = {
  en: {
    label_fa: "انگلیسی",
    hello: (n) => `Dear ${n || "Sir/Madam"},`,
    p1: "I am writing to follow up on my previous email below, in which I introduced Pars Baking Soda Group and our sodium bicarbonate.",
    p2: "If this is relevant to your requirements, please let us know your required grade, packaging and estimated quantity, and we will be glad to prepare a quotation. If another colleague handles purchasing, we would appreciate being directed to the appropriate contact.",
    p3: "If you prefer not to receive further product information from us, please reply and let us know.",
    bye: ["Kind regards,", NAME, "Export Marketing", COMPANY],
  },
  ru: {
    label_fa: "روسی",
    hello: (n) => `Здравствуйте${n ? `, команда ${n}` : ""}!`,
    p1: "Пишу, чтобы напомнить о моём предыдущем письме, в котором я представил Pars Baking Soda Group и наш гидрокарбонат натрия (пищевую соду).",
    p2: "Если это актуально для ваших задач, сообщите, пожалуйста, нужный сорт, фасовку и ориентировочный объём — мы с радостью подготовим коммерческое предложение. Если закупками занимается другой сотрудник, будем признательны за контакт ответственного лица.",
    p3: "Если вы не хотите получать от нас дальнейшую информацию о продукции, просто ответьте на это письмо.",
    bye: ["С уважением,", NAME, "Экспортный маркетинг", COMPANY],
  },
  ar: {
    label_fa: "عربی",
    hello: (n) => (n ? `السادة فريق ${n} المحترمون،` : "السادة المحترمون،"),
    p1: "أكتب إليكم للمتابعة بشأن رسالتي السابقة التي عرّفتُ فيها بمجموعة بارس لصودا الخبز (Pars Baking Soda Group) ومنتجنا من بيكربونات الصوديوم.",
    p2: "إذا كان ذلك يناسب احتياجاتكم، يُرجى إفادتنا بالدرجة المطلوبة ونوع التعبئة والكمية التقديرية، وسنُعدّ لكم عرض سعر بكل سرور. وإذا كان موظف آخر مسؤولاً عن المشتريات، نكون ممتنين لو دللتمونا على جهة الاتصال المناسبة.",
    p3: "وإن كنتم لا ترغبون في تلقي مزيد من المعلومات عن منتجاتنا، يُرجى الرد على هذه الرسالة لإبلاغنا.",
    bye: ["مع خالص التحية،", NAME, "التسويق التصديري", COMPANY],
  },
  tr: {
    label_fa: "ترکی استانبولی",
    hello: (n) => `Sayın ${n || "Yetkili"},`,
    p1: "Pars Baking Soda Group'u ve sodyum bikarbonat ürünümüzü tanıttığım önceki e-postamı hatırlatmak için yazıyorum.",
    p2: "İhtiyaçlarınızla ilgiliyse, lütfen gereken kaliteyi, ambalajı ve tahmini miktarı bildirin; memnuniyetle bir teklif hazırlayalım. Satın alma işlerini başka bir meslektaşınız yürütüyorsa, doğru iletişim kişisine yönlendirilmekten memnuniyet duyarız.",
    p3: "Ürün bilgilerimizi almak istemiyorsanız, lütfen bu e-postayı yanıtlayarak bize bildirin.",
    bye: ["Saygılarımla,", NAME, "İhracat Pazarlama", COMPANY],
  },
  hy: {
    label_fa: "ارمنی",
    hello: (n) => (n ? `Հարգելի ${n} թիմ,` : "Հարգելի գործընկերներ,"),
    p1: "Գրում եմ՝ հիշեցնելու իմ նախորդ նամակի մասին, որտեղ ներկայացրել էի Pars Baking Soda Group-ը և մեր նատրիումի հիդրոկարբոնատը (խմորի սոդա)։",
    p2: "Եթե սա համապատասխանում է ձեր կարիքներին, խնդրում ենք հայտնել ձեզ անհրաժեշտ տեսակը, փաթեթավորումը և մոտավոր քանակը, և մենք սիրով կպատրաստենք գնային առաջարկ։ Եթե գնումներով զբաղվում է մեկ այլ գործընկեր, շնորհակալ կլինենք՝ եթե մեզ ուղղորդեք համապատասխան կոնտակտին։",
    p3: "Եթե չեք ցանկանում ստանալ մեր արտադրանքի մասին հետագա տեղեկատվություն, խնդրում ենք պատասխանել այս նամակին և տեղեկացնել մեզ։",
    bye: ["Հարգանքով,", NAME, "Արտահանման մարքեթինգ", COMPANY],
  },
  uk: {
    label_fa: "اوکراینی",
    hello: (n) => `Вітаю${n ? `, команда ${n}` : ""}!`,
    p1: "Пишу, щоб нагадати про мій попередній лист, у якому я представив Pars Baking Soda Group та наш гідрокарбонат натрію (харчову соду).",
    p2: "Якщо це актуально для ваших потреб, повідомте, будь ласка, потрібний сорт, фасування та орієнтовний обсяг — ми із задоволенням підготуємо комерційну пропозицію. Якщо закупівлями займається інший колега, будемо вдячні за контакт відповідальної особи.",
    p3: "Якщо ви не бажаєте отримувати від нас подальшу інформацію про продукцію, просто дайте відповідь на цей лист.",
    bye: ["З повагою,", NAME, "Експортний маркетинг", COMPANY],
  },
  zh: {
    label_fa: "چینی",
    hello: (n) => (n ? `尊敬的${n}团队：` : "尊敬的客户："),
    p1: "我写信是想跟进我之前的邮件。在那封邮件中，我介绍了 Pars Baking Soda Group 及我们的碳酸氢钠产品。",
    p2: "如果这与贵公司的需求相关，请告知所需的等级、包装和预计数量，我们将很乐意为您准备报价。如果采购由其他同事负责，烦请告知合适的联系人。",
    p3: "如果您不希望再收到我们的产品信息，请回复本邮件告知我们。",
    bye: ["此致敬礼，", NAME, "出口市场部", COMPANY],
  },
  es: {
    label_fa: "اسپانیایی",
    hello: (n) => (n ? `Estimado equipo de ${n}:` : "Estimados señores:"),
    p1: "Les escribo para dar seguimiento a mi correo anterior, en el que presenté a Pars Baking Soda Group y nuestro bicarbonato de sodio.",
    p2: "Si les resulta de interés, indíquennos por favor el grado requerido, el embalaje y la cantidad estimada, y con gusto prepararemos una cotización. Si otro colega se encarga de las compras, les agradeceríamos que nos indicaran el contacto adecuado.",
    p3: "Si prefieren no recibir más información sobre nuestros productos, les rogamos que respondan a este correo y nos lo hagan saber.",
    bye: ["Saludos cordiales,", NAME, "Marketing de Exportación", COMPANY],
  },
  pt: {
    label_fa: "پرتغالی",
    hello: (n) => (n ? `Prezados da equipe ${n},` : "Prezados senhores,"),
    p1: "Escrevo para dar seguimento ao meu e-mail anterior, no qual apresentei o Pars Baking Soda Group e o nosso bicarbonato de sódio.",
    p2: "Se for relevante para as suas necessidades, informem-nos o grau, a embalagem e a quantidade estimada necessários, e teremos prazer em preparar uma cotação. Se outro colega cuida das compras, agradeceríamos que nos indicasse o contato adequado.",
    p3: "Se preferirem não receber mais informações sobre os nossos produtos, respondam a este e-mail para nos avisar.",
    bye: ["Atenciosamente,", NAME, "Marketing de Exportação", COMPANY],
  },
  fr: {
    label_fa: "فرانسوی",
    hello: (n) => (n ? `Bonjour à l'équipe ${n},` : "Madame, Monsieur,"),
    p1: "Je me permets de revenir vers vous au sujet de mon précédent e-mail, dans lequel je présentais Pars Baking Soda Group et notre bicarbonate de sodium.",
    p2: "Si cela correspond à vos besoins, merci de nous indiquer la qualité, le conditionnement et la quantité estimée souhaités ; nous serons ravis de préparer une offre. Si un autre collègue s'occupe des achats, nous vous serions reconnaissants de bien vouloir nous indiquer le bon interlocuteur.",
    p3: "Si vous préférez ne plus recevoir d'informations sur nos produits, merci de répondre à ce message pour nous le faire savoir.",
    bye: ["Cordialement,", NAME, "Marketing export", COMPANY],
  },
  de: {
    label_fa: "آلمانی",
    hello: (n) => (n ? `Sehr geehrtes ${n}-Team,` : "Sehr geehrte Damen und Herren,"),
    p1: "ich schreibe Ihnen, um an meine vorherige E-Mail zu erinnern, in der ich die Pars Baking Soda Group und unser Natriumhydrogencarbonat (Natron) vorgestellt habe.",
    p2: "Falls dies für Ihren Bedarf relevant ist, teilen Sie uns bitte die gewünschte Qualität, Verpackung und voraussichtliche Menge mit – wir erstellen Ihnen gern ein Angebot. Sollte ein anderer Kollege für den Einkauf zuständig sein, wären wir für die Nennung des richtigen Ansprechpartners dankbar.",
    p3: "Wenn Sie keine weiteren Produktinformationen von uns erhalten möchten, antworten Sie bitte kurz auf diese E-Mail.",
    bye: ["Mit freundlichen Grüßen", NAME, "Export Marketing", COMPANY],
  },
  it: {
    label_fa: "ایتالیایی",
    hello: (n) => (n ? `Gentile team di ${n},` : "Gentili signori,"),
    p1: "Le scrivo per dare seguito alla mia e-mail precedente, in cui ho presentato Pars Baking Soda Group e il nostro bicarbonato di sodio.",
    p2: "Se è di vostro interesse, vi preghiamo di indicarci la qualità richiesta, il confezionamento e la quantità stimata: prepareremo volentieri un'offerta. Se degli acquisti si occupa un altro collega, vi saremmo grati se poteste indicarci il referente corretto.",
    p3: "Se preferite non ricevere ulteriori informazioni sui nostri prodotti, vi preghiamo di rispondere a questa e-mail per farcelo sapere.",
    bye: ["Cordiali saluti,", NAME, "Marketing Export", COMPANY],
  },
  pl: {
    label_fa: "لهستانی",
    hello: (n) => (n ? `Szanowni Państwo z zespołu ${n},` : "Szanowni Państwo,"),
    p1: "Piszę, aby nawiązać do mojej poprzedniej wiadomości, w której przedstawiłem Pars Baking Soda Group oraz nasz wodorowęglan sodu.",
    p2: "Jeśli jest to dla Państwa istotne, prosimy o informację o wymaganym gatunku, opakowaniu i szacowanej ilości – chętnie przygotujemy ofertę. Jeśli zakupami zajmuje się inna osoba, będziemy wdzięczni za wskazanie właściwego kontaktu.",
    p3: "Jeśli nie życzą sobie Państwo otrzymywać dalszych informacji o naszych produktach, prosimy o odpowiedź na tę wiadomość.",
    bye: ["Z poważaniem,", NAME, "Marketing eksportowy", COMPANY],
  },
  el: {
    label_fa: "یونانی",
    hello: (n) => (n ? `Αγαπητή ομάδα ${n},` : "Αγαπητοί κύριοι,"),
    p1: "Σας γράφω για να σας υπενθυμίσω το προηγούμενο email μου, στο οποίο παρουσίασα την Pars Baking Soda Group και το διττανθρακικό νάτριο που παράγουμε.",
    p2: "Εάν σας ενδιαφέρει, παρακαλούμε ενημερώστε μας για την ποιότητα, τη συσκευασία και την εκτιμώμενη ποσότητα που χρειάζεστε και θα ετοιμάσουμε με χαρά μια προσφορά. Αν τις προμήθειες χειρίζεται άλλος συνάδελφος, θα σας ήμασταν ευγνώμονες να μας υποδείξετε τον κατάλληλο υπεύθυνο επικοινωνίας.",
    p3: "Αν προτιμάτε να μην λαμβάνετε περαιτέρω πληροφορίες για τα προϊόντα μας, παρακαλούμε απαντήστε σε αυτό το email.",
    bye: ["Με εκτίμηση,", NAME, "Εξαγωγικό Μάρκετινγκ", COMPANY],
  },
  nl: {
    label_fa: "هلندی",
    hello: (n) => (n ? `Geachte medewerkers van ${n},` : "Geachte heer/mevrouw,"),
    p1: "Ik schrijf u naar aanleiding van mijn vorige e-mail, waarin ik Pars Baking Soda Group en ons natriumbicarbonaat heb voorgesteld.",
    p2: "Als dit voor u relevant is, laat ons dan weten welke kwaliteit, verpakking en geschatte hoeveelheid u nodig heeft; wij maken graag een offerte voor u. Als een andere collega de inkoop doet, stellen wij het op prijs als u ons naar de juiste contactpersoon verwijst.",
    p3: "Als u geen verdere productinformatie van ons wilt ontvangen, antwoord dan op deze e-mail.",
    bye: ["Met vriendelijke groet,", NAME, "Export Marketing", COMPANY],
  },
};

const set = (lang, names) => Object.fromEntries(names.split("،").map((n) => [n.trim(), lang]));

// نام کشور (فارسی، همان که در بانک شرکت‌ها هست) → زبان. بقیه‌ی کشورها: انگلیسی.
// آسیای مرکزی و بلاروس: روسی (زبان تجارت؛ مثل پیام‌های واتساپ). قفقاز و اوکراین روسی نیستند.
export const COUNTRY_LANG = {
  ...set("ru", "روسیه،بلاروس،قزاقستان،قرقیزستان،ازبکستان،تاجیکستان"),
  ...set("ar", "امارات،عربستان سعودی،اردن،عراق،مصر،کویت،سوریه،بحرین،قطر،عمان،لبنان،فلسطین،تونس،مراکش،الجزایر،لیبی،یمن،سودان"),
  ...set("hy", "ارمنستان"),
  ...set("tr", "ترکیه"),
  ...set("uk", "اوکراین"),
  ...set("zh", "چین"),
  ...set("es", "اسپانیا،آرژانتین،چیلی،مکزیک،پرو،اکوادور،گواتمالا"),
  ...set("pt", "برزیل،پرتغال،آنگولا"),
  ...set("fr", "فرانسه،موناکو"),
  ...set("de", "آلمان،اتریش"),
  ...set("it", "ایتالیا"),
  ...set("pl", "لهستان"),
  ...set("el", "یونان"),
  ...set("nl", "هلند"),
};

/** زبان یادآوری برای کشور (نام فارسی). همیشه یکی از کلیدهای REMINDER_TEXT. */
export function reminderLanguageFor(countryFa) {
  const lang = COUNTRY_LANG[String(countryFa || "").trim()];
  return lang && REMINDER_TEXT[lang] ? lang : "en";
}

const render = (T, name) => [T.hello(name), "", T.p1, "", T.p2, "", T.p3, "", ...T.bye].join("\n");

/**
 * متن یادآوری. localLanguage=false ⇒ فقط انگلیسی (رفتار قبلی).
 * englishCopy=true و زبان محلی غیرانگلیسی ⇒ زیر متن محلی، نسخه‌ی انگلیسی هم می‌آید (اگر گیرنده انگلیسی را راحت‌تر بخواند).
 */
export function renderReminderBody({ companyName, country, localLanguage = true, englishCopy = true }) {
  const lang = localLanguage ? reminderLanguageFor(country) : "en";
  const local = render(REMINDER_TEXT[lang], companyName);
  if (lang === "en" || !englishCopy) return { lang, body: local };
  return { lang, body: `${local}\n\n———\n\n${render(REMINDER_TEXT.en, companyName)}` };
}

/** نمونه‌ی همه‌ی زبان‌ها برای بازبینی (GET /api/outreach/followup?preview=1). */
export function reminderSamples({ englishCopy = true } = {}) {
  return Object.keys(REMINDER_TEXT).map((lang) => ({
    lang,
    label_fa: REMINDER_TEXT[lang].label_fa,
    countries: Object.entries(COUNTRY_LANG).filter(([, l]) => l === lang).map(([c]) => c),
    body: renderReminderBody({ companyName: "Sample Co.", country: lang === "en" ? "" : Object.entries(COUNTRY_LANG).find(([, l]) => l === lang)[0], localLanguage: true, englishCopy }).body,
  }));
}
