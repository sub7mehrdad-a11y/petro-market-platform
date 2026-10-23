// فقط برای تست خط فرمان: نگاشت import "@/…" (alias جاری Next، jsconfig.json) به web/… تا ماژول‌های lib بدون Next اجرا شوند.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
const webDir = process.cwd();
register("data:text/javascript," + encodeURIComponent(`
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
const web = ${JSON.stringify(webDir)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    let p = path.join(web, specifier.slice(2));
    for (const ext of ["", ".js", ".jsx", ".mjs"]) { if (fs.existsSync(p + ext) && fs.statSync(p + ext).isFile()) { p = p + ext; break; } }
    return next(pathToFileURL(p).href, context);
  }
  return next(specifier, context);
}
`), pathToFileURL("./"));
