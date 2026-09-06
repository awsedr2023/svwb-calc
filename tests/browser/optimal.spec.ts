import { test, expect } from '@playwright/test';

test('advanced state budget is collapsed, adjustable, persisted and resettable', async ({
  page,
}) => {
  await page.goto('./');
  const slider = page.getByRole('slider', { name: '計算量上限' });
  await expect(slider).not.toBeVisible();
  await page.getByText('詳細設定', { exact: true }).click();
  await expect(slider).toHaveValue('400000');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('500000');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page.reload();
  await page.getByText('詳細設定', { exact: true }).click();
  await expect(slider).toHaveValue('500000');
  await page.getByRole('button', { name: '標準の40万状態に戻す' }).click();
  await expect(slider).toHaveValue('400000');
});

test('optimal search runs under 4x CPU slowdown, improves legacy and persists', async ({
  page,
}, testInfo) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    if (localStorage.getItem('svwb-draw-lab:config:v1')) return;
    localStorage.setItem(
      'svwb-draw-lab:config:v1',
      JSON.stringify({
        target: { copies: 3, cost: 3 },
        turn: 5,
        extra: 'greedy',
        searchOthers: [3],
        sources: [
          { cost: 1, draw: 2, copies: 2, keep: 1 },
          {
            kind: 'search',
            cost: 2,
            draw: 1,
            copies: 2,
            keep: 1,
            search: { target: true, sources: [0], others: [0], unit: 'types' },
          },
        ],
      }),
    );
  });
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('svwb-draw-lab:config:v1')!).extra,
      ),
    )
    .toBe('optimal');
  console.log(
    `${testInfo.project.name} / optimal mixed search, CPU 4x: ${await page.locator('.status-detail').textContent()}`,
  );
  await page.reload();
  await expect(page.locator('#extra-policy')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('計算完了');
  await cdp.detach();
});
