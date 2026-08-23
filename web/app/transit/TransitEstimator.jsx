"use client";

import { useMemo, useState } from "react";

const SHIPMENT_TONS = 24;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lon2 - lon1);
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlambda / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// جست‌وجوی تقریبی — چون ورودی کاربر ممکنه دقیقاً با کلید ثبت‌شده یکی نباشه
// (مثلاً «خسروی» به‌جای «مرز خسروی»). هم‌ارز نسخه‌ی پایتونی transit_geo.py.
function findPlace(places, name) {
  const q = (name || "").trim();
  if (!q) return null;
  if (places[q]) return { name: q, coords: places[q] };
  const match = Object.keys(places).find((key) => key.includes(q) || q.includes(key));
  return match ? { name: match, coords: places[match] } : null;
}

function formatToman(n) {
  return `${Math.round(n).toLocaleString("fa-IR")} تومان`;
}

export default function TransitEstimator({ places, rates }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");

  const placeNames = useMemo(() => Object.keys(places), [places]);
  const perKm = rates?.perKm ?? { median: null, sampleSize: 0 };
  const perTonKm = rates?.perTonKm ?? { median: null, sampleSize: 0 };

  const result = useMemo(() => {
    if (!origin.trim() || !destination.trim()) return { status: "empty" };
    const o = findPlace(places, origin);
    const d = findPlace(places, destination);
    if (!o || !d) {
      return { status: "unknown", unresolvedOrigin: !o, unresolvedDest: !d };
    }
    if (perKm.median == null) return { status: "no-rate" };
    const distanceKm = haversineKm(o.coords[0], o.coords[1], d.coords[0], d.coords[1]);
    if (distanceKm === 0) return { status: "same-place" };

    return {
      status: "ok",
      originMatch: o.name,
      destMatch: d.name,
      distanceKm,
      // کرایه‌ی یک کامیون: نرخ میانه‌ی مشاهده‌شده × فاصله
      truckCost: perKm.median * distanceKm,
      truckLow: perKm.min != null ? perKm.min * distanceKm : null,
      truckHigh: perKm.max != null ? perKm.max * distanceKm : null,
      // فقط اگر نمونه‌ی تناژدار داشتیم؛ وگرنه چیزی از خودمان نمی‌سازیم
      perTonCost: perTonKm.median != null ? perTonKm.median * distanceKm : null,
    };
  }, [origin, destination, places, perKm, perTonKm]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <h2 className="text-lg font-bold mb-1">جست‌وجوی هوشمند کرایه</h2>
      <p className="text-sm text-slate-500 mb-4">
        مبدأ و مقصد را انتخاب کنید یا تایپ کنید — سیستم بر اساس نرخ‌های واقعی مشاهده‌شده، هزینه‌ی
        تخمینی حمل یک محموله‌ی <b className="font-tabular">۲۴</b>‌تنی را برآورد می‌کند.
      </p>

      <datalist id="transit-places-list">
        {placeNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">مبدأ</label>
          <input
            type="text"
            list="transit-places-list"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="مثلاً مشهد"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">مقصد</label>
          <input
            type="text"
            list="transit-places-list"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="مثلاً آستارا"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4">
        {result.status === "empty" && (
          <p className="text-xs text-slate-400">مبدأ و مقصد را وارد کنید تا برآورد نمایش داده شود.</p>
        )}

        {result.status === "unknown" && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            {result.unresolvedOrigin && result.unresolvedDest
              ? "نه مبدأ و نه مقصد در پایگاه مختصات ثبت‌شده نیستند."
              : result.unresolvedOrigin
              ? "این مبدأ هنوز در پایگاه مختصات ثبت نشده."
              : "این مقصد هنوز در پایگاه مختصات ثبت نشده."}{" "}
            فهرست مکان‌های شناخته‌شده را از راهنمای زیر انتخاب کنید — با جمع‌شدن داده‌ی بیشتر از
            ایجنت رصد روزانه، این فهرست گسترش پیدا می‌کند.
          </p>
        )}

        {result.status === "no-rate" && (
          <p className="text-xs text-slate-500">
            هنوز نرخ پایه‌ای از پست‌های واقعی محاسبه نشده — با اجرای بعدی ایجنت رصد این بخش فعال
            می‌شود.
          </p>
        )}

        {result.status === "same-place" && (
          <p className="text-xs text-slate-500">مبدأ و مقصد یکی هستند.</p>
        )}

        {result.status === "ok" && (
          <div className="rounded-lg bg-petrol-50 border border-petrol-100 p-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <span className="text-sm text-slate-600">
                {result.originMatch} ← {result.destMatch} · حدود{" "}
                <b className="font-tabular">{result.distanceKm.toLocaleString("fa-IR")}</b> کیلومتر
              </span>
              <span className="text-xs text-slate-400">کرایه‌ی یک کامیون</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-petrol-900 font-tabular">
              {formatToman(result.truckCost)}
            </div>

            {result.truckLow != null && (
              <div className="text-xs text-slate-500 mt-1">
                بازه‌ی مشاهده‌شده در نمونه: {formatToman(result.truckLow)} تا{" "}
                {formatToman(result.truckHigh)}
              </div>
            )}

            {result.perTonCost != null && (
              <div className="text-xs text-slate-500 mt-1">
                بر پایه‌ی {perTonKm.sampleSize.toLocaleString("fa-IR")} پست تناژدار:{" "}
                {formatToman(result.perTonCost)} به ازای هر تن — یعنی{" "}
                {formatToman(result.perTonCost * SHIPMENT_TONS)} برای یک محموله‌ی{" "}
                {SHIPMENT_TONS.toLocaleString("fa-IR")} تنی
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-3 leading-6">
        روش محاسبه: نرخ <b>میانه</b>ی مشاهده‌شده (
        {perKm.median != null && (
          <b className="font-tabular text-slate-600">
            {Math.round(perKm.median).toLocaleString("fa-IR")}
          </b>
        )}{" "}
        تومان به ازای هر کیلومتر برای یک کامیون، از روی{" "}
        <b className="font-tabular">{perKm.sampleSize.toLocaleString("fa-IR")}</b> پست واقعی
        {perTonKm.sampleSize > 0 && (
          <>
            ؛ و {perTonKm.sampleSize.toLocaleString("fa-IR")} پست که تناژ هم داشتند
          </>
        )}
        ) × فاصله‌ی هوایی مبدأ-مقصد. چون نمونه کوچک است از میانه استفاده می‌شود، نه میانگین.
        این فقط یک <b>تخمین</b> است، نه استعلام مستقیم همان مسیر: مسیرهای کوتاه معمولاً
        گران‌تر از این عدد و مسیرهای خیلی بلند ارزان‌تر درمی‌آیند، و فاصله‌ی واقعی جاده‌ای هم
        از فاصله‌ی هوایی بیشتر است. این ارقام به <b>تومان</b> (ارز داخلی) هستند و با قیمت‌های
        FOB/CIF دلاری مستقیماً قابل‌مقایسه نیستند.
      </p>
    </section>
  );
}
