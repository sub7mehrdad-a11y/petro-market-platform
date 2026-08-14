@echo off
chcp 65001 >nul
title سایت تحقیق و توسعه سپهران شیمی
cd /d "%~dp0web"

echo.
echo   ┌────────────────────────────────────────────────┐
echo   │   تحقیق و توسعه سپهران شیمی                    │
echo   └────────────────────────────────────────────────┘
echo.
echo   در حال آماده‌سازی... چند لحظه صبر کنید.
echo   ^(پنجره را نبندید — تا وقتی باز است سایت کار می‌کند^)
echo.

rem اگر نسخه‌ی ساخته‌شده وجود ندارد، اول بساز. دفعات بعد مستقیم اجرا می‌شود و سریع بالا می‌آید.
if not exist ".next\BUILD_ID" (
    echo   [اولین اجرا] در حال ساخت سایت — این مرحله فقط یک‌بار طول می‌کشد...
    call npm run build >nul 2>&1
    if errorlevel 1 (
        echo.
        echo   [X] ساخت سایت با خطا مواجه شد.
        echo       این دستور را اجرا کنید تا متن خطا را ببینید:  npm run build
        echo.
        pause
        exit /b 1
    )
    echo   ساخت سایت انجام شد.
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
