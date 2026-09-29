/**
 * Build a release: packs → manifest with GitHub URLs → dist/mozaika-<ver>.zip + dist/system.json.
 *   node tools/release.mjs [--repo owner/name] [--version x.y.z]
 * Then: gh release create v<ver> dist/system.json dist/mozaika-<ver>.zip
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const arg = n => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
const repo = arg("repo") ?? "heisssen/mozaika";
const SYS = path.resolve("system");
const manifestPath = path.join(SYS, "system.json");
const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (arg("version")) m.version = arg("version");
const v = m.version;
const zipName = `${m.id}-${v}.zip`;
Object.assign(m, {
  url: `https://github.com/${repo}`,
  manifest: `https://github.com/${repo}/releases/latest/download/system.json`,
  download: `https://github.com/${repo}/releases/download/v${v}/${zipName}`,
  bugs: `https://github.com/${repo}/issues`,
  readme: `https://github.com/${repo}/blob/main/README.md`
});
fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + "\n");

if (!process.argv.includes("--no-pack")) execFileSync("node", ["tools/pack.mjs"], { stdio: "inherit" });
fs.mkdirSync("dist", { recursive: true });
const zipPath = path.resolve("dist", zipName);
fs.rmSync(zipPath, { force: true });
// Zip system/ as mozaika/…, skipping LevelDB lock/log files.
execFileSync("python", ["-c", `
import os, sys, zipfile
src, out, top = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        for f in files:
            if f == "LOCK" or f.endswith(".log") or f.startswith("LOG"): continue
            full = os.path.join(root, f)
            z.write(full, os.path.join(top, os.path.relpath(full, src)))
`, SYS, zipPath, m.id]);
fs.copyFileSync(manifestPath, path.resolve("dist", "system.json"));
console.log(`built dist/${zipName} (v${v}) → ${m.manifest}`);
