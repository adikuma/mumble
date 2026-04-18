import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("docs/screenshots/m1-scaffold");
const URL = process.env.MUMBLE_DEV_URL ?? "http://localhost:1420";

mkdirSync(OUT, { recursive: true });

const shots = [
  { name: "01-history-dark-wide", theme: "dark", w: 1280, h: 800, view: "history" },
  { name: "02-history-light-wide", theme: "light", w: 1280, h: 800, view: "history" },
  { name: "03-settings-dark-wide", theme: "dark", w: 1280, h: 800, view: "settings" },
  { name: "04-settings-light-wide", theme: "light", w: 1280, h: 800, view: "settings" },
  { name: "05-history-dark-default", theme: "dark", w: 960, h: 640, view: "history" },
  { name: "06-history-light-default", theme: "light", w: 960, h: 640, view: "history" },
  { name: "07-history-light-narrow", theme: "light", w: 720, h: 640, view: "history" },
  { name: "08-mic-indicator-dark", theme: "dark", w: 1280, h: 800, view: "history", mic: true },
  { name: "09-mic-indicator-light", theme: "light", w: 1280, h: 800, view: "history", mic: true },
];

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ deviceScaleFactor: 2 });
const page = await ctx.newPage();

for (const s of shots) {
  await page.setViewportSize({ width: s.w, height: s.h });
  await page.goto(URL, { waitUntil: "networkidle" });

  // Force theme before anything renders
  await page.evaluate((t) => {
    localStorage.setItem("mumble-theme", t);
  }, s.theme);
  await page.reload({ waitUntil: "networkidle" });

  // Navigate to the requested view
  if (s.view === "settings") {
    await page.getByRole("button", { name: "Settings" }).click();
  }

  // Toggle mic preview if requested
  if (s.mic) {
    await page.getByRole("button", { name: "Toggle mic preview" }).click();
  }

  // Let animations settle
  await page.waitForTimeout(250);

  const path = resolve(OUT, `${s.name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  ${s.name}.png  (${s.w}x${s.h}, ${s.theme})`);
}

await browser.close();
console.log(`\nDone. ${shots.length} screenshots in ${OUT}`);
