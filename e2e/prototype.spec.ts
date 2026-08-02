import { expect, test } from '@playwright/test';

test('敵に敗北した後、再挑戦で両HPと通常状態が復元される', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await page.goto('/');
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect(page.getByTestId('enemy-hp')).toHaveText('3');
  await expect(page.getByTestId('defeat')).toBeHidden();

  const arena = page.locator('#game canvas');
  const bounds = await arena.boundingBox();
  if (!bounds) {
    throw new Error('戦闘アリーナのcanvasが見つかりません。');
  }

  const enemyX = bounds.x + (bounds.width * 90) / 800;
  const enemyY = bounds.y + (bounds.height * 90) / 500;
  await page.mouse.click(enemyX, enemyY);
  await expect(page.getByTestId('enemy-hp')).toHaveText('2', { timeout: 3_000 });

  await expect(page.getByTestId('defeat')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('retry').click();

  await expect(page.getByTestId('defeat')).toBeHidden();
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect(page.getByTestId('enemy-hp')).toHaveText('3');
  expect(errors).toEqual([]);
});
