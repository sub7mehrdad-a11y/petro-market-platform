"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PageHeader from "../../../components/PageHeader";
import { SalesNav } from "../../salesUi";
import ContractForm from "../ContractForm";

export default function NewContractClient() {
  const router = useRouter();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/sales/contracts", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "خطا"); setMeta(j); })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="space-y-6">
      <PageHeader title="ثبت قرارداد جدید" subtitle="اطلاعات مشتری و سفارش را وارد کنید؛ پس از ثبت، مراحل قرارداد (پرداخت، تولید، بارگیری، تحویل) را از صفحه‌ی خودش پیش می‌برید." />
      <SalesNav active="/sales/contracts/new" />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {meta?.storage_problem && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">⚠ {meta.storage_problem}</div>}
      {meta && <ContractForm meta={meta} onSaved={(c) => router.push(`/sales/contracts/${c.id}`)} />}
    </div>
  );
}
