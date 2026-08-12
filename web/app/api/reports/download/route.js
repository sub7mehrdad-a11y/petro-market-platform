import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getReportsManifest, getReportsDir } from "@/lib/data";

const CONTENT_TYPES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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

  const filePath = path.join(getReportsDir(), entry.relative_path);
  if (!filePath.startsWith(getReportsDir()) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "فایل روی دیسک پیدا نشد" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(entry.original_filename)}`,
    },
  });
}
