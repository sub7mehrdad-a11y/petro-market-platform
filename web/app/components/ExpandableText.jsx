"use client";

import { useEffect, useRef, useState } from "react";

// متن بلند با برش چندخطی + دکمه‌ی «ادامه‌ی خبر / بستن» (فقط وقتی متن واقعاً بریده شده دکمه نشان داده می‌شود).
export default function ExpandableText({ text, lines = 4, className = "" }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (!open) setClamped(el.scrollHeight - el.clientHeight > 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, open, lines]);

  return (
    <div>
      <p
        ref={ref}
        className={className}
        style={open ? undefined : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" }}
      >
        {text}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 text-xs font-semibold text-primary hover:underline"
        >
          {open ? "بستن ▴" : "ادامه‌ی خبر ▾"}
        </button>
      )}
    </div>
  );
}
