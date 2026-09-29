/**
 * Headless smoke test against a running Foundry world (default http://localhost:30000).
 * Logs in as the Gamemaster (dev world, no password), runs a scenario script, reports
 * console errors and saves screenshots.
 *
 *   node tools/smoke.mjs [scenario.mjs]
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const URL = process.env.FOUNDRY_URL ?? "http://localhost:30000";
const OUT = process.env.SMOKE_OUT ?? "smoke-out";
const scenario = process.argv[2] ?? "tools/scenarios/basic.mjs";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--mute-audio", "--autoplay-policy=user-gesture-required"]
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
// The software-rendered canvas is slow and crashes long runs; sheets and apps don't need it.
if (!process.env.SMOKE_CANVAS) await page.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
page.on("console", m => {
  const t = m.text();
  if (/AudioContext/.test(t)) return;
  if (m.type() === "error" || /Error|TypeError|ReferenceError/.test(t)) errors.push(`[${m.type()}] ${t}`);
});
page.on("pageerror", e => errors.push(`[pageerror] ${e.message}\n${e.stack?.split("\n").slice(0, 4).join("\n")}`));

await page.goto(`${URL}/join`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("select[name=userid], input[name=username]", { timeout: 30000 });
const who = process.env.SMOKE_USER ?? "gamemaster";
if (await page.$("input[name=username]")) {
  // v14.368+: typed user name instead of a list.
  await page.fill("input[name=username]", process.env.SMOKE_USERNAME ?? (who.toLowerCase() === "gamemaster" ? "Gamemaster" : who));
} else {
  const gm = await page.$eval("select[name=userid]", (s, who) => [...s.options].find(o => o.textContent.trim().toLowerCase().startsWith(who.toLowerCase()) && !o.disabled)?.value, who);
  if (!gm) throw new Error(`User "${who}" is not available (already logged in elsewhere?)`);
  await page.selectOption("select[name=userid]", gm);
}
await page.click("button[name=join]");
await page.waitForFunction(() => window.game?.ready, null, { timeout: 90000 });
await page.waitForTimeout(1500);
// Drop the permanent "no hardware acceleration" banner so it doesn't cover window headers.
await page.evaluate(() => document.querySelectorAll("#notifications .notification.permanent").forEach(n => n.remove()));

const shot = async (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const { default: run } = await import(path.resolve(scenario).replace(/\\/g, "/").replace(/^/, "file:///"));
let result;
try {
  result = await run({ page, shot, errors });
} catch (err) {
  errors.push(`[scenario] ${err.message}`);
}
console.log(JSON.stringify({ result, errors }, null, 2));
await browser.close();
