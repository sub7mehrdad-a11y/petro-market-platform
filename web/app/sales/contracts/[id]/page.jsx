import ContractDetail from "./ContractDetail";

// صفحه‌ی یک قرارداد: مراحل، پرداخت‌ها، برنامه‌ی پرداخت/تحویل، یادداشت‌ها و اطلاعات مشتری — فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";
export const metadata = { title: "قرارداد" };

export default async function ContractPage({ params }) {
  const { id } = await params;
  return <ContractDetail id={id} />;
}
