@echo off
chcp 65001 >nul
title سایت تحقیق و توسعه سپهران شیمی

rem مسیر پوشه‌ی پروژه رو به شکل کوتاه (بدون حرف فارسی) تبدیل می‌کنیم — چون روی
rem بعضی سیستم‌ها cmd.exe مسیر فارسی رو درست نمی‌خونه (حتی با chcp 65001) و
rem باعث می‌شه npm بگه package.json پیدا نشد. شکل کوتاه همیشه فقط ASCII/انگلیسیه.
for %%I in ("%~dp0.") do set "PROJDIR=%%~sI"
if "%PROJDIR%"=="" set "PROJDIR=%~dp0"

cd /d "%PROJDIR%"

echo.
echo   ┌────────────────────────────────────────────────┐
echo   │   تحقیق و توسعه سپهران شیمی                    │
echo   └────────────────────────────────────────────────┘
echo.
echo   در حال آماده‌سازی... چند لحظه صبر کنید.
echo   ^(پنجره را نبندید — تا وقتی باز است سایت کار می‌کند^)
echo.

rem ایجنت‌های روزانه هر روز قیمت/خبر جدید را روی گیت‌هاب ثبت می‌کنند. اینجا همان
rem تغییرات را می‌گیریم تا سایت روی همین سیستم هم به‌روز باشد. اگر اینترنت نباشد یا
rem تغییری نباشد، این مرحله بی‌سروصدا رد می‌شود و سایت با داده‌ی موجود بالا می‌آید.
echo   در حال دریافت آخرین داده‌ها از گیت‌هاب...
for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do set "OLDHASH=%%i"
git pull --ff-only >nul 2>&1
for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do set "NEWHASH=%%i"

set "NEEDS_BUILD=0"
if not "%OLDHASH%"=="%NEWHASH%" (
    echo   داده‌های جدید دریافت شد.
    git diff --name-only %OLDHASH% %NEWHASH% > "%TEMP%\sepehran_changed.txt" 2>nul
    findstr /b /c:"web/" /c:"data/" /c:"reports/" "%TEMP%\sepehran_changed.txt" >nul 2>&1
    if not errorlevel 1 set "NEEDS_BUILD=1"
)

cd /d "%PROJDIR%\web"

rem اگر نسخه‌ی ساخته‌شده اصلاً وجود ندارد (اولین اجرا)، حتماً باید بسازیم.
if not exist ".next\BUILD_ID" set "NEEDS_BUILD=1"

if "%NEEDS_BUILD%"=="1" (
    echo   در حال به‌روزرسانی سایت با آخرین اطلاعات — چند لحظه طول می‌کشد...
    call npm run build >nul 2>&1
    if errorlevel 1 (
        echo.
        echo   [X] ساخت سایت با خطا مواجه شد.
        echo       این دستور را اجرا کنید تا متن خطا را ببینید:  npm run build
        echo.
        pause
        exit /b 1
    )
    echo   به‌روزرسانی انجام شد.
    echo.
)

rem سرور را در پس‌زمینه بالا می‌آوریم تا بتوانیم مرورگر را باز کنیم.
start "سرور سایت سپهران" /min cmd /c "npm run start"

echo   در حال بالا آوردن سرور...

rem منتظر می‌مانیم تا سرور واقعاً جواب بدهد، بعد مرورگر را باز می‌کنیم.
set /a tries=0
:waitloop
set /a tries+=1
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 3; exit 0 } catch { if ($_.Exception.Response.StatusCode.value__ -eq 401) { exit 0 } else { exit 1 } }" >nul 2>&1
if errorlevel 1 (
    if %tries% lss 45 goto waitloop
    echo.
    echo   [X] سرور بالا نیامد. لطفاً یک‌بار دیگر امتحان کنید.
    pause
    exit /b 1
)

echo   آماده شد — در حال باز کردن مرورگر...
start "" "http://localhost:3000"

echo.
echo   ┌────────────────────────────────────────────────┐
echo   │  سایت باز شد:  http://localhost:3000           │
echo   │                                                │
echo   │  برای بستن سایت، این پنجره را ببندید.          │
echo   └────────────────────────────────────────────────┘
echo.
pause >nul
