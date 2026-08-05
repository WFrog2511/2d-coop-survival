import { expect, test } from '@playwright/test';

type EnemyId = 'basic-1' | 'basic-2' | 'basic-3' | 'drone';
type EnemyPresentation = 'normal' | 'boundary' | 'hidden';

async function currentAmmo(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('ammo').textContent();
  return Number(text?.split('/')[0]);
}

async function expectEnemyPresentation(
  page: import('@playwright/test').Page,
  id: EnemyId,
  presentation: EnemyPresentation,
): Promise<void> {
  const hud = page.getByTestId(`${id}-hp`);
  const texture = id === 'drone' ? 'drone' : 'basic';
  await expect(hud).toHaveAttribute('data-visibility', presentation);
  await expect(hud).toHaveAttribute('data-sprite-texture', texture);
  await expect(hud).toHaveAttribute('data-silhouette-texture', 'enemy-silhouette');
  if (presentation === 'normal') {
    await expect(hud).toHaveAttribute('data-sprite-visible', 'true');
    await expect(hud).toHaveAttribute('data-sprite-alpha', '1');
    await expect(hud).toHaveAttribute('data-silhouette-visible', 'false');
    return;
  }
  await expect(hud).toHaveAttribute('data-sprite-visible', 'false');
  if (presentation === 'boundary') {
    await expect(hud).toHaveAttribute('data-silhouette-visible', 'true');
    await expect(hud).toHaveAttribute('data-silhouette-alpha', '0.3');
    return;
  }
  await expect(hud).toHaveAttribute('data-silhouette-visible', 'false');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Date.now = () => 15;
  });
});

test('自動射撃、ショットガンの発射待ち、リロード、視界遮蔽と再挑戦を確認できる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('weapon')).toHaveText('アサルトライフル');
  await expect(page.getByTestId('ammo')).toHaveText('20/20');
  await expect(page.getByTestId('reload')).toHaveText('待機');
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect(page.getByTestId('map-seed')).toHaveText('15');
  await expect(page.getByTestId('player-tile')).toHaveText(/\d+,\d+/);
  const playerTileHud = page.getByTestId('player-tile');
  await expect(playerTileHud).toHaveAttribute('data-visibility-mask-alpha', '0.25');
  const initialObscuredTileCount = Number(await playerTileHud.getAttribute('data-obscured-tile-count'));
  expect(initialObscuredTileCount).toBe(803);
  const initialVisibilityPlayerTile = await playerTileHud.getAttribute('data-visibility-player-tile');
  expect(initialVisibilityPlayerTile).toMatch(/^\d+,\d+$/);
  await expect(page.getByTestId('basic-1-hp')).toHaveText('6');
  await expect(page.getByTestId('basic-2-hp')).toHaveText('6');
  await expect(page.getByTestId('basic-3-hp')).toHaveText('6');
  await expect(page.getByTestId('drone-hp')).toHaveText('4');
  await expectEnemyPresentation(page, 'basic-1', 'boundary');
  await expectEnemyPresentation(page, 'basic-2', 'normal');
  await expectEnemyPresentation(page, 'basic-3', 'hidden');
  await expectEnemyPresentation(page, 'drone', 'hidden');
  await expect(page.getByTestId('affinity')).toContainText('小口径弾 50% / 散弾 100%');
  const bounds = await page.locator('#game canvas').boundingBox();
  if (!bounds) throw new Error('戦闘アリーナのcanvasが見つかりません。');

  await expect(page.getByTestId('basic-1-hp')).toHaveAttribute('data-visibility', 'normal', { timeout: 3_000 });
  await expectEnemyPresentation(page, 'basic-1', 'normal');

  const initialTile = await page.getByTestId('player-tile').textContent();
  await page.keyboard.down('d');
  await page.waitForTimeout(350);
  await page.keyboard.up('d');
  await expect(playerTileHud).not.toHaveText(initialTile ?? '');
  await expect(playerTileHud).not.toHaveAttribute('data-visibility-player-tile', initialVisibilityPlayerTile ?? '');
  await expect(playerTileHud).toHaveAttribute('data-visibility-mask-alpha', '0.25');
  await expect(playerTileHud).toHaveAttribute('data-obscured-tile-count', '805');

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

  await expect(page.getByTestId('defeat')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('defeat')).toBeHidden();
  await expect(page.getByTestId('weapon')).toHaveText('アサルトライフル');
  await expect(page.getByTestId('ammo')).toHaveText('20/20');
  await expect(page.getByTestId('reload')).toHaveText('待機');
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect(page.getByTestId('basic-1-hp')).toHaveText('6');
  await expect(page.getByTestId('basic-2-hp')).toHaveText('6');
  await expect(page.getByTestId('basic-3-hp')).toHaveText('6');
  await expect(page.getByTestId('drone-hp')).toHaveText('4');
  await expect(page.getByTestId('feedback')).toHaveText('-');
  const retryPlayerTile = '23,5';
  await expect(page.getByTestId('map-seed')).toHaveText('1038872098');
  await expect(playerTileHud).toHaveText(retryPlayerTile);
  await expect(playerTileHud).toHaveAttribute('data-visibility-mask-alpha', '0.25');
  expect(Number(await playerTileHud.getAttribute('data-obscured-tile-count'))).toBe(920);
  await expect(playerTileHud).toHaveAttribute('data-visibility-player-tile', retryPlayerTile);
  await expectEnemyPresentation(page, 'basic-1', 'hidden');
  await expectEnemyPresentation(page, 'basic-2', 'hidden');
  await expectEnemyPresentation(page, 'basic-3', 'hidden');
  await expectEnemyPresentation(page, 'drone', 'hidden');
  expect(errors).toEqual([]);
});
