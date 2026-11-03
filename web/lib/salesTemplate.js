import ExcelJS from "exceljs";
import { COLUMNS, GRADES, INCOTERMS, STATUSES } from "./salesFormat";

// قالب اکسل گزارش هفتگی تیم بازرگانی: هر ردیف یک قرارداد/فاکتور. ستون‌های لیستی (گرید، اینکوترمز، وضعیت، ارز) منوی کشویی دارند.
export async function buildTemplateXlsx() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "پلتفرم تحقیق و توسعه سپهران شیمی";
  const ws = wb.addWorksheet("گزارش هفتگی", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  // ردیف نمونه — با «نمونه» شروع می‌شود و هنگام ورود نادیده گرفته می‌شود
  ws.addRow({
    date: "1405/08/12", doc_no: "نمونه-001", buyer: "نمونه — نام شرکت خریدار (این ردیف را پاک کنید)", country: "عراق", grade: "خوراکی",
    tons: 25, price: 262, incoterm: "FOB", currency: "USD", amount: "", status: "قرارداد", payment_terms: "LC", notes: "",
  });
  ws.getRow(2).font = { color: { argb: "FF888888" }, italic: true };

  const col = (key) => COLUMNS.findIndex((c) => c.key === key) + 1;
  const list = (key, values) => {
    for (let r = 2; r <= 300; r++) {
      ws.getCell(r, col(key)).dataValidation = {
        type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`], showErrorMessage: false,
      };
    }
  };
  list("grade", GRADES);
  list("incoterm", INCOTERMS);
  list("status", STATUSES);
  list("currency", ["USD", "EUR", "AED", "RUB", "CNY", "IRR"]);

  const help = wb.addWorksheet("راهنما", { views: [{ rightToLeft: true }] });
  help.columns = [{ width: 26 }, { width: 90 }];
  help.addRow(["راهنمای پر کردن", ""]).font = { bold: true, size: 14 };
  help.addRow(["هر ردیف", "یک قرارداد/فاکتور/محموله. هر هفته یک فایل با همین قالب بفرستید (شنبه تا جمعه)."]);
  help.addRow(["ردیف نمونه", "ردیف دوم شیت اول نمونه است؛ پاک کنید یا روی آن بنویسید (اگر ستون «شرکت» با «نمونه» شروع شود نادیده گرفته می‌شود)."]);
  help.addRow(["الزامی‌ها", "تاریخ، شرکت طرف قرارداد، کشور مقصد، تناژ، قیمت واحد."]);
  help.addRow(["قیمت و اینکوترمز", "قیمت را همان‌طور که در قرارداد آمده بنویسید و اینکوترمز را حتماً پر کنید؛ مقایسه با قیمت مرجع فقط برای FOB/EXW/FCA انجام می‌شود."]);
  help.addRow(["ارز", "خالی = USD. ردیف‌های غیر دلاری در جمع مبلغ و میانگین قیمت نمی‌آیند و فقط تناژشان می‌آید."]);
  help.addRow(["", ""]);
  help.addRow(["ستون", "توضیح"]).font = { bold: true };
  for (const c of COLUMNS) help.addRow([c.header, c.note]);
  help.eachRow((row) => row.eachCell((cell) => { cell.alignment = { vertical: "top", wrapText: true, horizontal: "right" }; }));

  return wb.xlsx.writeBuffer();
}
