import { NextResponse } from "next/server";
import { loadAccounts } from "@/lib/salesLedgerStore";
import { customerStatement } from "@/lib/salesLedger";
import { buildStatementXlsx } from "@/lib/salesStatement";

// صورت‌حساب یک مشتری: JSON (برای صفحه) یا اکسل (?format=xlsx). فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const id = sp.get("customer");
  const { accounts } = loadAccounts();
  if (!id || accounts.empty) return NextResponse.json({ error: "مشتری یا گزارش فروش پیدا نشد." }, { status: 404 });
  if (sp.get("format") === "xlsx") {
    const buf = await buildStatementXlsx(accounts, id);
    if (!buf) return NextResponse.json({ error: "مشتری پیدا نشد." }, { status: 404 });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="statement-${accounts.as_of}.xlsx"`,
      },
    });
  }
  const st = customerStatement(accounts, id);
  return st ? NextResponse.json(st) : NextResponse.json({ error: "مشتری پیدا نشد." }, { status: 404 });
}
