import { test, expect } from '@playwright/test';

test('extra PP help opens, scrolls and returns focus without changing settings', async ({
  page,
}) => {
  await page.goto('./');
  const trigger = page.getByRole('button', { name: '方針の説明', exact: true });
  const dialog = page.getByRole('dialog');
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('3PPで2枚引く');
  await expect(dialog).toContainText('5ターン目に6PP');
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#extra-policy')).toHaveValue('greedy');
});
