import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

// Static files are copied as-is.
for (const file of ["manifest.json", "popup.html"]) {
  cpSync(`src/${file}`, `dist/${file}`);
}
cpSync("src/icons", "dist/icons", { recursive: true, filter: (f) => !f.endsWith(".svg") });

// popup.js imports WebLLM from node_modules, so bundle it into one file.
// Chrome extensions can't load code from a CDN, so everything must be local.
await build({
  entryPoints: ["src/popup.js"],
  bundle: true,
  format: "esm",
  target: "chrome124",
  outdir: "dist",
  logLevel: "info",
});
