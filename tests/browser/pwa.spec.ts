import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

test('offline reload and worker calculation; explicit update reloads all tabs and retains settings', async ({
  context,
}) => {
  let revision = 1;
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url!, 'http://localhost').pathname;
      if (!path.startsWith('/svwb-calc/')) {
        res.writeHead(404).end();
        return;
      }
      const file = path.slice('/svwb-calc/'.length) || 'index.html';
      let data = await readFile(resolve('dist', file));
      if (file === 'sw.js' && revision === 2)
        data = Buffer.from(
          data
            .toString()
            .replace(
              /const CACHE = PREFIX \+ '[^']+';/,
              "const CACHE = PREFIX + 'test-revision-2';",
            ),
        );
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.webmanifest': 'application/manifest+json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };
      res
        .writeHead(200, {
          'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number };
  try {
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        console.log(message.text());
    });
    const url = `http://127.0.0.1:${address.port}/svwb-calc/`;
    await page.goto(url);
    await expect(page.getByRole('status')).toContainText('計算完了');
    await expect(
      page.getByText('オフラインで利用できます', { exact: true }),
    ).toBeVisible();
    await page.locator('#target-copies').fill('2');
    await expect(page.getByRole('status')).toContainText('計算完了');
    const before = await page.locator('.stat-value').first().textContent();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#target-copies')).toHaveValue('2');
    await expect(page.getByRole('status')).toContainText('計算完了');
    await expect(page.locator('.stat-value').first()).toHaveText(before!);
    await page.locator('#target-copies').fill('1');
    await expect(page.getByRole('status')).toContainText('計算完了');
    await expect(page.locator('.stat-value').first()).not.toHaveText(before!);
    const manifest = await page.evaluate(async () => {
      const link =
        document.querySelector<HTMLLinkElement>('link[rel=manifest]')!;
      const m = await (await fetch(link.href)).json();
      for (const icon of m.icons)
        if (!(await fetch(new URL(icon.src, link.href))).ok)
          throw new Error('Missing icon');
      return m;
    });
    expect(manifest.display).toBe('standalone');
    const licenses = await page.evaluate(async () =>
      Promise.all(
        ['LICENSE.txt', 'licenses.md'].map(async (file) => {
          const response = await fetch(new URL(file, location.href));
          if (!response.ok) throw new Error('Missing license');
          return response.text();
        }),
      ),
    );
    expect(licenses[0]).toContain('Copyright (c) 2026 awsedr2023');
    expect(licenses[1]).toContain('Copyright (c) 2015-present Jason Miller');
    expect(licenses[1]).toContain('VoidZero Inc. and Vite contributors');
    expect(licenses[1]).toContain('## preact -');
    await context.setOffline(false);
    const second = await context.newPage();
    await second.goto(url);
    await expect(
      second.getByText('オフラインで利用できます', { exact: true }),
    ).toBeVisible();
    revision = 2;
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r!.update();
    });
    await expect(
      page.getByRole('button', { name: '更新して再読み込み' }),
    ).toBeVisible();
    // New worker must wait until the user accepts it.
    expect(
      await page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
      ),
    ).toBe(true);
    await Promise.all([
      page.waitForEvent('load'),
      second.waitForEvent('load'),
      page.getByRole('button', { name: '更新して再読み込み' }).click(),
    ]);
    await expect(page.locator('#target-copies')).toHaveValue('1');
    await expect(page.getByRole('status')).toContainText('計算完了');
    await expect(
      page.getByRole('button', { name: '更新して再読み込み' }),
    ).toHaveCount(0);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('status')).toContainText('計算完了');
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
