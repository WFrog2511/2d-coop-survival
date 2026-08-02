import { expect, test } from '@playwright/test';

test('武器を切り替え、敗北後に初期状態へ再挑戦できる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('weapon')).toHaveText('アサルトライフル');
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect(page.getByTestId('enemy-hp')).toHaveText('3');
  await expect(page.getByTestId('drone-hp')).toHaveText('2');
  const bounds = await page.locator('#game canvas').boundingBox();
  if (!bounds) {
    throw new Error('戦闘アリーナのcanvasが見つかりません。');
  }

  await page.mouse.click(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await expect(page.getByTestId('enemy-hp')).toHaveText('2', { timeout: 3_000 });
  await expect(page.getByTestId('feedback')).toContainText('命中');
  await page.keyboard.press('2');
  await expect(page.getByTestId('weapon')).toHaveText('ショットガン');
  await expect(page.getByTestId('defeat')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('defeat')).toBeHidden();
  await expect(page.getByTestId('weapon')).toHaveText('アサルトライフル');
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect(page.getByTestId('enemy-hp')).toHaveText('3');
  await expect(page.getByTestId('drone-hp')).toHaveText('2');
  await expect(page.getByTestId('feedback')).toHaveText('-');
  expect(errors).toEqual([]);
});
