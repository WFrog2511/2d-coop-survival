import { expect, test } from '@playwright/test';

async function currentAmmo(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('ammo').textContent();
  return Number(text?.split('/')[0]);
}

test('自動射撃、ショットガンの発射待ち、リロード、再挑戦を確認できる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('weapon')).toHaveText('アサルトライフル');
  await expect(page.getByTestId('ammo')).toHaveText('20/20');
  await expect(page.getByTestId('reload')).toHaveText('待機');
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect(page.getByTestId('basic-1-hp')).toHaveText('3');
  await expect(page.getByTestId('basic-2-hp')).toHaveText('3');
  await expect(page.getByTestId('basic-3-hp')).toHaveText('3');
  await expect(page.getByTestId('drone-hp')).toHaveText('2');
  const bounds = await page.locator('#game canvas').boundingBox();
  if (!bounds) throw new Error('戦闘アリーナのcanvasが見つかりません。');

  await page.mouse.move(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await page.mouse.down();
  await page.waitForTimeout(380);
  await page.mouse.up();
  expect(await currentAmmo(page)).toBeLessThanOrEqual(18);

  await page.keyboard.press('2');
  await expect(page.getByTestId('weapon')).toHaveText('ショットガン');
  await expect(page.getByTestId('ammo')).toHaveText('4/4');
  await page.mouse.click(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await page.mouse.click(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await page.mouse.click(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await expect(page.getByTestId('ammo')).toHaveText('3/4');
  await page.keyboard.press('r');
  await expect(page.getByTestId('reload')).toContainText('リロード中');
  await expect(page.getByTestId('ammo')).toHaveText('3/4');
  await expect(page.getByTestId('reload')).toHaveText('待機', { timeout: 3_000 });
  await expect(page.getByTestId('ammo')).toHaveText('4/4');

  await expect(page.getByTestId('defeat')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('defeat')).toBeHidden();
  await expect(page.getByTestId('weapon')).toHaveText('アサルトライフル');
  await expect(page.getByTestId('ammo')).toHaveText('20/20');
  await expect(page.getByTestId('reload')).toHaveText('待機');
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect(page.getByTestId('basic-1-hp')).toHaveText('3');
  await expect(page.getByTestId('basic-2-hp')).toHaveText('3');
  await expect(page.getByTestId('basic-3-hp')).toHaveText('3');
  await expect(page.getByTestId('drone-hp')).toHaveText('2');
  await expect(page.getByTestId('feedback')).toHaveText('-');
  expect(errors).toEqual([]);
});
