// فقط برای تست خط فرمان: نگاشت import "@/…" (alias جاری Next، jsconfig.json) به web/… و ایمپورت نسبی بدون پسوند
// ("./salesFormat" → salesFormat.js) تا ماژول‌های lib بدون Next اجرا شوند.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
const webDir = process.cwd();
register("data:text/javascript," + encodeURIComponent(`
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const web = ${JSON.stringify(webDir)};
const EXTS = ["", ".js", ".jsx", ".mjs"];
function withExt(p) {
  for (const ext of EXTS) { if (fs.existsSync(p + ext) && fs.statSync(p + ext).isFile()) return p + ext; }
  return null;
}
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const p = withExt(path.join(web, specifier.slice(2))) || path.join(web, specifier.slice(2));
    return next(pathToFileURL(p).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL && context.parentURL.startsWith("file:") && !path.extname(specifier)) {
    const p = withExt(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (p) return next(pathToFileURL(p).href, context);
  }
  return next(specifier, context);
}
`), pathToFileURL("./"));
