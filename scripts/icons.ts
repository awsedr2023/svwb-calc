import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Rasterize the existing code-native icon; no external image service required.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const svg = readFileSync(
    new URL('../public/favicon.svg', import.meta.url),
    'utf8',
  );
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:#6d50d6}svg{width:100vw;height:100vh}</style>${svg}`,
    );
    await page.screenshot({
      path: new URL(`../public/icon-${size}.png`, import.meta.url).pathname,
    });
  }
} finally {
  await browser.close();
}
