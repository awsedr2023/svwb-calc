import { test, expect } from '@playwright/test';

test('random n search with shared candidates and independent keep counts persists', async ({
  page,
}, testInfo) => {
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page.locator('#source-0-kind').selectOption('search');
  await page.locator('#source-0-keep').selectOption('1');
  await page.getByRole('button', { name: 'その他の候補を追加' }).click();
  await page.locator('#search-other-0-copies').fill('7');
  await page
    .locator('.source-card')
    .nth(0)
    .getByRole('checkbox', { name: 'その他1（7枚）', exact: true })
    .check();
  await page.getByRole('button', { name: 'ドローソースを追加' }).click();
  await page.locator('#source-1-kind').selectOption('search');
  await page.locator('#source-1-keep').selectOption('2');
  await page
    .locator('.source-card')
    .nth(1)
    .getByRole('checkbox', { name: 'その他1（7枚）', exact: true })
    .check();
  await page
    .locator('.source-card')
    .nth(0)
    .getByRole('checkbox', { name: 'ソース2（3枚）', exact: true })
    .check();
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('#source-0-keep')).toHaveValue('1');
  await expect(page.locator('#source-1-keep')).toHaveValue('2');
  await page.getByRole('button', { name: '比較用に固定' }).click();
  await page.locator('.pinned-panel summary').click();
  await expect(page.locator('.pinned-panel')).toContainText('2枚サーチ');
  await expect(page.locator('.pinned-panel')).toContainText('その他1（7枚）');
  await expect(page.locator('#source-0-unit')).toHaveValue('cards');
  await page.locator('#source-0-unit').selectOption('types');
  await expect(page.locator('.source-card').first()).toContainText('最大2種類');
  await expect(page.locator('#source-0-keep option')).toHaveCount(4);
  await expect(
    page.getByText('狙ったターンにカードを使える確率を。'),
  ).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.pinned-panel')).toContainText('2枚サーチ');
  await page.reload();
  await expect(page.locator('#source-0-unit')).toHaveValue('types');
  await expect(page.locator('#source-0-kind')).toHaveValue('search');
  await expect(page.locator('#source-0-keep')).toHaveValue('1');
  await expect(page.locator('#source-1-keep')).toHaveValue('2');
  await expect(page.locator('#search-other-0-copies')).toHaveValue('7');
  await expect(
    page
      .locator('.source-card')
      .nth(0)
      .getByRole('checkbox', { name: 'ソース2（3枚）', exact: true }),
  ).toBeChecked();
  await expect(page.getByRole('status')).toContainText('計算完了');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('search.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'ソース2を削除', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page
    .getByRole('button', { name: 'その他1を削除', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('計算完了');
});

test('search n accepts 40, normal draw caps at 5, and empty candidates can be recovered', async ({
  page,
}) => {
  await page.goto('./');
  await page.locator('#source-0-kind').selectOption('search');
  await page.locator('#source-0-draw').fill('40');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('#source-0-draw')).toHaveValue('40');
  await page
    .locator('.source-card')
    .getByRole('checkbox', { name: '対象カード（3枚）', exact: true })
    .uncheck();
  await page.locator('#source-0-keep').selectOption('0');
  await expect(page.getByRole('status')).toContainText('計算完了');
  await expect(page.locator('.stat-value').first()).toHaveText('68.39%');
  await page.locator('#source-0-kind').selectOption('draw');
  await expect(page.locator('#source-0-draw')).toHaveValue('5');
  await expect(page.getByRole('status')).toContainText('計算完了');
});
