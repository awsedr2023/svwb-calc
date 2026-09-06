import { test, expect } from '@playwright/test';

test('policy controls are removed and optimal assumptions remain accessible', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#extra-policy')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '方針の説明' })).toHaveCount(0);
  await page
    .getByText('プレイ方針・対応範囲を確認する', { exact: true })
    .click();
  await expect(page.getByText(/エクストラPPは後攻で1回/)).toBeVisible();
  await expect(
    page.getByText(/その時点で分かる手札と山札の残枚数/),
  ).toBeVisible();
});
