import { NextResponse } from "next/server";
import { findUserByUsername } from "@/lib/data";
import { verifyPassword, createSession, SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from "@/lib/auth";

export async function POST(request) {
  let username, password;
  try {
    ({ username, password } = await request.json());
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json({ error: "نام کاربری و رمز عبور الزامی است." }, { status: 400 });
  }

  const user = findUserByUsername(username);
  // پیام خطای یکسان برای «کاربر نیست» و «رمز غلط است» — تا امکان حدس‌زدن
  // نام‌های کاربری معتبر از روی تفاوت پیام فراهم نشه.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "نام کاربری یا رمز عبور اشتباه است." }, { status: 401 });
  }

  const token = createSession(user);
  const response = NextResponse.json({ ok: true, role: user.role });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return response;
}
