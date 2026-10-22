import StateMessage from "./components/StateMessage";

export const metadata = { title: "صفحه پیدا نشد — تحقیق و توسعه سپهران شیمی" };

export default function NotFound() {
  return (
    <StateMessage
      code="۴۰۴"
      title="صفحه پیدا نشد"
      text="نشانی را بررسی کنید یا به داشبورد برگردید."
      actions={[{ label: "بازگشت به داشبورد", href: "/" }]}
    />
  );
}
