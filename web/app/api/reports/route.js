import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getReportsManifest, getReportsDir, getManifestFile } from "@/lib/data";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

// اسم کشور/فایل رو محدود به کاراکترهای امن می‌کنه تا کسی نتونه با "../" از
// پوشه‌ی reports بیرون بزنه (path traversal).
function safeSegment(input) {
  return String(input)
    .normalize("NFC")
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .trim()
    .slice(0, 120);
}

export async function GET() {
  const manifest = getReportsManifest();
  return NextResponse.json(manifest);
}

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const country = safeSegment(formData.get("country") || "سایر");
  const product = safeSegment(formData.get("product") || "سایر");
  const title = String(formData.get("title") || "").slice(0, 300);

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "فایلی ارسال نشده" }, { status: 400 });
  }

  const ext = path.extname(file.name || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `فقط فایل‌های ${ALLOWED_EXTENSIONS.join("، ")} پذیرفته می‌شن` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "حجم فایل بیشتر از ۲۵ مگابایت است" }, { status: 400 });
  }

  const reportsDir = getReportsDir();
  const countryDir = path.join(reportsDir, country);
  fs.mkdirSync(countryDir, { recursive: true });

  const safeOriginalName = safeSegment(path.basename(file.name, ext));
  const storedFileName = `${Date.now()}_${safeOriginalName}${ext}`;
  const storedPath = path.join(countryDir, storedFileName);
  fs.writeFileSync(storedPath, buffer);

  const manifest = getReportsManifest();
  const entry = {
    id: `${Date.now()}`,
    title: title || safeOriginalName,
    country,
    product,
    original_filename: file.name,
    relative_path: path.join(country, storedFileName).replace(/\\/g, "/"),
    size_bytes: buffer.length,
    uploaded_at: new Date().toISOString(),
  };
  manifest.push(entry);
  fs.writeFileSync(getManifestFile(), JSON.stringify(manifest, null, 2), "utf-8");

  return NextResponse.json(entry, { status: 201 });
}
