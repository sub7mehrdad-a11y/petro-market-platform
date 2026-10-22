import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "ورود — تحقیق و توسعه سپهران شیمی",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/logo.png" width={72} height={72} alt="آرم رسمی شرکت" className="h-[72px] w-[72px] rounded-xl bg-white object-contain" />
          <h1 className="font-black text-lg text-text">تحقیق و توسعه سپهران شیمی</h1>
          <p className="text-xs text-text-muted">برای مشاهده‌ی پلتفرم وارد شو</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
