import ExcelJS from "exceljs";
import { customerStatement } from "./salesLedger";

// صورت‌حساب مشتری به‌صورت اکسل (برای ارسال به مشتری یا بایگانی): قراردادها (بدهکار)، پرداخت‌ها (بستانکار) و مانده‌ی جاری.
export async function buildStatementXlsx(accounts, customerId) {
  const st = customerStatement(accounts, customerId);
  if (!st) return null;
  const wb = new ExcelJS.Workbook();
  wb.creator = "پلتفرم تحقیق و توسعه سپهران شیمی";
  const ws = wb.addWorksheet("Statement", { views: [{ rightToLeft: true, state: "frozen", ySplit: 6 }] });
  ws.columns = [{ width: 13 }, { width: 14 }, { width: 62 }, { width: 14 }, { width: 14 }, { width: 14 }];
  ws.addRow(["صورت‌حساب مشتری", "", "", "", "", ""]).font = { bold: true, size: 14 };
  ws.addRow(["مشتری", st.customer.name]);
  ws.addRow(["کشور", st.customer.countries.join("، ")]);
  ws.addRow(["تاریخ گزارش", st.as_of]);
  ws.addRow(["مانده‌ی پایانی (USD)", st.closing_balance]);
  const head = ws.addRow(["تاریخ", "مرجع", "شرح", "بدهکار (قرارداد)", "بستانکار (پرداخت)", "مانده"]);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  for (const l of st.lines) {
    const r = ws.addRow([l.date === "0000-00-00" ? "" : l.date, l.ref, l.desc, l.debit || null, l.credit || null, l.balance]);
    r.getCell(3).alignment = { wrapText: true, vertical: "top" };
    for (const n of [4, 5, 6]) r.getCell(n).numFmt = "#,##0.00";
  }
  ws.addRow([]);
  const tot = ws.addRow(["جمع", "", "", st.customer.total, st.customer.paid, st.customer.balance]);
  tot.font = { bold: true };
  for (const n of [4, 5, 6]) tot.getCell(n).numFmt = "#,##0.00";
  ws.addRow(["", "", "پرداخت‌های بدون قرارداد (پیش‌دریافت) در مانده‌ی پایانی منظور شده‌اند؛ مبالغ به دلار و فقط قراردادهای دلاری جمع می‌شوند."]).getCell(3).font = { italic: true, color: { argb: "FF777777" } };
  return wb.xlsx.writeBuffer();
}
