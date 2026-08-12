// shot.ts — dedicated screenshot helper (own browser, not the shared session).
// Usage: bun scripts/shot.ts <url> <out.png> [clickText] [clickText2...]
// @ts-ignore — playwright borrowed from the Browser skill
import { chromium } from "/Users/jasperhall/.claude/skills/Browser/node_modules/playwright/index.mjs";

const [url, out, ...clicks] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await page.goto(url, { waitUntil: "networkidle" });
for (const text of clicks) {
  await page.evaluate((t: string) => {
    const els = [...document.querySelectorAll("button")];
    const el = els.find((e) => (e.textContent ?? "").trim().includes(t));
    if (el) (el as HTMLElement).click();
  }, text);
  await page.waitForTimeout(500);
}
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: false });
console.log(out);
await browser.close();
