import { test, expect } from '@playwright/test';

test('source/search/category names appear in candidates and pinned snapshots and persist', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#source-0-name')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'ソース1の名前を編集', exact: true })
    .click();
  await page.locator('#source-0-name').fill('知恵の光');
  await page.locator('#source-0-name').press('Enter');
  await page.getByRole('button', { name: 'ドローソースを追加' }).click();
  await page.locator('#source-1-kind').selectOption('search');
  await page
    .getByRole('button', { name: 'ソース2の名前を編集', exact: true })
    .click();
  await page.locator('#source-1-name').fill('カテゴリサーチ');
  await page.locator('#source-1-name').press('Tab');
  await page
    .getByRole('button', { name: 'カードカテゴリを追加', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'カテゴリ1の名前を編集', exact: true })
    .click();
  await page.locator('#search-other-0-name').fill('カテゴリA');
  await page.locator('#search-other-0-name').press('Enter');
  await expect(
    page.getByRole('checkbox', { name: '知恵の光（3枚）', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'カテゴリA（3枚）', exact: true }),
  ).toBeChecked();
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page.getByRole('button', { name: '比較用に固定' }).click();
  await page.locator('.pinned-panel summary').click();
  await expect(page.locator('.pinned-panel')).toContainText('知恵の光');
  await expect(page.locator('.pinned-panel')).toContainText('カテゴリサーチ');
  await expect(page.locator('.pinned-panel')).toContainText('カテゴリA');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'カテゴリAの名前を編集', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '知恵の光の名前を編集', exact: true })
    .click();
  await page.locator('#source-0-name').fill('取り消し');
  await page.locator('#source-0-name').press('Escape');
  await page
    .getByRole('button', { name: '知恵の光の名前を編集', exact: true })
    .click();
  await page.locator('#source-0-name').fill('');
  await page.locator('#source-0-name').press('Enter');
  await expect(
    page.getByRole('checkbox', { name: 'ソース1（3枚）', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'カテゴリサーチの名前を編集', exact: true })
    .click();
  await page.locator('#source-1-name').fill('x'.repeat(80));
  await page.locator('#source-1-name').press('Enter');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
