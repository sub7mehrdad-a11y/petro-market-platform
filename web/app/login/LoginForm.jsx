"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "ورود ناموفق بود.");
        return;
      }
      const next = searchParams.get("next") || "/";
      router.push(next);
      router.refresh();
    } catch {
      setError("خطا در ارتباط با سرور. دوباره تلاش کن.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-sm font-semibold text-petrol-800">
          نام کاربری
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="rounded-lg border border-petrol-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-copper-400"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-semibold text-petrol-800">
          رمز عبور
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="rounded-lg border border-petrol-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-copper-400"
        />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-petrol-700 text-white font-semibold py-2.5 text-sm hover:bg-petrol-800 transition-colors disabled:opacity-50"
      >
        {loading ? "در حال ورود..." : "ورود"}
      </button>
    </form>
  );
}
