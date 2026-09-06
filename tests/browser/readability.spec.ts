import { test, expect } from '@playwright/test';

test('desktop labels are readable without changing mobile input sizing', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('計算完了');
  const font = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await font('.number-field > span')).toBe(14);
  expect(await font('.field-note')).toBe(13);
  expect(await font('.input-wrap input')).toBe(19);
  await page.screenshot({
    path: testInfo.outputPath('desktop-readable.png'),
    fullPage: true,
  });
  await page.locator('#source-0-kind').selectOption('search');
  await page.locator('#source-0-unit').selectOption('types');
  for (const width of [1001, 1280, 1440, 1920, 3379]) {
    await page.setViewportSize({ width, height: 1080 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const input = page.locator('#source-0-draw');
    expect(await input.evaluate((el) => el.clientWidth)).toBeGreaterThan(50);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await font('.input-wrap input')).toBe(16);
  expect(await font('.number-field > span')).toBe(13);
  expect(await font('.field-note')).toBe(12);
  await expect(page.locator('footer .disclaimer')).toContainText(
    '株式会社Cygames',
  );
  await expect(page.locator('footer .disclaimer')).toContainText(
    '公式サービスではなく',
  );
  await expect(page.getByRole('status')).toContainText('計算完了');
  await page.screenshot({
    path: testInfo.outputPath('mobile-readable.png'),
    fullPage: true,
  });
  for (const width of [320, 375, 390, 430, 760]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
