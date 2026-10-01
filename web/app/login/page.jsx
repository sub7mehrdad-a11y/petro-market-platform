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
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-copper-400 to-copper-600 font-black text-petrol-900 text-base">
            سص
          </span>
          <h1 className="font-black text-lg text-petrol-900">تحقیق و توسعه سپهران شیمی</h1>
          <p className="text-xs text-petrol-600">برای مشاهده‌ی پلتفرم وارد شو</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
