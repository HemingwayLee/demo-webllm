import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

// Builds one extension: copies its static files and bundles its scripts.
// Scripts import WebLLM from node_modules, so each one is bundled into a single
// file. Chrome extensions can't load code from a CDN, so everything must be local.
async function buildExtension({ src, out, files, scripts }) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  for (const file of files) {
    cpSync(`${src}/${file}`, `${out}/${file}`, {
      recursive: true,
      filter: (f) => !f.endsWith(".svg"),
    });
  }

  await build({
    entryPoints: scripts.map((s) => `${src}/${s}`),
    bundle: true,
    format: "esm",
    target: "chrome124",
    outdir: out,
    logLevel: "info",
  });
}

// WebLLM Model Manager -> load dist/ in Chrome
await buildExtension({
  src: "src",
  out: "dist",
  files: ["manifest.json", "manager.html", "manager.css", "icons"],
  scripts: ["background.js", "manager.js"],
});

