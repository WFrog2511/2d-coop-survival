import { expect, test } from '@playwright/test';
import { SPAWN_PHASE_MS, enemyVisibility, findPath, generateArenaMap, hasLineOfSight, hiddenRecycleThresholdFor, primarySpawnDirection, recycleDelayFor, respawnDelayFor, selectAmmoBoxTiles, spawnDirectionForSlot, type SpawnDirection, type TilePosition, viewportTileRect } from '../src/arena-map';
import { AMMO_BOX_RESPAWN_MS, COMBAT_WAVE_DURATION_MS, ENEMY_INSTANCE_IDS, REST_DURATION_MS } from '../src/rules';

type EnemyId = (typeof ENEMY_INSTANCE_IDS)[number];
type EnemyPresentation = 'normal' | 'boundary' | 'hidden';
const INITIAL_ACTIVE_IDS: readonly EnemyId[] = ['basic-1', 'basic-2', 'basic-3', 'basic-4', 'basic-5', 'basic-6', 'drone-1', 'drone-2'];
const STAGGERED_ENEMIES: readonly { id: EnemyId; delay: number }[] = [
  { id: 'basic-7', delay: 3000 },
  { id: 'basic-8', delay: 6000 },
  { id: 'basic-9', delay: 9000 },
  { id: 'drone-3', delay: 12000 },
];
const ENEMY_SPAWN_ORDER: readonly EnemyId[] = [
  ...INITIAL_ACTIVE_IDS,
  ...STAGGERED_ENEMIES.map(({ id }) => id),
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
  debugSetPlayerInvulnerable: (enabled: boolean) => void;
  debugMovePlayerTo: (tile: TilePosition) => void;
  debugDamageEnemy: (id: EnemyId, amount: number) => void;
};

function devStartUrl(path: string): string {
  return path + (path.includes('?') ? '&' : '?') + 'start=dev';
}

async function currentAmmo(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('ammo').textContent();
  return Number(text?.split('/')[0]);
}

async function documentBounds(locator: import('@playwright/test').Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.x + window.scrollX,
      y: bounds.y + window.scrollY,
      width: bounds.width,
      height: bounds.height,
    };
  });
}

async function expectAmmoBoxCount(
  boxCount: import('@playwright/test').Locator,
  expected: number,
): Promise<void> {
  await expect.poll(async () => boxCount.evaluate(element => (element as HTMLOutputElement).value)).toBe(String(expected));
}

async function expectOutputValue(
  output: import('@playwright/test').Locator,
  expected: string,
): Promise<void> {
  await expect.poll(async () => output.evaluate(element => (element as HTMLOutputElement).value)).toBe(expected);
}

function tileKeysFromAttribute(value: string | null): string[] {
  return value ? value.split('|').filter(key => key.length > 0) : [];
}

function expectedObscuredTileCount(
  map: ReturnType<typeof generateArenaMap>,
  player: TilePosition,
): number {
  let count = 0;
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1)
      if (!hasLineOfSight(map, player, { x, y })) count += 1;
  return count;
}

async function moveToTile(
  page: import('@playwright/test').Page,
  map: ReturnType<typeof generateArenaMap>,
  target: TilePosition,
  playerTileHud: import('@playwright/test').Locator,
): Promise<void> {
  for (let step = 0; step < 300; step += 1) {
    const currentText = await playerTileHud.textContent();
    const currentParts = currentText?.split(',').map(Number) ?? [];
    const current = { x: Number(currentParts[0]), y: Number(currentParts[1]) };
    if (current.x === target.x && current.y === target.y) return;
    const path = findPath(map, current, target);
    if (path.length < 2) throw new Error('弾薬箱までの経路がありません。');
    const next = path[1];
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const key = dx > 0 ? 'd' : dx < 0 ? 'a' : dy > 0 ? 's' : 'w';
    await page.keyboard.down(key);
    try {
      await expect(playerTileHud).not.toHaveText(current.x + ',' + current.y, { timeout: 2_000 });
    } finally {
      await page.keyboard.up(key);
    }
  }
  throw new Error('弾薬箱までの移動が上限を超えました。');
}

async function collectAmmoBoxWithClock(
  page: import('@playwright/test').Page,
  target: TilePosition,
  boxCount: import('@playwright/test').Locator,
): Promise<void> {
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, target);
  await page.keyboard.press('e');
  await page.clock.runFor(100);
  await expect(boxCount).toHaveText('3', { timeout: 2_000 });
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

async function setPlayerInvulnerable(
  page: import('@playwright/test').Page,
  enabled: boolean,
): Promise<void> {
  await page.evaluate((nextEnabled) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugSetPlayerInvulnerable(nextEnabled);
  }, enabled);
}

async function aimPlayer(
  page: import('@playwright/test').Page,
  direction: TilePosition,
): Promise<void> {
  const canvas = await page.locator('#game canvas').boundingBox();
  if (!canvas) throw new Error('ゲームcanvasの位置を取得できません。');
  const view = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene & { player: { x: number; y: number } } }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    const worldView = scene.cameras.main.worldView;
    return { player: scene.player, left: worldView.left, top: worldView.top, right: worldView.right, bottom: worldView.bottom };
  });
  const targetX = view.player.x + direction.x * 100;
  const targetY = view.player.y + direction.y * 100;
  const normalizedX = Math.min(0.95, Math.max(0.05, (targetX - view.left) / (view.right - view.left)));
  const normalizedY = Math.min(0.95, Math.max(0.05, (targetY - view.top) / (view.bottom - view.top)));
  await page.mouse.move(canvas.x + canvas.width * normalizedX, canvas.y + canvas.height * normalizedY);
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

function findDashLane(map: ReturnType<typeof generateArenaMap>): {
  origin: TilePosition;
  direction: TilePosition;
} {
  const directions: readonly TilePosition[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (map.tiles[y][x] !== 'floor') continue;
      for (const direction of directions) {
        const hasFloorLane = [1, 2, 3, 4].every((step) => {
          const nextX = x + direction.x * step;
          const nextY = y + direction.y * step;
          const perpendicular = { x: -direction.y, y: direction.x };
          return [-1, 0, 1].every(offset =>
            map.tiles[nextY + perpendicular.y * offset]?.[nextX + perpendicular.x * offset] === 'floor',
          );
        });
        if (hasFloorLane)
          return { origin: { x, y }, direction };
      }
    }
  }
  throw new Error('回避検証用の4タイル直線が見つかりません。');
}

function playerTile(value: string | null): TilePosition {
  const match = value?.match(/^(\d+),(\d+)$/);
  if (!match) throw new Error(`プレイヤーtileが不正です: ${String(value)}`);
  return { x: Number(match[1]), y: Number(match[2]) };
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

test('役職を選択してから開始し、選択値をHUDへ表示する', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('start-gate')).toBeVisible();
  await expect(page.locator('#game canvas')).toHaveCount(0);
  await expect(page.getByTestId('role-options').locator('input')).toHaveCount(5);
  await expect(page.getByTestId('start')).toBeDisabled();

  await page.getByTestId('role-sniper').focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('role-sniper')).toBeChecked();
  await expect(page.getByTestId('start')).toBeEnabled();
  await page.getByTestId('start').focus();
  await page.keyboard.press('Space');

  await expect(page.getByTestId('start-gate')).toBeHidden();
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.getByTestId('role')).toHaveText('スナイパー（紫）');
  await expect(page.getByTestId('role')).toHaveAttribute('data-role', 'sniper');
});

test('SpaceとShiftで照準方向へ回避し、クールダウン中は再発動しない', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(devStartUrl('/'));
  await expect(page.locator('#game canvas')).toBeVisible();
  await setPlayerInvulnerable(page, true);
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const lane = findDashLane(generateArenaMap(mapSeed));
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, lane.origin);
  await page.waitForTimeout(300);
  await aimPlayer(page, lane.direction);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const afterSpace = playerTile(await page.getByTestId('player-tile').textContent());
  expect(afterSpace).toEqual({
    x: lane.origin.x + lane.direction.x * 2,
    y: lane.origin.y + lane.direction.y * 2,
  });
  await page.keyboard.press('Shift');
  await page.waitForTimeout(300);
  expect(playerTile(await page.getByTestId('player-tile').textContent())).toEqual(afterSpace);
  await page.waitForTimeout(1_800);
  await aimPlayer(page, lane.direction);
  await page.keyboard.press('Shift');
  await page.waitForTimeout(300);
  expect(playerTile(await page.getByTestId('player-tile').textContent())).toEqual({
    x: lane.origin.x + lane.direction.x * 4,
    y: lane.origin.y + lane.direction.y * 4,
  });
});

test('自動射撃、ショットガンの発射待ち、リロード、視界遮蔽と再挑戦を確認できる', async ({ page }) => {
  // 80×50マップのLOS検査を含む代表経路に、実時間の余裕を持たせる。
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(devStartUrl('/'));
  const gameCanvas = page.locator('#game canvas');
  await expect(gameCanvas).toBeVisible();
  // 初期spawn metadataと可視状態を同じ時点で観測するため、敵移動前に止める。
  await setArenaPhysics(page, 'pause');
  const initialCanvasBounds = await gameCanvas.boundingBox();
  if (!initialCanvasBounds) throw new Error('初期化後の戦闘アリーナcanvasが見つかりません。');
  expect(initialCanvasBounds.width).toBe(800);
  expect(initialCanvasBounds.height).toBe(500);
  const initialCanvasDocumentBounds = await documentBounds(gameCanvas);
  const canvasPrecedesGameText = await page.evaluate(() => {
    const shell = document.querySelector('#game-shell');
    const controls = Array.from(document.querySelectorAll('header p'))
      .find(element => element.textContent?.includes('移動:'));
    const hud = document.querySelector('[data-testid="hud"]');
    const enemyHud = document.querySelector('[data-testid="enemy-hud"]');
    if (!shell || !controls || !hud || !enemyHud) throw new Error('ゲーム表示と操作・HUDテキストが必要です。');
    return [controls, hud, enemyHud].every(element =>
      Boolean(shell.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(canvasPrecedesGameText).toBe(true);
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
  const survivalPanel = page.locator('#survival-panel');
  await expect(survivalPanel.getByTestId('wave')).toHaveText('1');
  await expect(survivalPanel.getByTestId('run-phase')).toHaveText('夜（戦闘）');
  await expect(survivalPanel.getByTestId('phase-remaining')).toHaveText(/^02:(?:[0-2]\d|30)$/);
  await expect(page.getByTestId('survival-time')).toBeHidden();
  await expect(page.getByTestId('enemy-current')).toBeHidden();
  await expect(page.getByTestId('enemy-goal')).toBeHidden();
  await expect(page.getByTestId('enemy-remaining')).toBeHidden();
  await expect(page.getByTestId('map-seed')).toHaveText('15');
  await expect(page.getByTestId('player-tile')).toHaveText(/\d+,\d+/);
  const map = generateArenaMap(Number(await page.getByTestId('map-seed').textContent()));
  const playerTileHud = page.getByTestId('player-tile');
  const initialPlayerTile = parseFloorTile(map, await playerTileHud.textContent(), 'プレイヤー');
  await expect(playerTileHud).toHaveAttribute('data-visibility-mask-alpha', '0.25');
  const initialObscuredTileCount = Number(await playerTileHud.getAttribute('data-obscured-tile-count'));
  expect(initialObscuredTileCount).toBe(expectedObscuredTileCount(map, initialPlayerTile));
  const initialVisibilityPlayerTile = await playerTileHud.getAttribute('data-visibility-player-tile');
  expect(initialVisibilityPlayerTile).toMatch(/^\d+,\d+$/);
  await expectEnemyHitPointsAndIds(page, 0);
  for (const { id } of STAGGERED_ENEMIES) {
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-spawn-reason', 'stagger');
  }
  await expectCurrentEnemyPresentations(page);
  await setArenaPhysics(page, 'resume');
  await expect(page.getByTestId('affinity')).toContainText('ライフル1発で撃破可能');
  const bounds = await gameCanvas.boundingBox();
  if (!bounds) throw new Error('戦闘アリーナのcanvasが見つかりません。');
  expect(bounds).toEqual(initialCanvasBounds);

  const timeBounds = await survivalPanel.boundingBox();
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
  const movedPlayerTile = parseFloorTile(map, await playerTileHud.textContent(), '移動後プレイヤー');
  const movedObscuredTileCount = Number(await playerTileHud.getAttribute('data-obscured-tile-count'));
  expect(movedObscuredTileCount).toBe(expectedObscuredTileCount(map, movedPlayerTile));
  expect(movedObscuredTileCount).not.toBe(initialObscuredTileCount);

  await page.mouse.move(bounds.x + (bounds.width * 90) / 800, bounds.y + (bounds.height * 90) / 500);
  await page.mouse.down();
  await page.waitForTimeout(380);
  await page.mouse.up();
  expect(await currentAmmo(page)).toBeLessThanOrEqual(18);
  const boxTiles = selectAmmoBoxTiles(map);
  expect(boxTiles).toHaveLength(4);
  const currentPlayerTile = parseFloorTile(map, await playerTileHud.textContent(), 'プレイヤー');
  const firstBox = [...boxTiles].sort((left, right) => {
    const distance = findPath(map, currentPlayerTile, left).length - findPath(map, currentPlayerTile, right).length;
    return distance || left.y - right.y || left.x - right.x;
  })[0];
  const firstBoxKey = firstBox.x + ',' + firstBox.y;
  const initialBoxKeys = await page.getByTestId('ammo-box-count').getAttribute('data-active-tiles');
  expect(tileKeysFromAttribute(initialBoxKeys)).toContain(firstBoxKey);
  await moveToTile(page, map, firstBox, playerTileHud);
  await expect(page.getByTestId('ammo-box-count')).toHaveText('4');
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  await page.keyboard.press('e');
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
  await expect(page.getByTestId('wave')).toHaveAttribute('data-state', 'defeat');
  await expect(page.getByTestId('hp')).toHaveText('0');
  await expect.poll(async () => hpBar.evaluate(element => (element as HTMLProgressElement).value)).toBe(0);
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', '');
  expect(await documentBounds(gameCanvas)).toEqual(initialCanvasDocumentBounds);
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText('02:30');
  await expect(page.getByTestId('run-panel')).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('run-phase')).toHaveText('夜（戦闘）');
  await expect(page.getByTestId('phase-remaining')).toHaveText('02:30');
  await setArenaPhysics(page, 'pause');
  await expect(page.getByTestId('defeat')).toBeHidden();
  await expect(page.getByTestId('victory')).toBeHidden();
  await expect(page.getByTestId('survival-time')).toHaveText('09:30');
  await expect(page.getByTestId('weapon')).toHaveText('アサルトライフル');
  await expect(page.getByTestId('ammo')).toHaveText('20/20');
  await expect(page.getByTestId('ammo-reserve')).toHaveText('予備 40/60');
  await expect(page.getByTestId('ammo-box-count')).toHaveText('4');
  await expect(page.getByTestId('reload')).toHaveText('待機');
  await expect(reloadProgress).toBeHidden();
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect.poll(async () => hpBar.evaluate(element => (element as HTMLProgressElement).value)).toBe(100);
  await expectEnemyHitPointsAndIds(page, 0);
  await expectStrictEnemySpawns(page, INITIAL_ACTIVE_IDS, 'initial');
  // strict確認後は経過時間に依存しないactive実数だけをHUDと照合する。
  await expect.poll(async () => {
    const activeEnemyCount = (await allEnemySpawnMetadata(page))
      .filter(({ active }) => active === 'true').length;
    return activeEnemyCount >= INITIAL_ACTIVE_IDS.length
      && await page.getByTestId('enemy-current').textContent() === String(activeEnemyCount)
      && await page.getByTestId('enemy-remaining').textContent() === String(activeEnemyCount);
  }).toBe(true);
  await expect(page.getByTestId('enemy-goal')).toHaveText(String(ENEMY_INSTANCE_IDS.length));
  await expect(page.getByTestId('kills')).toHaveText('0');
  await expect(page.getByTestId('feedback')).toHaveText('-');
  const retryMap = generateArenaMap(1_038_872_098);
  const retryPlayerTile = `${retryMap.start.x},${retryMap.start.y}`;
  await expect(page.getByTestId('map-seed')).toHaveText('1038872098');
  await expect(playerTileHud).toHaveText(retryPlayerTile);
  await expect(playerTileHud).toHaveAttribute('data-visibility-mask-alpha', '0.25');
  const retryObscuredTileCount = Number(await playerTileHud.getAttribute('data-obscured-tile-count'));
  expect(retryObscuredTileCount).toBe(expectedObscuredTileCount(retryMap, retryMap.start));
  await expect(playerTileHud).toHaveAttribute('data-visibility-player-tile', retryPlayerTile);
  await expectCurrentEnemyPresentations(page);
  expect(await documentBounds(gameCanvas)).toEqual(initialCanvasDocumentBounds);
  expect(errors).toEqual([]);
});

test('初期8体を段階的に12体へ増やし、spawn phaseとcombat/rest境界を分離する', async ({ page }) => {
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl('/'));
  await setHiddenRecycle(page, false);
  await setArenaPhysics(page, 'pause');
  const phaseHud = page.getByTestId('spawn-phase');
  const primaryHud = page.getByTestId('primary-direction');
  const runPanel = page.getByTestId('run-panel');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const phaseZeroPrimary = primarySpawnDirection(mapSeed, 0);
  await expect(phaseHud).toHaveText('1');
  await expect(phaseHud).toHaveAttribute('data-phase', '0');
  await expect(primaryHud).toHaveAttribute('data-direction', phaseZeroPrimary);
  await expectEnemyHitPointsAndIds(page, 0);
  await expectStrictEnemySpawns(page, INITIAL_ACTIVE_IDS, 'initial');
  for (const { id } of STAGGERED_ENEMIES)
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'false');
  // 固定seedでinitial strict spawnが成功したことを確認してからHUDを比較する。
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText('02:30');
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('run-phase')).toHaveText('夜（戦闘）');
  await expect(page.getByTestId('phase-remaining')).toHaveText('02:30');
  await expect(page.getByTestId('enemy-current')).toHaveText(String(INITIAL_ACTIVE_IDS.length));
  await expect(page.getByTestId('enemy-goal')).toHaveText(String(ENEMY_INSTANCE_IDS.length));
  await expect(page.getByTestId('enemy-remaining')).toHaveText(String(INITIAL_ACTIVE_IDS.length));
  await expect(page.getByTestId('kills')).toHaveText('0');

  let elapsed = 0;
  for (const [index, { id, delay }] of STAGGERED_ENEMIES.entries()) {
    await page.clock.runFor(delay + 100 - elapsed);
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-spawn-reason', 'stagger');
    const expectedActiveCount = INITIAL_ACTIVE_IDS.length + index + 1;
    await expect(page.getByTestId('enemy-current')).toHaveText(String(expectedActiveCount));
    await expect(page.getByTestId('enemy-remaining')).toHaveText(String(expectedActiveCount));
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
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText('01:30');
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('phase-remaining')).toHaveText('01:30');
  await expect(page.getByTestId('enemy-current')).toHaveText('12');
  await expect(page.getByTestId('enemy-remaining')).toHaveText('12');
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

  const hitPointsBeforeRest = await Promise.all(ENEMY_INSTANCE_IDS.map(async id => ({
    id,
    hp: await page.getByTestId(`${id}-hp`).textContent(),
  })));
  await page.clock.fastForward(SPAWN_PHASE_MS);
  const phaseTwoPrimary = primarySpawnDirection(mapSeed, 2);
  await expect(phaseHud).toHaveText('3');
  await expect(phaseHud).toHaveAttribute('data-phase', '2');
  await expect(primaryHud).toHaveAttribute('data-direction', phaseTwoPrimary);
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText('00:30');
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('phase-remaining')).toHaveText('00:30');
  expect(await allEnemySpawnMetadata(page)).toEqual(phaseOne);
  for (const { id, hp } of hitPointsBeforeRest)
    await expect(page.getByTestId(`${id}-hp`)).toHaveText(hp ?? '');

  const combatPanelBackground = await runPanel.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.clock.fastForward(COMBAT_WAVE_DURATION_MS - SPAWN_PHASE_MS * 2);
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText('00:00');
  await expect(runPanel).toHaveAttribute('data-phase', 'rest');
  await expect(page.getByTestId('run-phase')).toHaveText('昼（休憩）');
  await expect(page.getByTestId('phase-remaining')).toHaveText('01:00');
  expect(await runPanel.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(combatPanelBackground);
  expect(await allEnemySpawnMetadata(page)).toEqual(phaseOne);
  for (const { id, hp } of hitPointsBeforeRest)
    await expect(page.getByTestId(`${id}-hp`)).toHaveText(hp ?? '');

  await page.clock.fastForward(REST_DURATION_MS);
  await expect(page.getByTestId('wave')).toHaveText('2');
  await expect(page.getByTestId('wave-remaining')).toHaveText('02:30');
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('run-phase')).toHaveText('夜（戦闘）');
  await expect(page.getByTestId('phase-remaining')).toHaveText('02:30');
  expect(await allEnemySpawnMetadata(page)).toEqual(phaseOne);

  await page.getByTestId('retry').dispatchEvent('click');
  await expect(phaseHud).toHaveText('1');
  await expect(phaseHud).toHaveAttribute('data-phase', '0');
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText('02:30');
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('run-phase')).toHaveText('夜（戦闘）');
  await expect(page.getByTestId('phase-remaining')).toHaveText('02:30');
  await expectEnemyHitPointsAndIds(page, 0);
  for (const id of INITIAL_ACTIVE_IDS)
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'true');
  for (const { id } of STAGGERED_ENEMIES)
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'false');
  // retry後も固定seedでinitial strict spawn成功を確認してから実数を比較する。
  await expect(page.getByTestId('enemy-current')).toHaveText(String(INITIAL_ACTIVE_IDS.length));
  await expect(page.getByTestId('enemy-remaining')).toHaveText(String(INITIAL_ACTIVE_IDS.length));
  await expect(page.getByTestId('kills')).toHaveText('0');
});

test('DEV queryでspawnとcombat/rest scheduleを開始前に固定する', async ({ page }) => {
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl('/?enemyInitialCount=1&enemyStaggerIntervalMs=500&enemySpawnCandidatePool=1&combatWaveDurationMs=1000&restDurationMs=500'));
  await setHiddenRecycle(page, false);
  await setArenaPhysics(page, 'pause');
  const phaseHud = page.getByTestId('spawn-phase');
  await expect(phaseHud).toHaveAttribute(
    'data-spawn-config',
    'enemyInitialCount=1;enemyStaggerIntervalMs=500;enemySpawnCandidatePool=1',
  );
  const runPanel = page.getByTestId('run-panel');
  await expect(runPanel).toHaveAttribute(
    'data-run-config',
    'combatWaveDurationMs=1000;restDurationMs=500',
  );
  await expect(page.getByTestId('survival-time')).toHaveText('00:04');
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText('00:01');
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('run-phase')).toHaveText('夜（戦闘）');
  await expect(page.getByTestId('phase-remaining')).toHaveText('00:01');
  await expect(page.getByTestId(`${ENEMY_SPAWN_ORDER[0]}-hp`)).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId(`${ENEMY_SPAWN_ORDER[0]}-hp`)).toHaveAttribute('data-spawn-reason', 'initial');
  for (const id of ENEMY_SPAWN_ORDER.slice(1)) {
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-spawn-reason', 'stagger');
  }

  await page.clock.runFor(600);
  await expect(page.getByTestId(`${ENEMY_SPAWN_ORDER[1]}-hp`)).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId(`${ENEMY_SPAWN_ORDER[1]}-hp`)).toHaveAttribute('data-spawn-reason', 'stagger');
  // frame更新の端数を越えてrestへ入り、境界ちょうどの表示競合を避ける。
  await page.clock.runFor(500);
  await expect(runPanel).toHaveAttribute('data-phase', 'rest');
  await expect(page.getByTestId('run-phase')).toHaveText('昼（休憩）');
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText('00:00');
  await expect(page.getByTestId('phase-remaining')).toHaveText('00:01');
  await page.clock.runFor(500);
  await expect(page.getByTestId('wave')).toHaveText('2');
  await expect(page.getByTestId('wave-remaining')).toHaveText('00:01');
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
});

test('不正なDEV spawnとschedule queryは既定値へ戻す', async ({ page }) => {
  await page.goto(devStartUrl('/?enemyInitialCount=13&enemyStaggerIntervalMs=0&enemySpawnCandidatePool=4001&combatWaveDurationMs=999&restDurationMs=120001'));
  await expect(page.getByTestId('spawn-phase')).toHaveAttribute(
    'data-spawn-config',
    'enemyInitialCount=8;enemyStaggerIntervalMs=3000;enemySpawnCandidatePool=10',
  );
  await expect(page.getByTestId('run-panel')).toHaveAttribute(
    'data-run-config',
    'combatWaveDurationMs=150000;restDurationMs=60000',
  );
});

test('hidden recycleはHPを維持し、deathだけ全回復し、retry後に旧callbackを残さない', async ({ page }) => {
  // 80×50マップの再出現・retry仮想時計処理に、実時間の余裕を持たせる。
  test.setTimeout(90_000);
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl('/'));
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
  for (let elapsed = 0; elapsed < 20_000; elapsed += 1_000) {
    if ((await enemySpawnMetadata(page, target.id)).recycleCount === '1') break;
    await page.clock.runFor(1_000);
  }
  const recycling = await enemySpawnMetadata(page, target.id);
  expect(recycling.recycleCount).toBe('1');
  expect(recycling.active).toBe('false');
  expect(recycling.spawnReason).toBe('recycle');
  const activeDuringRecycle = (await allEnemySpawnMetadata(page))
    .filter(metadata => metadata.active === 'true').length;
  await expect(page.getByTestId('enemy-current')).toHaveText(String(activeDuringRecycle));
  await expect(page.getByTestId('enemy-remaining')).toHaveText(String(activeDuringRecycle));
  await expect(page.getByTestId('kills')).toHaveText('0');
  const pendingRecycles = (await allEnemySpawnMetadata(page))
    .filter(metadata => metadata.active === 'false' && metadata.spawnReason === 'recycle');
  expect(pendingRecycles.map(metadata => metadata.stableId)).toContain(target.id);

  await page.clock.runFor(recycleDelayFor(target.id, 1, mapSeed) + 100);
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveAttribute('data-spawn-reason', 'recycle');
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveText('3');
  const activeAfterRecycle = (await allEnemySpawnMetadata(page))
    .filter(metadata => metadata.active === 'true').length;
  await expect(page.getByTestId('enemy-current')).toHaveText(String(activeAfterRecycle));
  await expect(page.getByTestId('enemy-remaining')).toHaveText(String(activeAfterRecycle));
  await expect(page.getByTestId('kills')).toHaveText('0');

  await debugDamageEnemy(page, target.id, 3);
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveAttribute('data-active', 'false');
  const activeAfterDeath = (await allEnemySpawnMetadata(page))
    .filter(metadata => metadata.active === 'true').length;
  await expect(page.getByTestId('enemy-current')).toHaveText(String(activeAfterDeath));
  await expect(page.getByTestId('enemy-remaining')).toHaveText(String(activeAfterDeath));
  await expect(page.getByTestId('kills')).toHaveText('1');
  await page.clock.runFor(respawnDelayFor('basic', target.id, 1, mapSeed) + 1_100);
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId(`${target.id}-hp`)).toHaveAttribute('data-spawn-reason', 'death');
  await expectOutputValue(page.getByTestId(`${target.id}-hp`), '4');
  const activeAfterDeathRespawn = (await allEnemySpawnMetadata(page))
    .filter(metadata => metadata.active === 'true').length;
  await expect(page.getByTestId('enemy-current')).toHaveText(String(activeAfterDeathRespawn));
  await expect(page.getByTestId('enemy-remaining')).toHaveText(String(activeAfterDeathRespawn));
  await expect(page.getByTestId('kills')).toHaveText('1');

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
  const retryEnemyHp = page.getByTestId(`${otherInitialBasic.id}-hp`);
  await page.clock.runFor(1_100);
  await expect(retryEnemyHp).toHaveAttribute('data-active', 'true');
  await expect(retryEnemyHp).toHaveAttribute('data-spawn-reason', 'initial');
  await expectOutputValue(retryEnemyHp, '4');
  const activeAfterRecycleRetry = (await allEnemySpawnMetadata(page))
    .filter(metadata => metadata.active === 'true').length;
  await expect(page.getByTestId('enemy-current')).toHaveText(String(activeAfterRecycleRetry));
  await expect(page.getByTestId('enemy-remaining')).toHaveText(String(activeAfterRecycleRetry));
  await expect(page.getByTestId('kills')).toHaveText('0');
  await page.clock.runFor(oldDeathDelay + 100);
  await expect(retryEnemyHp).toHaveAttribute('data-active', 'true');
  await expect(retryEnemyHp).toHaveAttribute('data-spawn-reason', 'initial');
});

test('restではpath距離5 tile以上のhidden敵をrecycleできる', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl('/?enemyInitialCount=1&enemyStaggerIntervalMs=30000&combatWaveDurationMs=1000&restDurationMs=30000'));
  await setArenaPhysics(page, 'pause');
  await setHiddenRecycle(page, false);
  const target: EnemyId = 'basic-1';
  await expectStrictEnemySpawns(page, [target], 'initial');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const targetMetadata = await enemySpawnMetadata(page, target);
  const targetTile = parseFloorTile(map, targetMetadata.spawnTile, `${target}の初期spawn`);
  let restPlayerTile: TilePosition | undefined;
  for (let y = 0; y < map.height && !restPlayerTile; y += 1)
    for (let x = 0; x < map.width; x += 1) {
      if (map.tiles[y][x] !== 'floor') continue;
      const candidate = { x, y };
      const pathDistance = findPath(map, targetTile, candidate).length - 1;
      if (pathDistance >= 5 && pathDistance < 10 && enemyVisibility(map, candidate, targetTile) === 'hidden') {
        restPlayerTile = candidate;
        break;
      }
    }
  if (!restPlayerTile)
    throw new Error('rest recycle用のhiddenかつpath距離5〜9 tileのplayer位置が必要です。');
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, restPlayerTile);
  await setHiddenRecycle(page, true);
  await page.clock.runFor(1_100);
  await expect(page.getByTestId('run-panel')).toHaveAttribute('data-phase', 'rest');
  await expect(page.getByTestId('phase-remaining')).toHaveText(/^00:(?:[12]\d|30)$/);
  for (let elapsed = 0; elapsed < 15_000; elapsed += 1_000) {
    if ((await enemySpawnMetadata(page, target)).recycleCount === '1') break;
    await page.clock.runFor(1_000);
  }
  const recycled = await enemySpawnMetadata(page, target);
  expect(recycled.recycleCount).toBe('1');
  expect(recycled.active).toBe('false');
  expect(recycled.spawnReason).toBe('recycle');
});

test('DEV scheduleの終端で勝利し、再挑戦でcombat phaseを初期化できる', async ({ page }) => {
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl('/?combatWaveDurationMs=1000&restDurationMs=500'));
  await setPlayerInvulnerable(page, true);
  await expect(page.getByTestId('survival-time')).toHaveText('00:04');
  const playerTile = page.getByTestId('player-tile');
  const beforeTerminalTile = await playerTile.textContent();
  await page.clock.fastForward(4000);
  await expect(page.getByTestId('survival-time')).toHaveText('00:00');
  await expect(page.getByTestId('wave')).toHaveText('3');
  await expect(page.getByTestId('wave')).toHaveAttribute('data-state', 'victory');
  await expect(page.getByTestId('wave-remaining')).toHaveText('00:00');
  await expect(page.getByTestId('phase-remaining')).toHaveText('00:00');
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
  await expect(page.getByTestId('survival-time')).toHaveText('00:04');
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave')).toHaveAttribute('data-state', 'playing');
  await expect(page.getByTestId('wave-remaining')).toHaveText('00:01');
  await expect(page.getByTestId('run-panel')).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('phase-remaining')).toHaveText('00:01');
  const activeAfterVictoryRetry = (await allEnemySpawnMetadata(page))
    .filter(metadata => metadata.active === 'true').length;
  await expect(page.getByTestId('enemy-current')).toHaveText(String(activeAfterVictoryRetry));
  await expect(page.getByTestId('enemy-goal')).toHaveText('12');
  await expect(page.getByTestId('enemy-remaining')).toHaveText(String(activeAfterVictoryRetry));
  await expect(page.getByTestId('kills')).toHaveText('0');
  await expect(page.getByTestId('ammo')).toHaveText('20/20');
});

test('弾薬箱は取得後30秒で同じboxIdのまま新しい画面外floorへ復活し、重複しない', async ({ page }) => {
  // 80×50マップの仮想時計処理に、実時間の余裕を持たせる。
  test.setTimeout(90_000);
  await page.clock.install({ time: 0 });
  await page.clock.setFixedTime(15);
  await page.goto(devStartUrl('/'));
  await setPlayerInvulnerable(page, true);
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const boxTiles = selectAmmoBoxTiles(map);
  const boxIndex = boxTiles.reduce((best, tile, index) =>
    findPath(map, map.start, tile).length < findPath(map, map.start, boxTiles[best]).length ? index : best, 0);
  const boxId = 'ammo-box-' + (boxIndex + 1);
  const firstBox = boxTiles[boxIndex];
  if (!firstBox) throw new Error('初期弾薬箱が必要です。');
  const firstBoxKey = firstBox.x + ',' + firstBox.y;
  const boxCount = page.getByTestId('ammo-box-count');
  await expect(boxCount).toHaveAttribute('data-active-boxes', new RegExp(boxId + ':' + firstBoxKey));
  await collectAmmoBoxWithClock(page, firstBox, boxCount);
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
  const terminalRunDurationMs = 40_000;
  await page.goto(devStartUrl('/?combatWaveDurationMs=10000&restDurationMs=5000'));
  await setPlayerInvulnerable(page, true);
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const boxTiles = selectAmmoBoxTiles(map);
  const boxIndex = boxTiles.reduce((best, tile, index) =>
    findPath(map, map.start, tile).length < findPath(map, map.start, boxTiles[best]).length ? index : best, 0);
  const boxId = 'ammo-box-' + (boxIndex + 1);
  const firstBox = boxTiles[boxIndex];
  if (!firstBox) throw new Error('初期弾薬箱が必要です。');
  const boxCount = page.getByTestId('ammo-box-count');
  await expectAmmoBoxCount(boxCount, 4);
  await setArenaPhysics(page, 'pause');
  await page.clock.fastForward(terminalRunDurationMs - AMMO_BOX_RESPAWN_MS + 100);
  await setArenaPhysics(page, 'resume');
  await collectAmmoBoxWithClock(page, firstBox, boxCount);
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', boxId);
  await setArenaPhysics(page, 'pause');
  await page.clock.fastForward(terminalRunDurationMs);
  await expect(page.getByTestId('victory')).toBeVisible();
  await expectAmmoBoxCount(boxCount, 3);
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', '');
  await expect(boxCount).toHaveAttribute('data-respawn-tiles', '');
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('victory')).toBeHidden();
  await expect(page.getByTestId('survival-time')).toHaveText('00:40');
  await expectAmmoBoxCount(boxCount, 4);
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', '');
});
