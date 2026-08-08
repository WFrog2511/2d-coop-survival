import { expect, test } from '@playwright/test';
import { SPAWN_PHASE_MS, enemyVisibility, findPath, generateArenaMap, hiddenRecycleThresholdFor, primarySpawnDirection, recycleDelayFor, respawnDelayFor, selectAmmoBoxTiles, spawnDirectionForSlot, type SpawnDirection, type TilePosition, viewportTileRect } from '../src/arena-map';
import { AMMO_BOX_RESPAWN_MS, ENEMY_INSTANCE_IDS, SURVIVAL_LIMIT_MS } from '../src/rules';

type EnemyId = (typeof ENEMY_INSTANCE_IDS)[number];
type EnemyPresentation = 'normal' | 'boundary' | 'hidden';
const INITIAL_ACTIVE_IDS: readonly EnemyId[] = ['basic-1', 'basic-2', 'basic-3', 'basic-4', 'basic-5', 'basic-6', 'drone-1', 'drone-2'];
const STAGGERED_ENEMIES: readonly { id: EnemyId; delay: number }[] = [
  { id: 'basic-7', delay: 3000 },
  { id: 'basic-8', delay: 6000 },
  { id: 'basic-9', delay: 9000 },
  { id: 'drone-3', delay: 12000 },
];
type EnemySpawnMetadata = {
  stableId: string;
  spawnPhase: string;
  primaryDirection: string;
  assignedDirection: string;
  spawnTile: string;
  active: string;
  spawnReason: string;
  visibility: string;
  recycleCount: string;
};
type ArenaDebugScene = {
  physics: { pause: () => void; resume: () => void };
  cameras: { main: { worldView: { left: number; top: number; right: number; bottom: number } } };
  debugRespawnEnemy: (id: EnemyId) => void;
  debugSetHiddenRecycleEnabled: (enabled: boolean) => void;
  debugDamageEnemy: (id: EnemyId, amount: number) => void;
};

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
  if (path.length === 0) throw new Error('弾薬箱までの経路がありません。');
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
    if (path.length < 2) throw new Error('弾薬箱までの経路がありません。');
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
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.physics[physicsAction]();
  }, action);
}

async function setHiddenRecycle(
  page: import('@playwright/test').Page,
  enabled: boolean,
): Promise<void> {
  await page.evaluate((nextEnabled) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugSetHiddenRecycleEnabled(nextEnabled);
  }, enabled);
}

async function debugDamageEnemy(
  page: import('@playwright/test').Page,
  id: EnemyId,
  amount: number,
): Promise<void> {
  await page.evaluate(({ enemyId, damage }) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugDamageEnemy(enemyId, damage);
  }, { enemyId: id, damage: amount });
}

async function currentViewportTiles(
  page: import('@playwright/test').Page,
): Promise<ReturnType<typeof viewportTileRect>> {
  const worldView = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    const view = scene.cameras.main.worldView;
    return { left: view.left, top: view.top, right: view.right, bottom: view.bottom };
  });
  return viewportTileRect(worldView);
}

async function enemySpawnMetadata(
  page: import('@playwright/test').Page,
  id: EnemyId,
): Promise<EnemySpawnMetadata> {
  return page.getByTestId(`${id}-hp`).evaluate((element) => {
    const dataset = (element as HTMLOutputElement).dataset;
    return {
      stableId: dataset.stableId ?? '',
      spawnPhase: dataset.spawnPhase ?? '',
      primaryDirection: dataset.primaryDirection ?? '',
      assignedDirection: dataset.assignedDirection ?? '',
      spawnTile: dataset.spawnTile ?? '',
      active: dataset.active ?? '',
      spawnReason: dataset.spawnReason ?? '',
      visibility: dataset.visibility ?? '',
      recycleCount: dataset.recycleCount ?? '',
    };
  });
}

async function allEnemySpawnMetadata(
  page: import('@playwright/test').Page,
): Promise<EnemySpawnMetadata[]> {
  return Promise.all(ENEMY_INSTANCE_IDS.map(id => enemySpawnMetadata(page, id)));
}

async function expectEnemyHitPointsAndIds(
  page: import('@playwright/test').Page,
  spawnPhase?: number,
): Promise<void> {
  for (const id of ENEMY_INSTANCE_IDS) {
    const hud = page.getByTestId(`${id}-hp`);
    await expect(hud).toHaveText(id.startsWith('basic-') ? '4' : '2');
    await expect(hud).toHaveAttribute('data-stable-id', id);
    if (spawnPhase !== undefined) {
      const active = await hud.getAttribute('data-active');
      await expect(hud).toHaveAttribute('data-spawn-phase', active === 'true' ? String(spawnPhase) : '');
    }
  }
}

function parseFloorTile(
  map: ReturnType<typeof generateArenaMap>,
  value: string | null,
  label: string,
): TilePosition {
  const match = value?.match(/^(\d+),(\d+)$/);
  if (!match) throw new Error(`${label}のtileが不正です: ${String(value)}`);
  const tile = { x: Number(match[1]), y: Number(match[2]) };
  if (map.tiles[tile.y]?.[tile.x] !== 'floor')
    throw new Error(`${label}のtileがfloorではありません: ${value}`);
  return tile;
}

function directionFromPlayer(player: TilePosition, spawn: TilePosition): SpawnDirection {
  const dx = spawn.x - player.x;
  const dy = spawn.y - player.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

async function expectStrictEnemySpawns(
  page: import('@playwright/test').Page,
  ids: readonly EnemyId[],
  reason: 'initial' | 'stagger',
): Promise<void> {
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const player = parseFloorTile(map, await page.getByTestId('player-tile').textContent(), 'プレイヤー');
  const viewport = await currentViewportTiles(page);
  const phase = Number(await page.getByTestId('spawn-phase').getAttribute('data-phase'));
  const primary = primarySpawnDirection(mapSeed, phase);
  for (const id of ids) {
    const metadata = await enemySpawnMetadata(page, id);
    const stableSlot = ENEMY_INSTANCE_IDS.indexOf(id);
    expect(metadata.active, `${id}がactiveであること`).toBe('true');
    expect(metadata.spawnReason).toBe(reason);
    expect(metadata.spawnPhase).toBe(String(phase));
    expect(metadata.primaryDirection).toBe(primary);
    expect(metadata.assignedDirection).toBe(spawnDirectionForSlot(primary, stableSlot));
    expect(metadata.visibility).toBe('hidden');
    const spawnTile = parseFloorTile(map, metadata.spawnTile, `${id}の出現位置`);
    expect(directionFromPlayer(player, spawnTile)).toBe(metadata.assignedDirection);
    expect(enemyVisibility(map, player, spawnTile)).toBe('hidden');
    expect(
      spawnTile.x < viewport.left
      || spawnTile.x > viewport.right
      || spawnTile.y < viewport.top
      || spawnTile.y > viewport.bottom,
      `${id}のspawn ${metadata.spawnTile}がviewport ${JSON.stringify(viewport)} の外であること`,
    ).toBe(true);
  }
}

async function expectCurrentEnemyPresentations(
  page: import('@playwright/test').Page,
): Promise<void> {
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const player = parseFloorTile(map, await page.getByTestId('player-tile').textContent(), 'プレイヤー');
  for (const id of ENEMY_INSTANCE_IDS) {
    const hud = page.getByTestId(`${id}-hp`);
    if (await hud.getAttribute('data-active') !== 'true') {
      await expect(hud).toHaveAttribute('data-visibility', 'hidden');
      continue;
    }
    const spawnTile = parseFloorTile(map, await hud.getAttribute('data-spawn-tile'), `${id}の出現位置`);
    await expectEnemyPresentation(page, id, enemyVisibility(map, player, spawnTile));
  }
}

async function expectEnemyPresentation(
  page: import('@playwright/test').Page,
  id: EnemyId,
  presentation: EnemyPresentation,
): Promise<void> {
  const hud = page.getByTestId(`${id}-hp`);
  const texture = id.startsWith('drone-') ? 'drone' : 'basic';
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
  await setArenaPhysics(page, 'pause');
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
  const hpBar = page.getByTestId('hp-bar');
  await expect(hpBar).toHaveAttribute('max', '100');
  await expect.poll(async () => hpBar.evaluate(element => (element as HTMLProgressElement).value)).toBe(100);
  await expect(page.getByTestId('survival-time')).toHaveText(/^\d\d:\d\d$/);
  await expect(page.getByTestId('map-seed')).toHaveText('15');
  await expect(page.getByTestId('player-tile')).toHaveText(/\d+,\d+/);
  const playerTileHud = page.getByTestId('player-tile');
  await expect(playerTileHud).toHaveAttribute('data-visibility-mask-alpha', '0.25');
  const initialObscuredTileCount = Number(await playerTileHud.getAttribute('data-obscured-tile-count'));
  expect(initialObscuredTileCount).toBe(803);
  const initialVisibilityPlayerTile = await playerTileHud.getAttribute('data-visibility-player-tile');
  expect(initialVisibilityPlayerTile).toMatch(/^\d+,\d+$/);
  await expectEnemyHitPointsAndIds(page, 0);
  for (const { id } of STAGGERED_ENEMIES) {
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-spawn-reason', 'stagger');
  }
  await expectCurrentEnemyPresentations(page);
  await setArenaPhysics(page, 'resume');
  await expect(page.getByTestId('affinity')).toContainText('ライフル1発で撃破可能');
  const bounds = await page.locator('#game canvas').boundingBox();
  if (!bounds) throw new Error('戦闘アリーナのcanvasが見つかりません。');

  const timeBounds = await page.locator('#survival-panel').boundingBox();
  const hpBounds = await page.locator('#hp-panel').boundingBox();
  const panelBounds = await ammoPanel.boundingBox();
  if (!timeBounds || !hpBounds || !panelBounds) throw new Error('Canvas overlayの表示範囲を取得できません。');
  expect(Math.abs(timeBounds.x + timeBounds.width / 2 - (bounds.x + bounds.width / 2))).toBeLessThan(3);
  expect(timeBounds.y).toBeLessThan(bounds.y + 32);
  expect(hpBounds.x).toBeLessThan(bounds.x + 32);
  expect(hpBounds.y + hpBounds.height).toBeGreaterThan(bounds.y + bounds.height - 32);
  expect(panelBounds.x + panelBounds.width).toBeGreaterThan(bounds.x + bounds.width - 32);
  expect(panelBounds.y + panelBounds.height).toBeGreaterThan(bounds.y + bounds.height - 32);
  await expect.poll(async () => page.locator('#survival-panel').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  await expect.poll(async () => page.locator('#hp-panel').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  await expect.poll(async () => ammoPanel.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');

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

  await expect(page.getByTestId('ammo-box-count')).toHaveText('3');
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-active-tiles', waitingBoxKeys ?? '');
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', firstBoxKey);
  await expect(page.getByTestId('ammo-reserve')).toHaveAttribute('data-reserve', '60');

  await setArenaPhysics(page, 'pause');
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
  await setArenaPhysics(page, 'resume');

  await expect(page.getByTestId('defeat')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('hp')).toHaveText('0');
  await expect.poll(async () => hpBar.evaluate(element => (element as HTMLProgressElement).value)).toBe(0);
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', '');
  await page.getByTestId('retry').click();
  await setArenaPhysics(page, 'pause');
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
  await expect.poll(async () => hpBar.evaluate(element => (element as HTMLProgressElement).value)).toBe(100);
  await expectEnemyHitPointsAndIds(page, 0);
  await expect(page.getByTestId('feedback')).toHaveText('-');
  const retryPlayerTile = '23,5';
  await expect(page.getByTestId('map-seed')).toHaveText('1038872098');
  await expect(playerTileHud).toHaveText(retryPlayerTile);
  await expect(playerTileHud).toHaveAttribute('data-visibility-mask-alpha', '0.25');
  expect(Number(await playerTileHud.getAttribute('data-obscured-tile-count'))).toBe(920);
  await expect(playerTileHud).toHaveAttribute('data-visibility-player-tile', retryPlayerTile);
  await expectCurrentEnemyPresentations(page);
  expect(errors).toEqual([]);
});

test('初期8体を段階的に12体へ増やし、phase境界後のDEV再出現だけを新phaseへ反映する', async ({ page }) => {
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto('/');
  await setHiddenRecycle(page, false);
  await setArenaPhysics(page, 'pause');
  const phaseHud = page.getByTestId('spawn-phase');
  const primaryHud = page.getByTestId('primary-direction');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const phaseZeroPrimary = primarySpawnDirection(mapSeed, 0);
  await expect(phaseHud).toHaveText('1');
  await expect(phaseHud).toHaveAttribute('data-phase', '0');
  await expect(primaryHud).toHaveAttribute('data-direction', phaseZeroPrimary);
  await expectEnemyHitPointsAndIds(page, 0);
  await expectStrictEnemySpawns(page, INITIAL_ACTIVE_IDS, 'initial');
  for (const { id } of STAGGERED_ENEMIES)
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'false');

  let elapsed = 0;
  for (const { id, delay } of STAGGERED_ENEMIES) {
    await page.clock.runFor(delay + 100 - elapsed);
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-spawn-reason', 'stagger');
    elapsed = delay + 100;
  }
  await expectStrictEnemySpawns(page, STAGGERED_ENEMIES.map(({ id }) => id), 'stagger');
  const phaseZero = await allEnemySpawnMetadata(page);
  const phaseZeroMap = generateArenaMap(mapSeed);
  const phaseZeroPlayer = parseFloorTile(
    phaseZeroMap,
    await page.getByTestId('player-tile').textContent(),
    'プレイヤー',
  );
  expect(new Set(phaseZero.map(metadata => metadata.stableId))).toEqual(new Set(ENEMY_INSTANCE_IDS));
  expect(new Set(phaseZero.map(metadata => metadata.spawnTile)).size).toBe(12);
  phaseZero.forEach((metadata, stableSlot) => {
    expect(metadata.spawnPhase).toBe('0');
    expect(metadata.primaryDirection).toBe(phaseZeroPrimary);
    expect(metadata.assignedDirection).toBe(spawnDirectionForSlot(phaseZeroPrimary, stableSlot));
    const spawnTile = parseFloorTile(phaseZeroMap, metadata.spawnTile, `${metadata.stableId}の出現位置`);
    expect(directionFromPlayer(phaseZeroPlayer, spawnTile)).toBe(metadata.assignedDirection);
  });

  await page.clock.fastForward(SPAWN_PHASE_MS - elapsed);
  const phaseOnePrimary = primarySpawnDirection(mapSeed, 1);
  await expect(phaseHud).toHaveText('2');
  await expect(phaseHud).toHaveAttribute('data-phase', '1');
  await expect(primaryHud).toHaveAttribute('data-direction', phaseOnePrimary);
  expect(phaseOnePrimary).not.toBe(phaseZeroPrimary);
  expect(await allEnemySpawnMetadata(page)).toEqual(phaseZero);

  const target = ENEMY_INSTANCE_IDS[3];
  await page.evaluate((enemyId) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugRespawnEnemy(enemyId);
  }, target);
  const phaseOne = await allEnemySpawnMetadata(page);
  const targetSlot = ENEMY_INSTANCE_IDS.indexOf(target);
  phaseOne.forEach((metadata, stableSlot) => {
    if (stableSlot === targetSlot) return;
    expect(metadata).toEqual(phaseZero[stableSlot]);
  });
  const respawned = phaseOne[targetSlot];
  expect(respawned.stableId).toBe(target);
  expect(respawned.spawnPhase).toBe('1');
  expect(respawned.primaryDirection).toBe(phaseOnePrimary);
  expect(respawned.assignedDirection).toBe(spawnDirectionForSlot(phaseOnePrimary, targetSlot));
  expect(respawned.active).toBe('true');
  expect(respawned.spawnReason).toBe('debug');
  expect(respawned.visibility).toBe('hidden');
  const respawnedTile = parseFloorTile(phaseZeroMap, respawned.spawnTile, `${respawned.stableId}の再出現位置`);
  expect(directionFromPlayer(phaseZeroPlayer, respawnedTile)).toBe(respawned.assignedDirection);
  expect(respawned.spawnTile).not.toBe(phaseZero[targetSlot].spawnTile);
  expect(new Set(phaseOne.map(metadata => metadata.spawnTile)).size).toBe(12);

  await page.getByTestId('retry').dispatchEvent('click');
  await expect(phaseHud).toHaveText('1');
  await expect(phaseHud).toHaveAttribute('data-phase', '0');
  await expectEnemyHitPointsAndIds(page, 0);
  for (const id of INITIAL_ACTIVE_IDS)
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'true');
  for (const { id } of STAGGERED_ENEMIES)
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'false');
});

test('hidden recycleはHPを維持し、deathだけ全回復し、retry後に旧callbackを残さない', async ({ page }) => {
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto('/');
  await setArenaPhysics(page, 'pause');
  await expectStrictEnemySpawns(page, INITIAL_ACTIVE_IDS, 'initial');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const player = parseFloorTile(map, await page.getByTestId('player-tile').textContent(), 'プレイヤー');
  const eligibleBasics = (await Promise.all(INITIAL_ACTIVE_IDS
    .filter(id => id.startsWith('basic-'))
    .map(async (id) => {
      const metadata = await enemySpawnMetadata(page, id);
      const spawnTile = parseFloorTile(map, metadata.spawnTile, `${id}の初期spawn`);
      return {
        id,
        distance: findPath(map, spawnTile, player).length - 1,
        threshold: hiddenRecycleThresholdFor(id, 0, mapSeed),
      };
    })))
    .filter(candidate => candidate.distance >= 10)
    .sort((left, right) => left.threshold - right.threshold || left.id.localeCompare(right.id));
  const target = eligibleBasics[0];
  if (!target) throw new Error('path距離10 edge以上の初期基本敵が必要です。');

  await debugDamageEnemy(page, target.id, 1);
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveText('3');
  await page.clock.runFor(target.threshold + 100);
  const recycling = await enemySpawnMetadata(page, target.id);
  expect(recycling.recycleCount).toBe('1');
  expect(recycling.active).toBe('false');
  expect(recycling.spawnReason).toBe('recycle');
  const pendingRecycles = (await allEnemySpawnMetadata(page))
    .filter(metadata => metadata.active === 'false' && metadata.spawnReason === 'recycle');
  expect(pendingRecycles.map(metadata => metadata.stableId)).toEqual([target.id]);

  await page.clock.runFor(recycleDelayFor(target.id, 1, mapSeed) + 100);
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveAttribute('data-spawn-reason', 'recycle');
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveText('3');

  await debugDamageEnemy(page, target.id, 3);
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveAttribute('data-active', 'false');
  await page.clock.runFor(respawnDelayFor('basic', target.id, 1, mapSeed) + 100);
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveAttribute('data-spawn-reason', 'death');
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveText('4');

  const otherInitialBasic = (await Promise.all(INITIAL_ACTIVE_IDS
    .filter(id => id.startsWith('basic-') && id !== target.id)
    .map(async id => ({ id, metadata: await enemySpawnMetadata(page, id) }))))
    .find(candidate => candidate.metadata.active === 'true');
  if (!otherInitialBasic) throw new Error('旧callback検査用のactive基本敵が必要です。');
  await debugDamageEnemy(page, otherInitialBasic.id, 4);
  await expect(page.getByTestId(`${otherInitialBasic.id}-hp`)).toHaveAttribute('data-spawn-reason', 'death');
  const oldDeathDelay = respawnDelayFor('basic', otherInitialBasic.id, 1, mapSeed);
  await page.getByTestId('retry').dispatchEvent('click');
  await setHiddenRecycle(page, false);
  await setArenaPhysics(page, 'pause');
  await page.clock.runFor(oldDeathDelay + 100);
  await expect(page.getByTestId(`${otherInitialBasic.id}-hp`)).toHaveText('4');
  await expect(page.getByTestId(`${otherInitialBasic.id}-hp`)).toHaveAttribute('data-spawn-reason', 'initial');
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
