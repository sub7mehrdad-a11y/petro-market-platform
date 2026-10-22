"use client";

import { useEffect, useState } from "react";

/**
 * فهرست بخش‌های صفحه (پروفایل رقیب پرحجم): دسکتاپ = چیپ‌های چسبان زیر نوار بالا، موبایل = انتخاب‌گر.
 * بخش‌ها از خود DOM خوانده می‌شوند (هر <section data-nav> با عنوان h2 یا data-nav-title) تا فهرست
 * هرگز از محتوای واقعی صفحه جدا نشود؛ بخش بدون عنوان در فهرست نمی‌آید.
 */
export default function SectionNav() {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    const els = [...document.querySelectorAll("main section[data-nav]")];
    const list = els
      .map((el, i) => {
        const title = el.dataset.navTitle || el.querySelector("h2")?.textContent?.trim();
        if (!title) return null;
        if (!el.id) el.id = `sec-${i + 1}`;
        return { id: el.id, title };
      })
      .filter(Boolean);
    setItems(list);
    if (!list.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" }
    );
    list.forEach((it) => io.observe(document.getElementById(it.id)));
    return () => io.disconnect();
  }, []);

  if (items.length < 3) return null;

  function go(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  return (
    <div className="print:hidden sticky top-[76px] z-10 -mx-4 border-b border-border bg-canvas/95 px-4 py-2 backdrop-blur lg:-mx-8 lg:px-8">
      <label className="flex flex-col gap-1 text-xs font-semibold sm:hidden">
        رفتن به بخش
        <select className="input font-normal" value={active || ""} onChange={(e) => go(e.target.value)}>
          <option value="" disabled>انتخاب بخش</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>{it.title}</option>
          ))}
        </select>
      </label>
      <nav aria-label="بخش‌های صفحه" className="hidden max-h-[92px] flex-wrap gap-2 overflow-y-auto sm:flex">
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            onClick={(e) => {
              e.preventDefault();
              go(it.id);
            }}
            aria-current={active === it.id ? "true" : undefined}
            className={`chip !min-h-8 !px-3 !py-1 text-xs hover:no-underline ${active === it.id ? "chip-active" : ""}`}
          >
            {it.title}
          </a>
        ))}
      </nav>
    </div>
  );
}
