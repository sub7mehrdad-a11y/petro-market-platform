@echo off
chcp 65001 >nul
title پلتفرم تحقیق و توسعه سپهران شیمی

rem مسیر پوشه‌ی پروژه رو به شکل کوتاه (بدون حرف فارسی) تبدیل می‌کنیم — چون روی
rem بعضی سیستم‌ها cmd.exe مسیر فارسی رو درست نمی‌خونه (حتی با chcp 65001) و
rem باعث می‌شه npm بگه package.json پیدا نشد. شکل کوتاه همیشه فقط ASCII/انگلیسیه.
for %%I in ("%~dp0.") do set "PROJDIR=%%~sI"
if "%PROJDIR%"=="" set "PROJDIR=%~dp0"

cd /d "%PROJDIR%\web"

echo ==========================================================
echo    پلتفرم تحقیق و توسعه سپهران شیمی
echo ==========================================================
echo.

if not exist ".env.local" (
    echo [!] فایل رمز عبور پیدا نشد.
    echo.
    echo     یک فایل به اسم  .env.local  داخل پوشه‌ی web بساز
    echo     و این خط را داخلش بنویس ^(به‌جای ستاره‌ها رمز خودت^):
    echo.
    echo         SITE_PASSWORD=********
    echo.
    echo     بدون این فایل سایت بدون رمز بالا می‌آید.
    echo.
    pause
)

echo [1/3] دریافت آخرین داده‌ها از گیت‌هاب...
cd /d "%PROJDIR%"
git pull --ff-only 2>nul
if errorlevel 1 (
    echo     [!] دریافت ناموفق بود - با داده‌های فعلی ادامه می‌دهیم.
) else (
    echo     انجام شد.
)
cd /d "%PROJDIR%\web"
echo.

echo [2/3] ساخت نسخه‌ی نهایی سایت ^(چند دقیقه طول می‌کشد^)...
call npm run build
if errorlevel 1 (
    echo.
    echo [X] ساخت سایت با خطا مواجه شد. متن خطای بالا را برای بررسی بفرست.
    pause
    exit /b 1
)
echo.

echo [3/3] راه‌اندازی سرور...
echo.
echo ==========================================================
echo   سایت آماده است:
echo.
echo   روی همین کامپیوتر :   http://localhost:3000
echo   از کامپیوتر/موبایل دیگر روی همین شبکه:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do echo        http://%%b:3000
)
echo.
echo   برای بستن سایت، این پنجره را ببند یا Ctrl+C بزن.
echo ==========================================================
echo.

call npm run start -- -H 0.0.0.0
pause
