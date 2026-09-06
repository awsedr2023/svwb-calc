import { test, expect } from '@playwright/test';

test('retention counts and aggregated copies persist, and total overflow blocks calculation', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page.locator('#source-0-copies').fill('12');
  await page.locator('#source-0-keep').selectOption('1');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page.getByRole('button', { name: '比較用に固定' }).click();
  await page.locator('#source-0-keep').selectOption('2');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page.locator('.pinned-panel summary').click();
  await expect(page.locator('.pinned-panel')).toContainText(
    '初手に最大1枚残す',
  );
  await page.reload();
  await expect(page.locator('#source-0-copies')).toHaveValue('12');
  await expect(page.locator('#source-0-keep')).toHaveValue('2');
  await page.locator('#source-0-copies').fill('40');
  await expect(page.getByRole('alert')).toContainText('合計40枚以内');
  await expect(page.locator('.stat-value').first()).toHaveText('—');
  await expect(
    page.getByRole('button', { name: '比較用に固定' }),
  ).toBeDisabled();
  await page.getByRole('checkbox', { name: 'ソース1を有効にする' }).uncheck();
  await page.locator('#target-copies').fill('40');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.stat-value').first()).toHaveText('100.00%');
  await expect(page).toHaveTitle('SVWB ドロー確率計算');
});

test('source toggles preserve settings, comparisons and saved state', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('計算完了');
  const toggle = page.getByRole('checkbox', { name: 'ソース1を有効にする' });
  await expect(toggle).toBeChecked();
  await page.getByRole('button', { name: '比較用に固定' }).click();
  await toggle.uncheck();
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.stat-value').first()).toHaveText('68.39%');
  await expect(page.locator('.stat-difference').first()).toContainText(
    '固定 73.76%',
  );
  await expect(page.locator('#source-0-draw')).toHaveValue('2');
  await expect(page.locator('#source-0-keep')).toBeDisabled();
  await expect(page.locator('.deck-summary')).toContainText('ソース 0');
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.stat-value').first()).toHaveText('68.39%');
  await toggle.check();
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.stat-value').first()).toHaveText('73.76%');
  await expect(page.locator('#source-0-keep')).toHaveValue('3');
});

test('calculate, compare, switch views and persist inputs', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.stat-value').first()).toContainText('73.76');
  await expect(
    page.getByRole('heading', { name: '5ターン目の到達確率' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '比較用に固定' }).click();
  await page.locator('#target-copies').fill('2');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.stat-difference').first()).toContainText('−');
  await expect(page.locator('.pinned-panel')).toContainText('対象3枚');
  await page.getByRole('tab', { name: '表', exact: true }).click();
  await expect(page.getByRole('table')).toHaveCount(2);
  await expect(
    page.getByRole('columnheader', { name: '差', exact: true }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: '先攻 4ターン目を選択' }).click();
  await expect(
    page.getByRole('heading', { name: '4ターン目の到達確率' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'すべて交換', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'すべて交換', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator('#target-copies')).toHaveValue('2');
  await expect(
    page.getByRole('heading', { name: '4ターン目の到達確率' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page.screenshot({
    path: testInfo.outputPath('page.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('extra PP and no-source cases work and source limit is enforced', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'ソース1を削除' }).click();
  await page.locator('#target-cost').fill('6');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.stat-value').first()).toHaveText('0.00%');
  await expect(page.locator('.stat-value').last()).toHaveText('68.39%');
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'ドローソースを追加' }).click();
  await expect(
    page.getByRole('button', { name: 'ドローソースを追加' }),
  ).toBeDisabled();
  await page.locator('#extra-policy').selectOption('reserve');
  await expect(page.locator('#extra-policy')).toHaveValue('reserve');
});

test('damaged storage falls back to defaults', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('svwb-draw-lab:config:v1', '{bad data'),
  );
  await page.goto('./');
  await expect(page.locator('#target-copies')).toHaveValue('3');
  await expect(page.getByRole('status')).toContainText('計算完了');
});

test('input edits cancel old workers and leave no stale results', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page.locator('#target-copies').fill('1');
  await expect(
    page.getByRole('button', { name: '比較用に固定' }),
  ).toBeDisabled();
  await page.locator('#target-copies').fill('2');
  await page.locator('#target-copies').fill('3');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.stat-value').first()).toContainText('73.76');
  await page.locator('#source-0-draw').fill('5');
  await page.getByRole('button', { name: '中止', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('計算を中止しました');
  await page.getByRole('button', { name: '再計算', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('計算完了');
});

test('invalid numeric drafts hide results and cannot be pinned', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page.locator('#target-copies').fill('41');
  await expect(page.locator('#target-copies')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByRole('status')).toContainText('範囲内の整数');
  await expect(
    page.getByRole('button', { name: '比較用に固定' }),
  ).toBeDisabled();
  await expect(page.locator('.stat-value').first()).toHaveText('—');
  await page.locator('#target-copies').fill('2');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(
    page.getByRole('button', { name: '比較用に固定' }),
  ).toBeEnabled();
});

test('heavy conditions report the computation cap and can recover', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('heavy-loaded')) {
      sessionStorage.setItem('heavy-loaded', '1');
      localStorage.setItem(
        'svwb-draw-lab:config:v1',
        JSON.stringify({
          target: { copies: 1, cost: 0 },
          turn: 5,
          extra: 'greedy',
          sources: Array.from({ length: 5 }, (_, i) => ({
            cost: i % 2,
            draw: Math.min(5, i + 1),
            copies: 3,
            keep: i % 2 === 0 ? 4 : 0,
          })),
        }),
      );
    }
  });
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('計算量の上限');
  await expect(
    page.getByRole('button', { name: '比較用に固定' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'ソース5を削除' }).click();
  await page.getByRole('button', { name: 'ソース4を削除' }).click();
  await page.getByRole('button', { name: 'ソース3を削除' }).click();
  await expect(page.getByRole('status')).toContainText('計算完了');
});

test('five-source workload completes in a separate worker on a Pages-style path', async ({
  page,
}, testInfo) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.addInitScript(() =>
    localStorage.setItem(
      'svwb-draw-lab:config:v1',
      JSON.stringify({
        target: { cost: 3, copies: 3 },
        turn: 5,
        extra: 'greedy',
        sources: [
          { cost: 1, draw: 1, copies: 3, keep: 3 },
          { cost: 2, draw: 2, copies: 3, keep: 3 },
          { cost: 3, draw: 2, copies: 3, keep: 0 },
          { cost: 4, draw: 3, copies: 3, keep: 0 },
          { cost: 2, draw: 1, copies: 3, keep: 3 },
        ],
      }),
    ),
  );
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('計算完了');
  expect(workers.some((url) => url.includes('/svwb-calc/assets/worker-'))).toBe(
    true,
  );
  await expect(page.locator('.stat-value').first()).toHaveText('85.43%');
  await expect(page.locator('.stat-value').last()).toHaveText('86.75%');
  const time = await page.locator('.status-detail').textContent();
  console.log(`${testInfo.project.name} / 5 sources: ${time}`);
  await page.getByRole('button', { name: '比較用に固定' }).click();
  await page.locator('#target-copies').fill('2');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.pinned-panel')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('comparison.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
