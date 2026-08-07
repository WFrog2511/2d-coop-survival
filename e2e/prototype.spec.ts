import { expect, test } from '@playwright/test';
import { findPath, generateArenaMap, selectAmmoBoxTiles, type TilePosition } from '../src/arena-map';
import { AMMO_BOX_RESPAWN_MS, SURVIVAL_LIMIT_MS } from '../src/rules';

type EnemyId = 'basic-1' | 'basic-2' | 'basic-3' | 'drone';
type EnemyPresentation = 'normal' | 'boundary' | 'hidden';

async function currentAmmo(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('ammo').textContent();
  return Number(text?.split('/')[0]);
}

async function expectAmmoBoxCount(
  boxCount: import('@playwright/test').Locator,
  expected: number,
): Promise<void> {
  await expect.poll(async () => boxCount.evaluate(element => (element as HTMLOutputElement).value)).toBe(String(expected));
}

function tileKeysFromAttribute(value: string | null): string[] {
  return value ? value.split('|').filter(key => key.length > 0) : [];
}

async function moveToTile(
  page: import('@playwright/test').Page,
  map: ReturnType<typeof generateArenaMap>,
  target: TilePosition,
  playerTileHud: import('@playwright/test').Locator,
): Promise<void> {
  const currentText = await playerTileHud.textContent();
  const currentParts = currentText?.split(',').map(Number) ?? [];
  const current = { x: Number(currentParts[0]), y: Number(currentParts[1]) };
  const path = findPath(map, current, target);
  if (path.length === 0) throw new Error('ammo box path is not available');
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const next = path[index];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const key = dx > 0 ? 'd' : dx < 0 ? 'a' : dy > 0 ? 's' : 'w';
    await page.keyboard.down(key);
    await expect(playerTileHud).toHaveText(next.x + ',' + next.y, { timeout: 2_000 });
    await page.keyboard.up(key);
  }
}

async function collectAmmoBoxWithClock(
  page: import('@playwright/test').Page,
  map: ReturnType<typeof generateArenaMap>,
  target: TilePosition,
  playerTileHud: import('@playwright/test').Locator,
  boxCount: import('@playwright/test').Locator,
): Promise<void> {
  for (let step = 0; step < 300; step += 1) {
    if ((await boxCount.textContent()) === '3') return;
    const currentText = await playerTileHud.textContent();
    const currentParts = currentText?.split(',').map(Number) ?? [];
    const current = { x: Number(currentParts[0]), y: Number(currentParts[1]) };
    if (current.x === target.x && current.y === target.y) {
      await expect(boxCount).toHaveText('3', { timeout: 2_000 });
      return;
    }
    const path = findPath(map, current, target);
    if (path.length < 2) throw new Error('ammo box path is not available');
    const next = path[1];
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const key = dx > 0 ? 'd' : dx < 0 ? 'a' : dy > 0 ? 's' : 'w';
    await page.keyboard.down(key);
    await page.clock.runFor(100);
    await page.keyboard.up(key);
  }
  await expect(boxCount).toHaveText('3');
}

async function setArenaPhysics(
  page: import('@playwright/test').Page,
  action: 'pause' | 'resume',
): Promise<void> {
  await page.evaluate((physicsAction) => {
    const scene = (window as Window & { __arenaScene?: { physics: { pause: () => void; resume: () => void } } }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.physics[physicsAction]();
  }, action);
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
  const ammoPanel = page.getByTestId('ammo-panel');
  const reloadProgress = page.getByTestId('reload-progress');
  await expect(reloadProgress).toBeHidden();
  await expect(reloadProgress).toHaveAttribute('max', '1');
  await expect.poll(async () => reloadProgress.evaluate(element => (element as HTMLProgressElement).value)).toBe(0);
  await expect(ammoPanel.getByTestId('ammo-panel-weapon')).toHaveText('アサルトライフル');
  await expect(page.getByTestId('ammo-reserve')).toHaveText('予備 40/60');
  await expect(page.getByTestId('ammo-box-count')).toHaveText('4');
  await expect(page.getByTestId('reload')).toHaveText('待機');
  await expect(reloadProgress).toBeHidden();
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect(page.getByTestId('survival-time')).toHaveText(/^\d\d:\d\d$/);
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

  const panelBounds = await ammoPanel.boundingBox();
  if (!panelBounds) throw new Error('ammo panel bounds unavailable');
  expect(panelBounds.x + panelBounds.width).toBeGreaterThan(bounds.x + bounds.width - 32);
  expect(panelBounds.y + panelBounds.height).toBeGreaterThan(bounds.y + bounds.height - 32);

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
  const map = generateArenaMap(Number(await page.getByTestId('map-seed').textContent()));
  const boxTiles = selectAmmoBoxTiles(map);
  expect(boxTiles).toHaveLength(4);
  const firstBox = boxTiles[0];
  const firstBoxKey = firstBox.x + ',' + firstBox.y;
  const initialBoxKeys = await page.getByTestId('ammo-box-count').getAttribute('data-active-tiles');
  expect(tileKeysFromAttribute(initialBoxKeys)).toContain(firstBoxKey);
  await moveToTile(page, map, firstBox, playerTileHud);
  await expect(page.getByTestId('ammo-box-count')).toHaveText('3');
  const waitingBoxKeys = await page.getByTestId('ammo-box-count').getAttribute('data-active-tiles');
  expect(tileKeysFromAttribute(waitingBoxKeys)).not.toContain(firstBoxKey);
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', firstBoxKey);
  await expect(page.getByTestId('ammo-reserve')).toHaveText('予備 60/60');

  await moveToTile(page, map, map.start, playerTileHud);
  await moveToTile(page, map, firstBox, playerTileHud);
  await expect(page.getByTestId('ammo-box-count')).toHaveText('3');
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-active-tiles', waitingBoxKeys ?? '');
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', firstBoxKey);
  await expect(page.getByTestId('ammo-reserve')).toHaveAttribute('data-reserve', '60');

  await page.keyboard.press('2');
  await expect(page.getByTestId('weapon')).toHaveText('ショットガン');
  await expect(page.getByTestId('ammo')).toHaveText('4/4');
  await expect(page.getByTestId('ammo-reserve')).toHaveText('予備 12/12');
  for (let index = 0; index < 3; index += 1)
    await page.mouse.click(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await expect(page.getByTestId('ammo')).toHaveText('3/4');
  await page.waitForTimeout(800);
  for (let index = 0; index < 3; index += 1) {
    await page.mouse.click(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
    if (index < 2) await page.waitForTimeout(800);
  }
  await expect(page.getByTestId('ammo')).toHaveText('0/4');
  await page.mouse.click(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await page.mouse.click(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await page.mouse.click(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await expect(page.getByTestId('reload')).toContainText('リロード中');
  await expect(page.getByTestId('ammo')).toHaveText('0/4');
  await expect(reloadProgress).toBeVisible();
  await expect.poll(async () => reloadProgress.evaluate((element) => {
    const value = (element as HTMLProgressElement).value;
    return value > 0 && value < 1;
  })).toBe(true);
  await expect(page.getByTestId('reload')).toHaveText('待機', { timeout: 3_000 });
  await expect(reloadProgress).toBeHidden();
  await expect.poll(async () => reloadProgress.evaluate(element => (element as HTMLProgressElement).value)).toBe(0);
  await expect(page.getByTestId('ammo')).toHaveText('4/4');
  await expect(page.getByTestId('ammo-reserve')).toHaveText('予備 8/12');
  await page.mouse.click(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await expect(page.getByTestId('ammo')).toHaveText('3/4');
  await page.keyboard.press('r');
  await expect(reloadProgress).toBeVisible();
  await page.keyboard.press('1');
  await expect(reloadProgress).toBeHidden();
  await expect.poll(async () => reloadProgress.evaluate(element => (element as HTMLProgressElement).value)).toBe(0);

  await expect(page.getByTestId('defeat')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', '');
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('defeat')).toBeHidden();
  await expect(page.getByTestId('victory')).toBeHidden();
  await expect(page.getByTestId('survival-time')).toHaveText('03:00');
  await expect(page.getByTestId('weapon')).toHaveText('アサルトライフル');
  await expect(page.getByTestId('ammo')).toHaveText('20/20');
  await expect(page.getByTestId('ammo-reserve')).toHaveText('予備 40/60');
  await expect(page.getByTestId('ammo-box-count')).toHaveText('4');
  await expect(page.getByTestId('reload')).toHaveText('待機');
  await expect(reloadProgress).toBeHidden();
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

test('3分の境界で勝利し、戦闘停止後の再挑戦でタイマーと状態を初期化できる', async ({ page }) => {
  await page.clock.install({ time: 15 });
  await page.goto('/');
  await expect(page.getByTestId('survival-time')).toHaveText(/^\d\d:\d\d$/);
  const playerTile = page.getByTestId('player-tile');
  const beforeTerminalTile = await playerTile.textContent();
  await page.clock.fastForward(SURVIVAL_LIMIT_MS);
  await expect(page.getByTestId('survival-time')).toHaveText('00:00');
  await expect(page.getByTestId('victory')).toBeVisible();
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', '');
  await expect(page.getByTestId('defeat')).toBeHidden();
  await page.keyboard.press('2');
  await expect(page.getByTestId('weapon')).toHaveText('アサルトライフル');
  await page.keyboard.down('d');
  await page.clock.fastForward(500);
  await page.keyboard.up('d');
  await expect(playerTile).toHaveText(beforeTerminalTile ?? '');
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('victory')).toBeHidden();
  await expect(page.getByTestId('defeat')).toBeHidden();
  await expect(page.getByTestId('survival-time')).toHaveText('03:00');
  await expect(page.getByTestId('ammo')).toHaveText('20/20');
});

test('弾薬箱は取得後30秒で同じboxIdのまま新しい画面外floorへ復活し、重複しない', async ({ page }) => {
  test.setTimeout(45_000);
  await page.clock.install({ time: 0 });
  await page.clock.setFixedTime(15);
  await page.goto('/');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const boxTiles = selectAmmoBoxTiles(map);
  const boxIndex = boxTiles.reduce((best, tile, index) =>
    findPath(map, map.start, tile).length < findPath(map, map.start, boxTiles[best]).length ? index : best, 0);
  const boxId = 'ammo-box-' + (boxIndex + 1);
  const firstBox = boxTiles[boxIndex];
  if (!firstBox) throw new Error('初期弾薬箱が必要です。');
  const firstBoxKey = firstBox.x + ',' + firstBox.y;
  const playerTileHud = page.getByTestId('player-tile');
  const boxCount = page.getByTestId('ammo-box-count');
  await expect(boxCount).toHaveAttribute('data-active-boxes', new RegExp(boxId + ':' + firstBoxKey));
  await collectAmmoBoxWithClock(page, map, firstBox, playerTileHud, boxCount);
  await expect(boxCount).toHaveText('3');
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', boxId);
  await expect(boxCount).toHaveAttribute('data-respawn-tiles', firstBoxKey);
  await setArenaPhysics(page, 'pause');
  await page.clock.runFor(AMMO_BOX_RESPAWN_MS);
  await expect.poll(async () => boxCount.textContent()).toBe('4');
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', '');
  const activeEntries = (await boxCount.getAttribute('data-active-boxes'))?.split('|') ?? [];
  const respawnedEntry = activeEntries.find(entry => entry.startsWith(boxId + ':'));
  if (!respawnedEntry) throw new Error('復活した弾薬箱のboxIdが必要です。');
  const respawnedKey = respawnedEntry.split(':')[1];
  if (!respawnedKey) throw new Error('復活した弾薬箱のtileが必要です。');
  expect(respawnedKey).not.toBe(firstBoxKey);
  const [x, y] = respawnedKey.split(',').map(Number);
  expect(map.tiles[y][x]).toBe('floor');
  expect(findPath(map, map.start, { x, y }).length).toBeGreaterThan(0);
  expect((await boxCount.getAttribute('data-offscreen-boxes'))?.split('|')).toContain(boxId);
  expect(new Set(activeEntries.map(entry => entry.split(':')[0])).size).toBe(activeEntries.length);
});

test('victoryとretryは弾薬箱の復活待ちをclearし、新しいrunを初期化する', async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: 0 });
  await page.clock.setFixedTime(15);
  await page.goto('/');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const boxTiles = selectAmmoBoxTiles(map);
  const boxIndex = boxTiles.reduce((best, tile, index) =>
    findPath(map, map.start, tile).length < findPath(map, map.start, boxTiles[best]).length ? index : best, 0);
  const boxId = 'ammo-box-' + (boxIndex + 1);
  const firstBox = boxTiles[boxIndex];
  if (!firstBox) throw new Error('初期弾薬箱が必要です。');
  const playerTileHud = page.getByTestId('player-tile');
  const boxCount = page.getByTestId('ammo-box-count');
  await expectAmmoBoxCount(boxCount, 4);
  await setArenaPhysics(page, 'pause');
  await page.clock.fastForward(SURVIVAL_LIMIT_MS - AMMO_BOX_RESPAWN_MS);
  await setArenaPhysics(page, 'resume');
  await collectAmmoBoxWithClock(page, map, firstBox, playerTileHud, boxCount);
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', boxId);
  await setArenaPhysics(page, 'pause');
  await page.clock.fastForward(SURVIVAL_LIMIT_MS);
  await expect(page.getByTestId('victory')).toBeVisible();
  await expectAmmoBoxCount(boxCount, 3);
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', '');
  await expect(boxCount).toHaveAttribute('data-respawn-tiles', '');
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('victory')).toBeHidden();
  await expect(page.getByTestId('survival-time')).toHaveText('03:00');
  await expectAmmoBoxCount(boxCount, 4);
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', '');
});
