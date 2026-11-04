import ExcelJS from "exceljs";

// قالب خالی با همان ساختار فایل «Sales Report» تیم بازرگانی (سرستون‌ها در ردیف ۳) — برای شروع از صفر یا فایل جدید.
// تیم می‌تواند همان فایل فعلی‌اش را هم مستقیم بارگذاری کند؛ تجزیه‌گر سرستون‌ها را خودش پیدا می‌کند.
export const NATIVE_HEADERS = [
  "ROW ", "File NO", "Plant", "Customer name", "Company", "Final destination", "PI date", "Proposal offer", "PI/BACH NO", "Grade",
  "Primery Packaging", "Secondry packaging", "Order volume(mt)", "Net price(per ton)", "Currency", "Net Weight(mt)", "Gross Weight(mt) ",
  "Delivery terms", "Port of discharge ", "Total price", "Payment terms", "payment Status", "CI NO", "Reg ID", "Date of loading",
  "Production status", "lading/loading status", "BL NO", "EPL NO",
];

export async function buildTemplateXlsx() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "پلتفرم تحقیق و توسعه سپهران شیمی";
  const ws = wb.addWorksheet("Sheet1", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.getCell("E1").value = "Sales Report";
  ws.getCell("E1").font = { bold: true, size: 14 };
  ws.addRow([]);
  const head = ws.addRow(NATIVE_HEADERS);
  head.height = 24;
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  NATIVE_HEADERS.forEach((_, i) => (ws.getColumn(i + 1).width = [5, 9, 7, 18, 28, 16, 12, 14, 12, 10, 18, 18, 14, 14, 9, 12, 12, 16, 16, 12, 24, 14, 10, 10, 14, 14, 16, 12, 12][i] || 12));

  // ردیف نمونه — خریدار با SAMPLE شروع می‌شود و هنگام ورود نادیده گرفته می‌شود
  ws.addRow([1, 900, "SHZ", "Mr. Example", "SAMPLE — delete this row", "Iraq", "2026-11-01", "PI issued", "20100", "Food", "Food Grade(EXPORT)", "-", 25, 262, "USD", 25, 25.1, "FCA(SHZ)", "Bashmaq", 6550, "100%Cash in advance", "Yet to pay"]);
  ws.getRow(4).font = { color: { argb: "FF888888" }, italic: true };

  const col = (h) => NATIVE_HEADERS.indexOf(h) + 1;
  const list = (header, values) => {
    for (let r = 4; r <= 400; r++) {
      ws.getCell(r, col(header)).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`], showErrorMessage: false };
    }
  };
  list("Proposal offer", ["PI issued", "Just quoted"]);
  list("Grade", ["Food", "Feed", "Poultry", "Industrial", "Pharma"]);
  list("Currency", ["USD", "EUR", "AED", "RUB", "CNY"]);
  list("payment Status", ["Done", "Yet to pay", "Prepayment received"]);
  list("Production status", ["Done", "In Process"]);

  const help = wb.addWorksheet("Help", { views: [{ rightToLeft: true }] });
  help.columns = [{ width: 28 }, { width: 100 }];
  const rowsH = [
    ["راهنما", ""],
    ["هر ردیف", "یک سفارش یا پیشنهاد. فایل تجمعی است: همه‌ی ردیف‌ها از اول سال در همان فایل می‌ماند و هر هفته به‌روز می‌شود."],
    ["Proposal offer", "«PI issued» = سفارش قطعی (در فروش می‌آید)؛ «Just quoted» = فقط پیشنهاد (در پایپ‌لاین می‌آید، نه در فروش)."],
    ["Final destination", "نام کشور؛ غلط‌های املایی رایج (Uzbakistan، UZB، Aremenai) خودکار تصحیح می‌شود."],
    ["Order volume / Net price", "حجم سفارش (تن) و قیمت خالص هر تن؛ ردیف بدون حجم نادیده گرفته می‌شود."],
    ["Delivery terms", "مثل FCA(SHZ) یا DAP یا FOB؛ اینکوترمز از متن استخراج می‌شود. مقایسه با قیمت مرجع فقط برای FOB/FCA/EXW است."],
    ["payment Status", "Done / Yet to pay / Prepayment received؛ بدهی پرداخت‌نشده و سن آن از همین ستون و تاریخ PI حساب می‌شود."],
    ["Currency", "خالی = USD."],
  ];
  rowsH.forEach((r) => help.addRow(r));
  help.getRow(1).font = { bold: true, size: 14 };
  help.eachRow((row) => row.eachCell((cell) => { cell.alignment = { vertical: "top", wrapText: true, horizontal: "right" }; }));

  return wb.xlsx.writeBuffer();
}
