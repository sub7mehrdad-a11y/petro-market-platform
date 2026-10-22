"use client";

import StateMessage from "./components/StateMessage";

// خطای غیرمنتظره‌ی رندر یا دریافت داده. جزئیات فنی به کاربر نشان داده نمی‌شود (digest فقط در لاگ سرور).
export default function ErrorPage({ reset }) {
  return (
    <StateMessage
      code="۵۰۰"
      tone="danger"
      title="دریافت پاسخ از سامانه انجام نشد"
      text="کمی بعد دوباره تلاش کنید. اطلاعات شما تغییر نکرده است."
      actions={[
        { label: "تلاش دوباره", onClick: () => reset() },
        { label: "بازگشت به داشبورد", href: "/", secondary: true },
      ]}
    />
  );
}
