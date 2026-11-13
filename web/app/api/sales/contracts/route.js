import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { CURRENCIES, GRADES, INCOTERMS, STEPS, contractRow, contractTotal, currentStep } from "@/lib/salesContracts";
import { addNote, createContract, getContract, readStore, setCancelled, setStep, updateContract } from "@/lib/salesContractsStore";
import { loadAccounts } from "@/lib/salesLedgerStore";
import { salesStorageProblem } from "@/lib/salesStore";

// قراردادهای ثبت‌شده در پلتفرم (پنل بازرگانی): فهرست، ثبت، ویرایش، مراحل، یادداشت، لغو. فقط نقش «بازرگانی» (proxy.js روی /api/sales).
// پرداخت‌های واقعی در دفتر حساب (/api/sales/ledger/payments) با کلید File NO ثبت می‌شوند و اینجا فقط خوانده می‌شوند.
export const dynamic = "force-dynamic";

const who = (request) => verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value)?.username || null;
const bad = (error, status = 400, extra = {}) => NextResponse.json({ error, ...extra }, { status });

function countryNames() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "scripts", "country_name_map.json"), "utf-8"));
    return [...new Set(Object.values(raw).map((v) => v.fa).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fa"));
  } catch {
    return [];
  }
}

// نمای یک قرارداد برای رابط: مبلغ کل، مرحله‌ی فعلی و وضعیت مالی از دفتر حساب
function view(c, accountsByKey) {
  const acc = accountsByKey.get(c.file_no);
  return {
    ...c, total: contractTotal(c), current_step: currentStep(c)?.key || null, current_step_label: currentStep(c)?.label || null,
    in_report: !!contractRow(c),
    account: acc ? { paid: acc.paid, balance: acc.balance, status: acc.status, overdue: acc.overdue, overdue_days: acc.overdue_days, payments: acc.payments || [], due_days: acc.due_days } : null,
  };
}

export async function GET(request) {
  const store = readStore();
  const { accounts } = loadAccounts();
  const byKey = new Map((accounts.contracts || []).map((c) => [c.key, c]));
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const c = store.contracts.find((x) => x.id === id);
    if (!c) return bad("قرارداد پیدا نشد.", 404);
    const customer = store.customers.find((x) => x.name === c.buyer) || null;
    return NextResponse.json({ contract: view(c, byKey), customer, steps: STEPS });
  }
  return NextResponse.json({
    contracts: store.contracts.map((c) => view(c, byKey)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    sheet_contracts: (accounts.contracts || []).filter((c) => !store.contracts.some((x) => x.file_no === c.key)).map((c) => ({ key: c.key, buyer: c.buyer, country: c.country, tons: c.tons, total: c.total, currency: c.currency, date: c.date, status: c.status, balance: c.balance })),
    customers: store.customers, steps: STEPS, grades: GRADES, incoterms: INCOTERMS, currencies: CURRENCIES, countries: countryNames(),
    storage_problem: salesStorageProblem(),
  });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return bad("درخواست نامعتبر است."); }
  try {
    const r = createContract(body || {}, who(request));
    return r.ok ? NextResponse.json({ ok: true, contract: r.contract }) : bad(r.errors.join(" "), 422, { errors: r.errors });
  } catch (err) {
    return bad(err.message, 500);
  }
}

// action: update | step | note | cancel | reopen
export async function PATCH(request) {
  let b;
  try { b = await request.json(); } catch { return bad("درخواست نامعتبر است."); }
  if (!b?.id || !getContract(b.id)) return bad("قرارداد پیدا نشد.", 404);
  const by = who(request);
  try {
    let r;
    if (b.action === "update") r = updateContract(b.id, b.fields || {}, by);
    else if (b.action === "step") r = setStep(b.id, b.key, !!b.done, { note: b.note, date: b.date }, by);
    else if (b.action === "note") r = addNote(b.id, b.text, by);
    else if (b.action === "cancel") r = setCancelled(b.id, true, b.reason, by);
    else if (b.action === "reopen") r = setCancelled(b.id, false, null, by);
    else return bad("عملیات نامعتبر است.");
    return r.ok ? NextResponse.json({ ok: true, contract: r.contract }) : bad(r.errors.join(" "), 422, { errors: r.errors });
  } catch (err) {
    return bad(err.message, 500);
  }
}
