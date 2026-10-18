import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getReportsManifest, getReportsDir } from "@/lib/data";

const CONTENT_TYPES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html; charset=utf-8",
};

// دانلود همیشه از روی id در manifest انجام می‌شه (نه از روی مسیر خام URL)
// تا امکان path traversal وجود نداشته باشه.
export async function GET(request) {
  const id = request.nextUrl.searchParams.get("id");
  const manifest = getReportsManifest();
  const entry = manifest.find((e) => e.id === id);

  if (!entry) {
    return NextResponse.json({ error: "گزارش پیدا نشد" }, { status: 404 });
  }

  // format=docx: نسخه‌ی Word اصلی (فقط برای گزارش‌هایی که در manifest فیلد docx_relative_path دارن)
  const wantDocx = request.nextUrl.searchParams.get("format") === "docx";
  if (wantDocx && !entry.docx_relative_path) {
    return NextResponse.json({ error: "نسخه‌ی Word برای این گزارش موجود نیست" }, { status: 404 });
  }
  const relPath = wantDocx ? entry.docx_relative_path : entry.relative_path;
  const downloadName = wantDocx ? entry.docx_filename : entry.original_filename;
  const filePath = path.join(getReportsDir(), relPath);
  if (!filePath.startsWith(getReportsDir()) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "فایل روی دیسک پیدا نشد" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    },
  });
}
