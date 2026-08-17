import { expect, test } from '@playwright/test';
import { SPAWN_PHASE_MS, TILE_SIZE, WORLD_WEAPON_DROP_MAX_PATH_DISTANCE, enemyVisibility, findPath, generateArenaMap, hasLineOfSight, hiddenRecycleThresholdFor, primarySpawnDirection, recycleDelayFor, respawnDelayFor, selectAmmoBoxTiles, spawnDirectionForSlot, type SpawnDirection, type TilePosition, viewportTileRect } from '../src/arena-map';
import { formatSurvivalTime } from '../src/arena/hud';
import { INITIAL_WORLD_WEAPON_MODELS, SCRAP_DROP_AMOUNTS, SCRAP_VISUAL_TIER_THRESHOLDS, WORLD_SIDEARM_MODELS, scrapVisualTierFor } from '../src/game-data';
import { GUNSLINGER_BOOT_KNIFE_DAMAGE, GUNSLINGER_COMBO_PER_EVENT, GUNSLINGER_COMBO_TIMEOUT_MS } from '../src/player-data';
import { AMMO_BOX_RESPAWN_MS, AMMO_TYPES, AMMO_TYPE_ORDER, COMBAT_WAVE_DURATION_MS, ENEMY_INSTANCE_IDS, WEAPON_MODELS, WEAPONS, createRunSchedule, runDurationMs, weaponIdForModel } from '../src/rules';

type EnemyId = (typeof ENEMY_INSTANCE_IDS)[number];
type EnemyPresentation = 'normal' | 'boundary' | 'hidden';
type WorldItemEntry = {
  id: string;
  kind: 'weapon' | 'material' | 'ammo';
  item: string;
  tile: TilePosition;
  quantity: number;
  visualTier: string;
  worldColor: string;
  texture: string;
};
type AmmoBoxEntry = {
  boxId: string;
  tile: TilePosition;
  ammoType: (typeof AMMO_TYPE_ORDER)[number];
  quantity: number;
  worldColor: string;
  texture: string;
};
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
type ArenaDebugEnemy = {
  active: boolean;
  x: number;
  y: number;
  body?: { reset: (x: number, y: number) => void };
  setPosition: (x: number, y: number) => ArenaDebugEnemy;
  setVelocity: (x: number, y: number) => ArenaDebugEnemy;
};
type ArenaDebugScene = {
  physics: { pause: () => void; resume: () => void };
  cameras: { main: { worldView: { left: number; top: number; right: number; bottom: number } } };
  children: { getChildren: () => readonly { fillColor?: number }[] };
  player: { x: number; y: number; rotation: number; tintTopLeft: number };
  state: {
    ammo: Record<'rifle' | 'shotgun' | 'handgun', number>;
    reserve: Record<'rifle' | 'shotgun' | 'handgun', number>;
  };
  enemies: Record<EnemyId, ArenaDebugEnemy>;
  textures: { get: (key: string) => { getSourceImage: () => HTMLCanvasElement } };
  debugRespawnEnemy: (id: EnemyId) => void;
  debugSetHiddenRecycleEnabled: (enabled: boolean) => void;
  debugSetPlayerInvulnerable: (enabled: boolean) => void;
  debugMovePlayerTo: (tile: TilePosition) => void;
  debugDamageEnemy: (id: EnemyId, amount: number) => void;
  refreshHud: () => void;
};

function devStartUrl(path: string): string {
  return path + (path.includes('?') ? '&' : '?') + 'start=dev';
}

async function startInitialCombat(
  page: import('@playwright/test').Page,
  preparationDurationMs: number,
): Promise<void> {
  await page.clock.fastForward(preparationDurationMs);
  await expect(page.getByTestId('run-panel')).toHaveAttribute('data-phase', 'combat');
}

async function currentAmmo(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('ammo').textContent();
  return Number(text?.split('/')[0]);
}

function bootKnifeOutcome(initialHp: number, initialCombo: number): { hp: number; combo: number } {
  const hp = Math.max(0, initialHp - GUNSLINGER_BOOT_KNIFE_DAMAGE);
  const comboEvents = hp === 0 ? 2 : 1;
  return { hp, combo: initialCombo + comboEvents * GUNSLINGER_COMBO_PER_EVENT };
}

async function textureIsGrayscale(page: import('@playwright/test').Page, key: string): Promise<boolean> {
  return page.evaluate((textureKey) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    const source = scene.textures.get(textureKey).getSourceImage();
    const context = source.getContext('2d');
    if (!context) throw new Error(`${textureKey} textureの2D contextがありません。`);
    const pixels = context.getImageData(0, 0, source.width, source.height).data;
    for (let index = 0; index < pixels.length; index += 4)
      if (pixels[index] !== pixels[index + 1] || pixels[index + 1] !== pixels[index + 2])
        return false;
    return true;
  }, key);
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

type CanvasInputPoint = { clientX: number; clientY: number };

async function findGameCanvasInputPoint(
  page: import('@playwright/test').Page,
): Promise<CanvasInputPoint> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (!canvas) throw new Error('game canvasが見つかりません。');
    const bounds = canvas.getBoundingClientRect();
    const scanFractions = [0.1, 0.25, 0.5, 0.75, 0.9];
    for (const y of scanFractions) {
      for (const x of scanFractions) {
        const clientX = bounds.left + bounds.width * x;
        const clientY = bounds.top + bounds.height * y;
        const element = document.elementFromPoint(clientX, clientY);
        if (element === canvas || element?.closest('canvas') === canvas)
          return { clientX, clientY };
      }
    }
    throw new Error('Tab詳細表示中に#game canvasへ入力できる座標が見つかりません。');
  });
}

async function expectGameCanvasAt(
  page: import('@playwright/test').Page,
  point: CanvasInputPoint,
): Promise<void> {
  const isCanvas = await page.evaluate(({ clientX, clientY }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (!canvas) throw new Error('game canvasが見つかりません。');
    const element = document.elementFromPoint(clientX, clientY);
    return element === canvas || element?.closest('canvas') === canvas;
  }, point);
  expect(isCanvas).toBe(true);
}

async function clickGameCanvasAt(
  page: import('@playwright/test').Page,
  point: CanvasInputPoint,
): Promise<void> {
  await page.mouse.move(point.clientX, point.clientY);
  await expectGameCanvasAt(page, point);
  await page.mouse.click(point.clientX, point.clientY);
}

async function holdGameCanvasAt(
  page: import('@playwright/test').Page,
  point: CanvasInputPoint,
  durationMs: number,
): Promise<void> {
  await page.mouse.move(point.clientX, point.clientY);
  await expectGameCanvasAt(page, point);
  await page.mouse.down();
  try {
    await page.clock.runFor(durationMs);
  } finally {
    await page.mouse.up();
  }
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

async function activeWorldItems(page: import('@playwright/test').Page): Promise<WorldItemEntry[]> {
  const value = await page.getByTestId('world-item-count').getAttribute('data-world-items');
  return tileKeysFromAttribute(value).map((entry) => {
    const [id, kind, item, tile, quantity, visualTier, worldColor, texture] = entry.split(':');
    const [x, y] = tile?.split(',').map(Number) ?? [];
    if (
      !id
      || (kind !== 'weapon' && kind !== 'material' && kind !== 'ammo')
      || !item
      || !Number.isInteger(x)
      || !Number.isInteger(y)
      || !Number.isSafeInteger(Number(quantity))
    ) throw new Error(`world itemの観測値が不正です: ${entry}`);
    return {
      id,
      kind,
      item,
      tile: { x, y },
      quantity: Number(quantity),
      visualTier: visualTier ?? '',
      worldColor: worldColor ?? '',
      texture: texture ?? '',
    };
  });
}

async function activeAmmoBoxes(page: import('@playwright/test').Page): Promise<AmmoBoxEntry[]> {
  const value = await page.getByTestId('ammo-box-count').getAttribute('data-active-boxes');
  return tileKeysFromAttribute(value).map((entry) => {
    const [boxId, tile, ammoType, quantity, worldColor, texture] = entry.split(':');
    const [x, y] = tile?.split(',').map(Number) ?? [];
    if (
      !boxId
      || !AMMO_TYPE_ORDER.includes(ammoType as (typeof AMMO_TYPE_ORDER)[number])
      || !Number.isInteger(x)
      || !Number.isInteger(y)
      || !Number.isSafeInteger(Number(quantity))
      || !worldColor
      || !texture
    ) throw new Error(`弾薬箱の観測値が不正です: ${entry}`);
    return {
      boxId,
      tile: { x, y },
      ammoType: ammoType as (typeof AMMO_TYPE_ORDER)[number],
      quantity: Number(quantity),
      worldColor,
      texture,
    };
  });
}

async function dragInventorySlot(
  page: import('@playwright/test').Page,
  sourceTestId: string,
  targetSelector: string,
): Promise<void> {
  await page.evaluate(({ sourceId, target }) => {
    const source = document.querySelector<HTMLElement>(`[data-testid="${sourceId}"]`);
    const destination = document.querySelector<HTMLElement>(target);
    if (!source || !destination)
      throw new Error('inventory drag/drop用のDOM要素が見つかりません。');
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    destination.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    destination.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  }, { sourceId: sourceTestId, target: targetSelector });
}

async function expectTextSelectionClearedByPointer(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
): Promise<void> {
  const bounds = await locator.boundingBox();
  if (!bounds)
    throw new Error('文字選択を確認する表示要素が必要です。');
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(bounds.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + Math.max(3, bounds.width - 2), y, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
}

async function beginInventoryDrag(page: import('@playwright/test').Page, sourceTestId: string): Promise<void> {
  await page.evaluate((sourceId) => {
    const source = document.querySelector<HTMLElement>(`[data-testid="${sourceId}"]`);
    if (!source)
      throw new Error('inventory drag開始用のDOM要素が見つかりません。');
    source.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer(),
    }));
  }, sourceTestId);
}

async function collectShotgunPickup(page: import('@playwright/test').Page): Promise<WorldItemEntry> {
  const shotgun = (await activeWorldItems(page)).find(item => item.kind === 'weapon' && item.item === 'shotgun');
  if (!shotgun)
    throw new Error('初期ショットガンpickupが必要です。');
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, shotgun.tile);
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByTestId('quick-slot-2')).toHaveAttribute('data-model', 'shotgun');
  return shotgun;
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

async function moveEnemyToTile(
  page: import('@playwright/test').Page,
  id: EnemyId,
  target: TilePosition,
): Promise<void> {
  await page.evaluate(({ enemyId, targetTile, tileSize }) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    const enemy = scene.enemies[enemyId];
    if (!enemy.active) throw new Error(`${enemyId}がactiveではありません。`);
    const x = targetTile.x * tileSize + tileSize / 2;
    const y = targetTile.y * tileSize + tileSize / 2;
    enemy.setPosition(x, y).setVelocity(0, 0);
    enemy.body?.reset(x, y);
  }, { enemyId: id, targetTile: target, tileSize: TILE_SIZE });
}

function movementKeyFor(direction: TilePosition): 'w' | 'a' | 's' | 'd' {
  if (direction.x > 0) return 'd';
  if (direction.x < 0) return 'a';
  if (direction.y > 0) return 's';
  if (direction.y < 0) return 'w';
  throw new Error('接触確認の移動方向がありません。');
}

async function movePlayerIntoEnemy(
  page: import('@playwright/test').Page,
  id: EnemyId,
  origin: TilePosition,
  direction: TilePosition,
  placeEnemyOnPlayerFirst = false,
): Promise<void> {
  const enemyTile = {
    x: origin.x + direction.x * 2,
    y: origin.y + direction.y * 2,
  };
  if (placeEnemyOnPlayerFirst) {
    await page.evaluate((tile) => {
      const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
      if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
      scene.debugMovePlayerTo(tile);
    }, enemyTile);
    await moveEnemyToTile(page, id, enemyTile);
  }
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, origin);
  if (!placeEnemyOnPlayerFirst)
    await moveEnemyToTile(page, id, enemyTile);
  const key = movementKeyFor(direction);
  await page.keyboard.down(key);
  try {
    await page.clock.runFor(500);
  } finally {
    await page.keyboard.up(key);
  }
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
    const position = await page.evaluate((enemyId) => {
      const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
      if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
      const enemy = scene.enemies[enemyId];
      return { x: enemy.x, y: enemy.y };
    }, id);
    const enemyTile = {
      x: Math.max(0, Math.min(map.width - 1, Math.floor(position.x / TILE_SIZE))),
      y: Math.max(0, Math.min(map.height - 1, Math.floor(position.y / TILE_SIZE))),
    };
    await expectEnemyPresentation(page, id, enemyVisibility(map, player, enemyTile));
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

test('開始前のSpace選択を保ち、開始後のキーボード移動を受け付ける', async ({ page }) => {
  const schedule = createRunSchedule(COMBAT_WAVE_DURATION_MS, 500);
  await page.goto(`/?restDurationMs=${schedule.restDurationMs}`);
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
  await page.waitForTimeout(schedule.restDurationMs + 100);
  await expect(page.getByTestId('role')).toHaveText('スナイパー（紫）');
  await expect(page.getByTestId('role')).toHaveAttribute('data-role', 'sniper');
  const playerTint = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return scene.player.tintTopLeft;
  });
  const enemyHitColor = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    const before = new Set(scene.children.getChildren());
    scene.debugDamageEnemy('basic-1', 1);
    const hit = scene.children.getChildren().find(child => !before.has(child));
    if (!hit || typeof hit.fillColor !== 'number')
      throw new Error('基本敵への着弾エフェクトが見つかりません。');
    return hit.fillColor;
  });
  expect(enemyHitColor).toBe(playerTint);
  expect(await Promise.all(['player', 'basic', 'drone', 'enemy-silhouette'].map(key => textureIsGrayscale(page, key)))).toEqual([true, true, true, true]);
  const initialRotation = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return scene.player.rotation;
  });
  const playerTile = page.getByTestId('player-tile');
  const initialPlayerTile = await playerTile.textContent();
  await page.keyboard.down('d');
  try {
    await expect(playerTile).not.toHaveText(initialPlayerTile ?? '', { timeout: 2_000 });
  } finally {
    await page.keyboard.up('d');
  }
  const movedRotation = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return scene.player.rotation;
  });
  expect(movedRotation).toBeCloseTo(initialRotation, 6);
  await aimPlayer(page, { x: 1, y: 0 });
  await page.waitForTimeout(100);
  const aimedRotation = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return scene.player.rotation;
  });
  expect(aimedRotation).toBeCloseTo(0, 1);
});

test('通常役職は回避中に発砲しない', async ({ page }) => {
  await page.goto(devStartUrl('/'));
  await expect(page.locator('#game canvas')).toBeVisible();
  await setPlayerInvulnerable(page, true);
  await collectShotgunPickup(page);
  await page.keyboard.press('2');
  await expect(page.getByTestId('weapon')).toHaveText('ショットガン');
  await aimPlayer(page, { x: 1, y: 0 });
  const startingAmmo = await currentAmmo(page);
  await page.keyboard.press('Space');
  await page.mouse.down();
  try {
    expect(await currentAmmo(page)).toBe(startingAmmo);
  } finally {
    await page.mouse.up();
  }
});

test('ガンスリンガーは回避中に発砲できる', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('role-gunslinger').check();
  await page.getByTestId('start').click();
  await expect(page.locator('#game canvas')).toBeVisible();
  await setPlayerInvulnerable(page, true);
  await collectShotgunPickup(page);
  await page.keyboard.press('2');
  await expect(page.getByTestId('weapon')).toHaveText('ショットガン');
  await aimPlayer(page, { x: 1, y: 0 });
  const startingAmmo = await currentAmmo(page);
  await page.keyboard.press('Space');
  await page.mouse.down();
  try {
    expect(await currentAmmo(page)).toBeLessThan(startingAmmo);
  } finally {
    await page.mouse.up();
  }
});

test('Tab詳細中は単発射撃と空ライフル弾倉の自動reloadを開始しない', async ({ page }) => {
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl('/'));
  await expect(page.locator('#game canvas')).toBeVisible();
  await setArenaPhysics(page, 'pause');
  await aimPlayer(page, { x: 1, y: 0 });
  await collectShotgunPickup(page);
  await page.keyboard.press('2');
  await expect(page.getByTestId('weapon')).toHaveText(WEAPON_MODELS.shotgun.label);

  const reloadHud = page.getByTestId('reload');
  const reloadProgress = page.getByTestId('reload-progress');
  const selectedAmmoState = async (): Promise<{
    magazine: number;
    reserve: string | null;
    reload: string | null;
    reloadProgressHidden: boolean;
    reloadProgressValue: number;
  }> => ({
    magazine: await currentAmmo(page),
    reserve: await page.getByTestId('ammo-reserve').getAttribute('data-reserve'),
    reload: await reloadHud.textContent(),
    reloadProgressHidden: await reloadProgress.isHidden(),
    reloadProgressValue: await reloadProgress.evaluate(element =>
      (element as HTMLProgressElement).value),
  });
  const expectSelectedAmmoState = async (before: {
    magazine: number;
    reserve: string | null;
    reload: string | null;
    reloadProgressHidden: boolean;
    reloadProgressValue: number;
  }): Promise<void> => {
    expect(await currentAmmo(page)).toBe(before.magazine);
    expect(await page.getByTestId('ammo-reserve').getAttribute('data-reserve')).toBe(before.reserve);
    expect(await reloadHud.textContent()).toBe(before.reload);
    expect(await reloadProgress.isHidden()).toBe(before.reloadProgressHidden);
    expect(await reloadProgress.evaluate(element => (element as HTMLProgressElement).value))
      .toBe(before.reloadProgressValue);
  };

  const shotgunBeforeBlockedClick = await selectedAmmoState();
  await page.keyboard.press('Tab');
  const tabCanvasPoint = await findGameCanvasInputPoint(page);
  await clickGameCanvasAt(page, tabCanvasPoint);
  await expectSelectedAmmoState(shotgunBeforeBlockedClick);
  await page.keyboard.press('Tab');
  await page.keyboard.press('1');
  await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.state.ammo.rifle = 0;
    scene.refreshHud();
  });

  const emptyRifleBeforeBlockedHold = await selectedAmmoState();
  expect(await currentAmmo(page)).toBe(0);
  await expect(reloadHud).toHaveText('待機');
  await expect(reloadProgress).toBeHidden();

  await page.keyboard.press('Tab');
  await holdGameCanvasAt(page, tabCanvasPoint, WEAPONS.rifle.fireIntervalMs * 2);
  await expectSelectedAmmoState(emptyRifleBeforeBlockedHold);

  await page.keyboard.press('Tab');
  await holdGameCanvasAt(page, tabCanvasPoint, WEAPONS.rifle.fireIntervalMs * 2);
  expect(await currentAmmo(page)).toBe(0);
  expect(await page.getByTestId('ammo-reserve').getAttribute('data-reserve'))
    .toBe(emptyRifleBeforeBlockedHold.reserve);
  await expect(reloadHud).toContainText('リロード中');
  await expect(reloadProgress).toBeVisible();
});

test('モデル別world weapon、クイックスロット、詳細インベントリをEで取得できる', async ({ page }) => {
  test.setTimeout(45_000);
  const schedule = createRunSchedule(15_000, 1_000);
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=1&enemyStaggerIntervalMs=30000&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await setArenaPhysics(page, 'pause');
  await startInitialCombat(page, schedule.restDurationMs);
  const quickSlot1 = page.getByTestId('quick-slot-1');
  const quickSlot2 = page.getByTestId('quick-slot-2');
  const quickSlot3 = page.getByTestId('quick-slot-3');
  const canvasLocator = page.locator('#game canvas');
  await expect(quickSlot1).toHaveAttribute('data-model', 'rifle');
  await expect(quickSlot1).toHaveAttribute('data-selected', 'true');
  await expect(quickSlot2).toHaveAttribute('data-empty', 'true');
  await expect(quickSlot3).toHaveAttribute('data-empty', 'true');
  await expect(quickSlot1).toContainText(WEAPON_MODELS.rifle.label);
  const quickbarBounds = await documentBounds(page.getByTestId('inventory-panel'));
  const canvasBounds = await documentBounds(canvasLocator);
  expect(quickbarBounds.x + quickbarBounds.width / 2).toBeCloseTo(canvasBounds.x + canvasBounds.width / 2, 1);
  expect(quickbarBounds.y + quickbarBounds.height).toBeLessThanOrEqual(canvasBounds.y + canvasBounds.height);
  await page.keyboard.press('Tab');
  const detail = page.getByTestId('inventory-detail');
  const ammoPouch = page.getByTestId('ammo-pouch');
  await expect(detail).toBeVisible();
  await expect(ammoPouch).toBeVisible();
  for (const locator of [
    detail.locator('h2'),
    detail.locator('.inventory-panel-caption').first(),
    page.getByTestId('quick-slot-2'),
    page.getByTestId('inventory-quick-slot-2'),
    page.getByTestId('inventory-quick-slot-3'),
    detail.locator('.inventory-panel-caption').nth(1),
    page.getByTestId('backpack-slot-1'),
    ammoPouch.locator('h2'),
  ]) await expectTextSelectionClearedByPointer(page, locator);
  const inventoryQuickSlot1 = page.getByTestId('inventory-quick-slot-1');
  const backpackSlot1 = page.getByTestId('backpack-slot-1');
  await inventoryQuickSlot1.dragTo(backpackSlot1);
  await expect(quickSlot1).toHaveAttribute('data-empty', 'true');
  await expect(backpackSlot1).toHaveAttribute('data-model', 'rifle');
  await backpackSlot1.dragTo(inventoryQuickSlot1);
  await expect(quickSlot1).toHaveAttribute('data-model', 'rifle');
  await expect(backpackSlot1).toHaveAttribute('data-empty', 'true');
  await page.keyboard.press('Tab');
  await expect(detail).toBeHidden();
  await expect(page.getByTestId('scrap')).toHaveAttribute('data-count', '0');
  const worldItemCount = page.getByTestId('world-item-count');
  await expect(worldItemCount).toBeHidden();
  await expect(worldItemCount).toHaveAttribute('data-world-items', /weapon/);
  expect(await worldItemCount.evaluate(element => getComputedStyle(element).display)).toBe('none');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const weaponPickups = (await activeWorldItems(page)).filter(item => item.kind === 'weapon');
  expect(weaponPickups.map(item => item.item).sort()).toEqual([...INITIAL_WORLD_WEAPON_MODELS].sort());
  expect(weaponPickups.every(({ tile }) =>
    (Math.abs(tile.x - map.start.x) > 1 || Math.abs(tile.y - map.start.y) > 1)
    && selectAmmoBoxTiles(map).every(box => Math.abs(tile.x - box.x) > 1 || Math.abs(tile.y - box.y) > 1),
  )).toBe(true);
  expect(weaponPickups.every((item, index) => weaponPickups.slice(index + 1).every(other =>
    Math.abs(item.tile.x - other.tile.x) > 1 || Math.abs(item.tile.y - other.tile.y) > 1,
  ))).toBe(true);

  const shotgun = weaponPickups.find(item => item.item === 'shotgun');
  if (!shotgun)
    throw new Error('初期ショットガンpickupが必要です。');
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, shotgun.tile);
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  await expect(page.getByTestId('pickup-target')).toHaveText(WEAPON_MODELS.shotgun.label);
  await expect(page.getByTestId('pickup-action')).toHaveText('を拾う [E]');
  await page.keyboard.press('e');
  await expect(quickSlot2).toHaveAttribute('data-model', 'shotgun');
  await page.keyboard.press('2');
  await expect(quickSlot2).toHaveAttribute('data-selected', 'true');
  await expect(quickSlot1).toHaveAttribute('data-selected', 'false');
  const canvas = await canvasLocator.boundingBox();
  if (!canvas) throw new Error('shotgun射撃用のcanvasが必要です。');
  const reloadHud = page.getByTestId('reload');
  const reloadProgress = page.getByTestId('reload-progress');
  for (let shot = 0; shot < WEAPONS.shotgun.magazineSize; shot += 1) {
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    if (shot + 1 < WEAPONS.shotgun.magazineSize)
      await page.clock.runFor(WEAPONS.shotgun.fireIntervalMs * 2);
  }
  expect(await currentAmmo(page)).toBe(0);
  const emptyShotgunReserve = await page.getByTestId('ammo-reserve').getAttribute('data-reserve');
  const emptyShotgunReloadProgressWasHidden = await reloadProgress.isHidden();
  const emptyShotgunReloadProgressValueBefore = await reloadProgress.evaluate(element =>
    (element as HTMLProgressElement).value);
  await expect(reloadHud).toHaveText('待機');
  await expect(reloadProgress).toBeHidden();
  await page.keyboard.press('Tab');
  const emptyShotgunCanvasPoint = await findGameCanvasInputPoint(page);
  await clickGameCanvasAt(page, emptyShotgunCanvasPoint);
  expect(await currentAmmo(page)).toBe(0);
  expect(await page.getByTestId('ammo-reserve').getAttribute('data-reserve')).toBe(emptyShotgunReserve);
  await expect(reloadHud).toHaveText('待機');
  expect(await reloadProgress.isHidden()).toBe(emptyShotgunReloadProgressWasHidden);
  expect(await reloadProgress.evaluate(element => (element as HTMLProgressElement).value))
    .toBe(emptyShotgunReloadProgressValueBefore);
  await holdGameCanvasAt(page, emptyShotgunCanvasPoint, WEAPONS.shotgun.fireIntervalMs);
  expect(await currentAmmo(page)).toBe(0);
  expect(await page.getByTestId('ammo-reserve').getAttribute('data-reserve')).toBe(emptyShotgunReserve);
  await expect(reloadHud).toHaveText('待機');
  expect(await reloadProgress.isHidden()).toBe(emptyShotgunReloadProgressWasHidden);
  expect(await reloadProgress.evaluate(element => (element as HTMLProgressElement).value))
    .toBe(emptyShotgunReloadProgressValueBefore);
  await page.keyboard.press('Tab');
  await clickGameCanvasAt(page, emptyShotgunCanvasPoint);
  await expect(reloadHud).toContainText('リロード中');
  await expect(reloadProgress).toBeVisible();
  expect(await currentAmmo(page)).toBe(0);
  expect(await page.getByTestId('ammo-reserve').getAttribute('data-reserve')).toBe(emptyShotgunReserve);
  await page.keyboard.press('1');
  await expect(reloadHud).toHaveText('待機');
  await expect(reloadProgress).toBeHidden();

  const duplicateModel = WORLD_SIDEARM_MODELS.find(model =>
    weaponPickups.filter(item => item.item === model).length >= 2);
  if (!duplicateModel)
    throw new Error('非stack確認用に同じsidearm modelが2件必要です。');
  const sidearms = weaponPickups.filter(item => item.item === duplicateModel);
  const firstSidearm = sidearms[0];
  if (!firstSidearm)
    throw new Error('最初のsidearm pickupが必要です。');
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, firstSidearm.tile);
  await expect(page.getByTestId('pickup-target')).toHaveText(WEAPON_MODELS[duplicateModel].label);
  await expect(page.getByTestId('pickup-action')).toHaveText('を拾う [E]');
  await page.keyboard.press('e');
  await expect(quickSlot3).toHaveAttribute('data-model', duplicateModel);
  await page.keyboard.press('3');
  await expect(quickSlot3).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('weapon')).toHaveText(WEAPON_MODELS[duplicateModel].label);
  await aimPlayer(page, { x: 1, y: 0 });
  const sidearmAmmoBeforeShot = await currentAmmo(page);
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  const sidearmAmmoAfterShot = await currentAmmo(page);
  expect(sidearmAmmoAfterShot).toBe(sidearmAmmoBeforeShot - 1);
  expect(weaponIdForModel(duplicateModel)).toBe('handgun');
  const secondSidearm = sidearms.find(item => item.id !== firstSidearm.id);
  if (!secondSidearm)
    throw new Error('追加取得用の同モデルsidearm pickupが必要です。');
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, secondSidearm.tile);
  await page.keyboard.press('e');
  await expect(page.getByTestId('backpack-slot-1')).toHaveAttribute('data-model', duplicateModel);
  expect(await currentAmmo(page)).toBe(sidearmAmmoAfterShot);

  await page.keyboard.press('Tab');
  await expect(detail).toBeVisible();
  await expect(ammoPouch).toBeVisible();
  for (const type of AMMO_TYPE_ORDER) {
    const ammo = AMMO_TYPES[type];
    const pouchEntry = page.getByTestId(`ammo-pouch-${type}`);
    await expect(pouchEntry).toHaveAttribute('data-ammo-type', type);
    await expect(pouchEntry).toHaveAttribute('data-weapon', ammo.weapon);
    await expect(pouchEntry).toHaveAttribute('data-reserve', /^\d+$/);
    await expect(pouchEntry).toContainText(ammo.label);
  }
  await expect(page.getByTestId('inventory-quick-slot-3')).toHaveAttribute('data-model', duplicateModel);
  await expect(page.getByTestId('backpack-slots').locator('output')).toHaveCount(10);
  await expect(page.getByTestId('inventory-quick-slot-3')).toHaveAttribute('draggable', 'true');

  await dragInventorySlot(page, 'inventory-quick-slot-3', '[data-testid="backpack-slot-2"]');
  await expect(quickSlot3).toHaveAttribute('data-empty', 'true');
  await expect(detail).toHaveAttribute('data-selected-quick-slot', '2');
  await expect(page.getByTestId('backpack-slot-2')).toHaveAttribute('data-model', duplicateModel);
  await expect(page.getByTestId('weapon')).toHaveText('武器なし');
  await expect(page.getByTestId('ammo')).toHaveText('-/-');

  await dragInventorySlot(page, 'backpack-slot-1', '[data-testid="inventory-quick-slot-3"]');
  await expect(quickSlot3).toHaveAttribute('data-model', duplicateModel);
  await expect(detail).toHaveAttribute('data-selected-quick-slot', '2');
  await expect(quickSlot3).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('weapon')).toHaveText(WEAPON_MODELS[duplicateModel].label);

  await dragInventorySlot(page, 'inventory-quick-slot-2', '[data-testid="backpack-slot-2"]');
  await expect(quickSlot2).toHaveAttribute('data-model', duplicateModel);
  await expect(page.getByTestId('backpack-slot-2')).toHaveAttribute('data-model', 'shotgun');
  const worldItemsBeforeDrop = await activeWorldItems(page);
  const playerTileForDrop = parseFloorTile(map, await page.getByTestId('player-tile').textContent(), 'world drop時のplayer');
  await dragInventorySlot(page, 'backpack-slot-2', '#game');
  await expect(page.getByTestId('backpack-slot-2')).toHaveAttribute('data-empty', 'true');
  const dropped = (await activeWorldItems(page)).find(item => item.id.startsWith('dropped-weapon-'));
  if (!dropped)
    throw new Error('worldへ置いたweaponが必要です。');
  expect(dropped.id).toMatch(/^dropped-weapon-/);
  expect(dropped.item).toBe('shotgun');
  expect(dropped.tile).toEqual(playerTileForDrop);
  expect((await activeWorldItems(page)).length).toBe(worldItemsBeforeDrop.length + 1);
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByTestId('backpack-slot-1')).toHaveAttribute('data-model', 'shotgun');
  expect((await activeWorldItems(page)).some(item => item.id === dropped.id)).toBe(false);

  await page.keyboard.press('1');
  await expect(detail).toBeVisible();
  await expect(quickSlot1).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Tab');
  await expect(detail).toBeHidden();
});

test('弾薬ポーチの種類別弾薬をworldへ置き、部分取得してEで回収できる', async ({ page }) => {
  test.setTimeout(30_000);
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl('/'));
  await setArenaPhysics(page, 'pause');
  const ammoType = 'handgun-ammo' as const;
  const ammo = AMMO_TYPES[ammoType];
  const droppedQuantity = Math.max(1, Math.floor(ammo.boxQuantity / 2));
  if (droppedQuantity >= ammo.boxQuantity)
    throw new Error('less-than-chunk確認には弾薬箱の設定量が2以上必要です。');
  await page.evaluate(({ weapon, reserve }) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.state.reserve[weapon] = reserve;
    scene.refreshHud();
  }, { weapon: ammo.weapon, reserve: droppedQuantity });

  await page.keyboard.press('Tab');
  const pouchEntry = page.getByTestId(`ammo-pouch-${ammoType}`);
  await expect(pouchEntry).toHaveAttribute('draggable', 'true');
  await expect(pouchEntry).toHaveAttribute('data-box-quantity', String(ammo.boxQuantity));
  await expect(pouchEntry).toHaveAttribute('data-world-color', ammo.worldColor);
  await expect(pouchEntry).toHaveCSS('pointer-events', 'auto');
  const canvas = page.locator('#game canvas');
  const canvasBounds = await canvas.boundingBox();
  if (!canvasBounds)
    throw new Error('worldへ置くためのgame canvas座標が必要です。');
  const canvasPoint = await findGameCanvasInputPoint(page);
  await pouchEntry.dragTo(canvas, {
    targetPosition: {
      x: canvasPoint.clientX - canvasBounds.x,
      y: canvasPoint.clientY - canvasBounds.y,
    },
  });
  await expect(pouchEntry).toHaveAttribute('data-reserve', '0');
  const selectedAmmoBeforeClose = await currentAmmo(page);
  const selectedReserveBeforeClose = await page.getByTestId('ammo-reserve').getAttribute('data-reserve');
  const reloadHud = page.getByTestId('reload');
  const reloadBeforeClose = await reloadHud.textContent();
  const reloadProgress = page.getByTestId('reload-progress');
  const reloadProgressWasHidden = await reloadProgress.isHidden();
  const reloadProgressBeforeClose = await reloadProgress.evaluate(element =>
    (element as HTMLProgressElement).value);
  await page.mouse.move(canvasPoint.clientX, canvasPoint.clientY);
  await expectGameCanvasAt(page, canvasPoint);
  await page.mouse.down();
  try {
    await page.keyboard.press('Tab');
    await expect(pouchEntry).toBeHidden();
    await page.clock.runFor(WEAPONS.rifle.fireIntervalMs * 2);
    expect(await currentAmmo(page)).toBe(selectedAmmoBeforeClose);
    expect(await page.getByTestId('ammo-reserve').getAttribute('data-reserve'))
      .toBe(selectedReserveBeforeClose);
    expect(await reloadHud.textContent()).toBe(reloadBeforeClose);
    expect(await reloadProgress.isHidden()).toBe(reloadProgressWasHidden);
    expect(await reloadProgress.evaluate(element => (element as HTMLProgressElement).value))
      .toBe(reloadProgressBeforeClose);
  } finally {
    await page.mouse.up();
  }
  await holdGameCanvasAt(page, canvasPoint, WEAPONS.rifle.fireIntervalMs);
  await expect.poll(() => currentAmmo(page)).toBeLessThan(selectedAmmoBeforeClose);

  const dropped = (await activeWorldItems(page)).find(item => item.id.startsWith('dropped-ammo-'));
  if (!dropped || dropped.kind !== 'ammo')
    throw new Error('worldへ置いた種類別弾薬が必要です。');
  expect(dropped.item).toBe(ammoType);
  expect(dropped.quantity).toBe(droppedQuantity);
  expect(dropped.quantity).toBeLessThan(ammo.boxQuantity);
  expect(dropped.worldColor).toBe(ammo.worldColor);
  expect(dropped.texture).toBe(`ammo-box-${ammoType}`);
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  await expect(page.getByTestId('pickup-target')).toHaveText(`${ammo.label} ${dropped.quantity}発`);
  await expect(page.getByTestId('pickup-action')).toHaveText('を拾う [E]');

  const partialCapacity = dropped.quantity - 1;
  if (partialCapacity <= 0)
    throw new Error('部分取得確認にはworldへ置く弾薬が2発以上必要です。');
  await page.evaluate(({ weapon, reserve }) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.state.reserve[weapon] = reserve;
    scene.refreshHud();
  }, { weapon: ammo.weapon, reserve: WEAPONS[ammo.weapon].reserveMax - partialCapacity });
  await page.keyboard.press('e');
  const remainingQuantity = dropped.quantity - partialCapacity;
  const partiallyCollected = (await activeWorldItems(page)).find(item => item.id === dropped.id);
  expect(partiallyCollected).toMatchObject({ kind: 'ammo', quantity: remainingQuantity });
  await expect(pouchEntry).toHaveAttribute('data-reserve', String(WEAPONS[ammo.weapon].reserveMax));
  await page.keyboard.press('e');
  expect((await activeWorldItems(page)).find(item => item.id === dropped.id)).toMatchObject({ quantity: remainingQuantity });

  await page.evaluate(({ weapon, reserve }) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.state.reserve[weapon] = reserve;
    scene.refreshHud();
  }, { weapon: ammo.weapon, reserve: WEAPONS[ammo.weapon].reserveMax - remainingQuantity });
  await page.keyboard.press('e');
  expect((await activeWorldItems(page)).some(item => item.id === dropped.id)).toBe(false);
  await expect(pouchEntry).toHaveAttribute('data-reserve', String(WEAPONS[ammo.weapon].reserveMax));
});

test('同じtileのスクラップは数量と見た目を集約しEで取得できる', async ({ page }) => {
  test.setTimeout(45_000);
  const schedule = createRunSchedule(15_000, 1_000);
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=1&enemyStaggerIntervalMs=30000&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await setArenaPhysics(page, 'pause');
  await startInitialCombat(page, schedule.restDurationMs);
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const anchor = generateArenaMap(mapSeed).start;

  await moveEnemyToTile(page, 'basic-1', anchor);
  const dropsToMediumTier = Math.max(1, Math.ceil(SCRAP_VISUAL_TIER_THRESHOLDS.medium / SCRAP_DROP_AMOUNTS.basic));
  let firstScrap: WorldItemEntry | undefined;
  let secondScrap: WorldItemEntry | undefined;
  for (let dropIndex = 0; dropIndex < dropsToMediumTier; dropIndex += 1) {
    if (dropIndex > 0) {
      await page.clock.runFor(respawnDelayFor('basic', 'basic-1', dropIndex, mapSeed) + 100);
      await expect(page.getByTestId('basic-1-hp')).toHaveAttribute('data-active', 'true');
      await moveEnemyToTile(page, 'basic-1', anchor);
    }
    await debugDamageEnemy(page, 'basic-1', Number(await page.getByTestId('basic-1-hp').textContent()));
    const scrap = (await activeWorldItems(page)).find(item =>
      item.kind === 'material' && item.tile.x === anchor.x && item.tile.y === anchor.y);
    if (!scrap) throw new Error('スクラップpickupが必要です。');
    if (!firstScrap) firstScrap = scrap;
    secondScrap = scrap;
  }
  const scrapItems = (await activeWorldItems(page)).filter(item =>
    item.kind === 'material' && item.tile.x === anchor.x && item.tile.y === anchor.y);
  expect(scrapItems).toHaveLength(1);
  if (!firstScrap || !secondScrap) throw new Error('集約後のスクラップpickupが必要です。');
  expect(secondScrap.quantity).toBeGreaterThanOrEqual(firstScrap.quantity);
  expect(secondScrap.visualTier).toBe(scrapVisualTierFor(secondScrap.quantity));
  if (dropsToMediumTier > 1)
    expect(secondScrap.visualTier).not.toBe(firstScrap.visualTier);

  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, anchor);
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  await expect(page.getByTestId('pickup-target')).toHaveText(`スクラップ ${secondScrap.quantity}個`);
  await expect(page.getByTestId('pickup-action')).toHaveText('を拾う [E]');
  await page.keyboard.press('e');
  await expect(page.getByTestId('scrap')).toHaveAttribute('data-count', /[1-9]/);
  expect((await activeWorldItems(page)).filter(item => item.id === secondScrap.id)).toHaveLength(0);
});

test('world weaponと弾薬を置けない場合はinventoryとworldを変えずに通知する', async ({ page }) => {
  test.setTimeout(30_000);
  const schedule = createRunSchedule(15_000, 1_000);
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=${ENEMY_INSTANCE_IDS.length}&enemyStaggerIntervalMs=30000&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await setArenaPhysics(page, 'pause');
  await startInitialCombat(page, schedule.restDurationMs);
  await expect(page.getByTestId('enemy-current')).toHaveText(String(ENEMY_INSTANCE_IDS.length));
  const map = generateArenaMap(Number(await page.getByTestId('map-seed').textContent()));
  const shotgun = (await activeWorldItems(page)).find(item => item.kind === 'weapon' && item.item === 'shotgun');
  if (!shotgun)
    throw new Error('配置失敗確認用のショットガンpickupが必要です。');
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, shotgun.tile);
  await page.keyboard.press('e');
  await expect(page.getByTestId('quick-slot-2')).toHaveAttribute('data-model', 'shotgun');

  const nearbyFloorsFor = (player: TilePosition): TilePosition[] => map.tiles.flatMap((row, y) => row.flatMap((tile, x) => {
    const candidate = { x, y };
    return tile === 'floor' && findPath(map, player, candidate).length - 1 <= WORLD_WEAPON_DROP_MAX_PATH_DISTANCE
      ? [candidate]
      : [];
  }));
  const dropPlayerTile = map.tiles.flatMap((row, y) => row.flatMap((tile, x) => tile === 'floor' ? [{ x, y }] : []))
    .find(tile => nearbyFloorsFor(tile).length <= ENEMY_INSTANCE_IDS.length);
  if (!dropPlayerTile)
    throw new Error('全近傍候補を敵で塞げるfloor tileが必要です。');
  const blockedTiles = nearbyFloorsFor(dropPlayerTile);
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, dropPlayerTile);
  for (const [index, tile] of blockedTiles.entries()) {
    const id = ENEMY_INSTANCE_IDS[index];
    if (!id)
      throw new Error('world drop候補を塞ぐ敵枠が必要です。');
    await moveEnemyToTile(page, id, tile);
  }

  await page.keyboard.press('Tab');
  await expect(page.getByTestId('inventory-detail')).toBeVisible();
  const worldItemsBeforeDrop = await activeWorldItems(page);
  await beginInventoryDrag(page, 'inventory-quick-slot-2');
  await expect(page.getByTestId('inventory-detail')).toHaveAttribute('data-drag-source', 'quick:1');
  await dragInventorySlot(page, 'inventory-quick-slot-2', '#game');
  await expect(page.getByTestId('feedback')).toHaveText('置ける場所がありません');
  await expect(page.getByTestId('quick-slot-2')).toHaveAttribute('data-model', 'shotgun');
  expect(await activeWorldItems(page)).toEqual(worldItemsBeforeDrop);

  const ammoType = 'rifle-ammo' as const;
  const pouch = page.getByTestId('ammo-pouch');
  const pouchEntry = page.getByTestId(`ammo-pouch-${ammoType}`);
  const reserveBeforeAmmoDrop = await pouchEntry.getAttribute('data-reserve');
  await beginInventoryDrag(page, `ammo-pouch-${ammoType}`);
  await expect(pouch).toHaveAttribute('data-drag-source', `ammo:${ammoType}`);
  await dragInventorySlot(page, `ammo-pouch-${ammoType}`, '#game');
  await expect(page.getByTestId('feedback')).toHaveText('置ける場所がありません');
  await expect(pouchEntry).toHaveAttribute('data-reserve', reserveBeforeAmmoDrop ?? '');
  expect(await activeWorldItems(page)).toEqual(worldItemsBeforeDrop);
});

test('満タン弾薬箱と同tileのスクラップをEで取得できる', async ({ page }) => {
  const schedule = createRunSchedule(15_000, 1_000);
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=1&enemyStaggerIntervalMs=30000&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await setArenaPhysics(page, 'pause');
  await startInitialCombat(page, schedule.restDurationMs);
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const targetBox = selectAmmoBoxTiles(generateArenaMap(mapSeed))[0];
  if (!targetBox)
    throw new Error('満タン競合確認用の弾薬箱が必要です。');
  const ammoBoxCount = page.getByTestId('ammo-box-count');
  const targetBoxKey = `${targetBox.x},${targetBox.y}`;
  await page.evaluate((weapons) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    for (const [weapon, definition] of Object.entries(weapons))
      scene.state.reserve[weapon as 'rifle' | 'shotgun' | 'handgun'] = definition.reserveMax;
    scene.refreshHud();
  }, WEAPONS);
  await expect.poll(async () => tileKeysFromAttribute(await ammoBoxCount.getAttribute('data-active-tiles'))).toContain(targetBoxKey);

  await moveEnemyToTile(page, 'basic-1', targetBox);
  await debugDamageEnemy(page, 'basic-1', Number(await page.getByTestId('basic-1-hp').textContent()));
  const scrap = (await activeWorldItems(page)).find(item => item.kind === 'material' && item.tile.x === targetBox.x && item.tile.y === targetBox.y);
  if (!scrap) throw new Error('弾薬箱と同tileのスクラップpickupが必要です。');
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, targetBox);
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByTestId('scrap')).toHaveAttribute('data-count', /[1-9]/);
  expect((await activeWorldItems(page)).some(item => item.id === scrap.id)).toBe(false);
  await expect.poll(async () => tileKeysFromAttribute(await ammoBoxCount.getAttribute('data-active-tiles'))).toContain(targetBoxKey);
});

test('terminal中はpickupを止め、retryで所持品とworld itemを初期化する', async ({ page }) => {
  const schedule = createRunSchedule(1_000, 500);
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl(
    `/?combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await setPlayerInvulnerable(page, true);
  const shotgun = (await activeWorldItems(page)).find(item => item.kind === 'weapon' && item.item === 'shotgun');
  if (!shotgun) throw new Error('terminal確認用のショットガンpickupが必要です。');
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, shotgun.tile);
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  const inventoryDetail = page.getByTestId('inventory-detail');
  const ammoPouch = page.getByTestId('ammo-pouch');
  await page.keyboard.press('Tab');
  await expect(inventoryDetail).toBeVisible();
  await expect(ammoPouch).toBeVisible();
  await dragInventorySlot(page, 'ammo-pouch-handgun-ammo', '#game');
  const droppedAmmo = (await activeWorldItems(page)).find(item => item.id.startsWith('dropped-ammo-'));
  if (!droppedAmmo || droppedAmmo.kind !== 'ammo')
    throw new Error('retry初期化確認用のworld弾薬が必要です。');
  await beginInventoryDrag(page, 'inventory-quick-slot-1');
  await expect(inventoryDetail).toHaveAttribute('data-drag-source', 'quick:0');
  await page.clock.fastForward(runDurationMs(schedule));
  await expect(page.getByTestId('victory')).toBeVisible();
  await expect(page.getByTestId('pickup-prompt')).toBeHidden();
  await expect(inventoryDetail).toBeHidden();
  await expect(ammoPouch).toBeHidden();
  await expect(inventoryDetail).not.toHaveAttribute('data-drag-source');
  await page.keyboard.press('Tab');
  await expect(inventoryDetail).toBeHidden();
  await page.keyboard.press('e');
  await expect(page.getByTestId('quick-slot-2')).toHaveAttribute('data-empty', 'true');
  await expect(page.getByTestId('quick-slot-3')).toHaveAttribute('data-empty', 'true');
  expect((await activeWorldItems(page)).find(item => item.id === shotgun.id)).toEqual(shotgun);

  await page.getByTestId('retry').click();
  await expect(page.getByTestId('quick-slot-1')).toHaveAttribute('data-model', 'rifle');
  await expect(page.getByTestId('quick-slot-1')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('quick-slot-2')).toHaveAttribute('data-empty', 'true');
  await expect(page.getByTestId('quick-slot-3')).toHaveAttribute('data-empty', 'true');
  await expect(page.getByTestId('backpack-slots').locator('[data-empty="true"]')).toHaveCount(10);
  await expect(inventoryDetail).toBeHidden();
  await expect(ammoPouch).toBeHidden();
  await expect(inventoryDetail).not.toHaveAttribute('data-drag-source');
  await expect(page.getByTestId('scrap')).toHaveAttribute('data-count', '0');
  await page.keyboard.press('Tab');
  await expect(inventoryDetail).toBeVisible();
  await expect(ammoPouch).toBeVisible();
  for (const type of AMMO_TYPE_ORDER) {
    const weapon = AMMO_TYPES[type].weapon;
    await expect(page.getByTestId(`ammo-pouch-${type}`)).toHaveAttribute('data-reserve', String(WEAPONS[weapon].reserveInitial));
  }
  const retriedItems = await activeWorldItems(page);
  expect(retriedItems.filter(item => item.kind === 'weapon').map(item => item.item).sort()).toEqual([...INITIAL_WORLD_WEAPON_MODELS].sort());
  expect(retriedItems.filter(item => item.kind === 'material')).toHaveLength(0);
  expect(retriedItems.some(item => item.id === droppedAmmo.id)).toBe(false);
  const retriedBoxes = await activeAmmoBoxes(page);
  expect(retriedBoxes).toHaveLength(selectAmmoBoxTiles(generateArenaMap(Number(await page.getByTestId('map-seed').textContent()))).length);
  retriedBoxes.forEach((box, index) => {
    const expectedType = AMMO_TYPE_ORDER[index % AMMO_TYPE_ORDER.length];
    if (!expectedType) throw new Error('弾薬種の設定が必要です。');
    expect(box.ammoType).toBe(expectedType);
    expect(box.quantity).toBe(AMMO_TYPES[expectedType].boxQuantity);
    expect(box.worldColor).toBe(AMMO_TYPES[expectedType].worldColor);
    expect(box.texture).toBe(`ammo-box-${expectedType}`);
  });
});

test('ガンスリンガーは回避中の敵を一度だけブーツナイフで通過し、コンボと速度buffを更新する', async ({ page }) => {
  test.setTimeout(30_000);
  const schedule = createRunSchedule(1_000, 500);
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(`/?combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`);
  await page.getByTestId('role-gunslinger').check();
  await page.getByTestId('start').click();
  await expect(page.locator('#game canvas')).toBeVisible();
  await startInitialCombat(page, schedule.restDurationMs);
  const combo = page.getByTestId('gunslinger-combo');
  const basicEnemyHp = page.getByTestId('basic-1-hp');
  await expect(page.getByTestId('gunslinger-combo-panel')).toBeVisible();
  await expect(combo).toHaveAttribute('data-active', 'true');
  await expect(basicEnemyHp).toHaveAttribute('data-active', 'true');
  const initialBasicHp = Number(await basicEnemyHp.textContent());
  const initialCombo = Number(await combo.textContent());
  const initialSpeedMultiplier = await combo.getAttribute('data-speed-multiplier');
  if (!Number.isFinite(initialBasicHp) || !Number.isFinite(initialCombo) || initialSpeedMultiplier === null)
    throw new Error('ガンスリンガーの初期HUD状態を取得できません。');
  await setPlayerInvulnerable(page, true);
  await setHiddenRecycle(page, false);

  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const lane = findDashLane(generateArenaMap(mapSeed));
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, lane.origin);
  await moveEnemyToTile(page, 'basic-1', {
    x: lane.origin.x + lane.direction.x,
    y: lane.origin.y + lane.direction.y,
  });
  await aimPlayer(page, lane.direction);
  await page.keyboard.press('Space');
  await page.clock.runFor(100);
  const basicHpAfterFirstDash = Number(await basicEnemyHp.textContent());
  const comboAfterFirstDash = Number(await combo.textContent());
  const speedMultiplierAfterFirstDash = await combo.getAttribute('data-speed-multiplier');
  if (speedMultiplierAfterFirstDash === null)
    throw new Error('ブーツナイフ後の速度倍率を取得できません。');
  const expectedFirstDash = bootKnifeOutcome(initialBasicHp, initialCombo);
  expect(basicHpAfterFirstDash).toBe(expectedFirstDash.hp);
  expect(comboAfterFirstDash).not.toBe(initialCombo);
  expect(comboAfterFirstDash).toBe(expectedFirstDash.combo);
  expect(speedMultiplierAfterFirstDash).not.toBe(initialSpeedMultiplier);
  await page.clock.runFor(100);
  expect(Number(await basicEnemyHp.textContent())).toBe(expectedFirstDash.hp);
  expect(Number(await combo.textContent())).toBe(expectedFirstDash.combo);

  await page.clock.fastForward(runDurationMs(schedule));
  await expect(page.getByTestId('victory')).toBeVisible();
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('victory')).toBeHidden();
  await startInitialCombat(page, schedule.restDurationMs);
  await expect(combo).toHaveText('0');
  await expect(combo).toHaveAttribute('data-speed-multiplier', '1');
  await expect(basicEnemyHp).toHaveAttribute('data-active', 'true');
  const retryBasicHp = Number(await basicEnemyHp.textContent());
  const retryCombo = Number(await combo.textContent());
  const retrySpeedMultiplier = await combo.getAttribute('data-speed-multiplier');
  expect(retryBasicHp).toBe(initialBasicHp);
  await setPlayerInvulnerable(page, true);
  await setHiddenRecycle(page, false);
  const retryMapSeed = Number(await page.getByTestId('map-seed').textContent());
  const retryLane = findDashLane(generateArenaMap(retryMapSeed));
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, retryLane.origin);
  await moveEnemyToTile(page, 'basic-1', {
    x: retryLane.origin.x + retryLane.direction.x,
    y: retryLane.origin.y + retryLane.direction.y,
  });
  await aimPlayer(page, retryLane.direction);
  await page.keyboard.press('Space');
  await page.clock.runFor(100);
  const basicHpAfterRetryDash = Number(await basicEnemyHp.textContent());
  const comboAfterRetryDash = Number(await combo.textContent());
  const speedMultiplierAfterRetryDash = await combo.getAttribute('data-speed-multiplier');
  const expectedRetryDash = bootKnifeOutcome(retryBasicHp, retryCombo);
  expect(basicHpAfterRetryDash).toBe(expectedRetryDash.hp);
  expect(comboAfterRetryDash).toBe(expectedRetryDash.combo);
  expect(speedMultiplierAfterRetryDash).not.toBe(retrySpeedMultiplier);
  await page.clock.runFor(100);
  expect(Number(await basicEnemyHp.textContent())).toBe(expectedRetryDash.hp);
  expect(Number(await combo.textContent())).toBe(expectedRetryDash.combo);

  const droneEnemyHp = page.getByTestId('drone-1-hp');
  await expect(droneEnemyHp).toHaveAttribute('data-active', 'true');
  const droneHp = Number(await droneEnemyHp.textContent());
  if (!Number.isFinite(droneHp) || droneHp <= 0)
    throw new Error('通常射撃で撃破するドローンのHPを取得できません。');
  await debugDamageEnemy(page, 'drone-1', droneHp);
  expect(Number(await combo.textContent())).toBeGreaterThan(comboAfterRetryDash);
});

test('ガンスリンガーのコンボ期限は有効命中で更新され、無効接触では維持する', async ({ page }) => {
  test.setTimeout(30_000);
  const schedule = createRunSchedule(10_000, 500);
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(`/?combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`);
  await page.getByTestId('role-gunslinger').check();
  await page.getByTestId('start').click();
  await expect(page.locator('#game canvas')).toBeVisible();
  await startInitialCombat(page, schedule.restDurationMs);
  const combo = page.getByTestId('gunslinger-combo');
  const playerHp = page.getByTestId('hp');
  await expect(page.getByTestId('gunslinger-combo-panel')).toBeVisible();
  await expect(combo).toHaveAttribute('data-active', 'true');
  await setPlayerInvulnerable(page, true);
  await setHiddenRecycle(page, false);
  await page.clock.runFor(2_000);

  const initialCombo = Number(await combo.textContent());
  const initialSpeedMultiplier = await combo.getAttribute('data-speed-multiplier');
  if (initialSpeedMultiplier === null)
    throw new Error('ガンスリンガーの初期速度倍率を取得できません。');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const lane = findDashLane(generateArenaMap(mapSeed));
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, lane.origin);
  await moveEnemyToTile(page, 'basic-4', {
    x: lane.origin.x + lane.direction.x,
    y: lane.origin.y + lane.direction.y,
  });
  await aimPlayer(page, lane.direction);
  await page.keyboard.press('Space');
  await page.clock.runFor(100);
  const comboAfterBootKnife = Number(await combo.textContent());
  const speedMultiplierAfterBootKnife = await combo.getAttribute('data-speed-multiplier');
  if (speedMultiplierAfterBootKnife === null)
    throw new Error('ブーツナイフ後の速度倍率を取得できません。');
  expect(comboAfterBootKnife).toBeGreaterThan(initialCombo);
  expect(speedMultiplierAfterBootKnife).not.toBe(initialSpeedMultiplier);

  const playerHpBeforeBootKnifeContact = Number(await playerHp.textContent());
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, lane.origin);
  await moveEnemyToTile(page, 'basic-4', {
    x: lane.origin.x + lane.direction.x * 4,
    y: lane.origin.y + lane.direction.y * 4,
  });
  await moveEnemyToTile(page, 'basic-1', {
    x: lane.origin.x + lane.direction.x,
    y: lane.origin.y + lane.direction.y,
  });
  await page.clock.runFor(200);
  expect(Number(await playerHp.textContent())).toBe(playerHpBeforeBootKnifeContact);
  expect(Number(await combo.textContent())).toBe(comboAfterBootKnife);
  await setPlayerInvulnerable(page, false);
  await page.clock.runFor(100);
  await expect.poll(async () => Number(await playerHp.textContent())).toBeLessThan(playerHpBeforeBootKnifeContact);
  await expect(combo).toHaveText('0');
  await expect(combo).toHaveAttribute('data-speed-multiplier', speedMultiplierAfterBootKnife);
  await setPlayerInvulnerable(page, true);

  const droneOneHp = Number(await page.getByTestId('drone-1-hp').textContent());
  if (!Number.isFinite(droneOneHp) || droneOneHp <= 0)
    throw new Error('最初のコンボを作るドローンのHPを取得できません。');
  await debugDamageEnemy(page, 'drone-1', droneOneHp);
  const comboAfterDefeat = Number(await combo.textContent());
  expect(comboAfterDefeat).toBeGreaterThan(initialCombo);

  const beforeExpiryMs = GUNSLINGER_COMBO_TIMEOUT_MS - 100;
  await debugDamageEnemy(page, 'basic-1', 1);
  await page.clock.runFor(beforeExpiryMs);
  expect(Number(await combo.textContent())).toBe(comboAfterDefeat);
  await debugDamageEnemy(page, 'basic-1', 1);
  await page.clock.runFor(beforeExpiryMs);
  expect(Number(await combo.textContent())).toBe(comboAfterDefeat);
  await page.clock.runFor(200);
  await expect(combo).toHaveText('0');

  const droneTwoHp = Number(await page.getByTestId('drone-2-hp').textContent());
  if (!Number.isFinite(droneTwoHp) || droneTwoHp <= 0)
    throw new Error('無敵中のコンボを作るドローンのHPを取得できません。');
  await debugDamageEnemy(page, 'drone-2', droneTwoHp);
  const comboBeforeContact = Number(await combo.textContent());
  expect(comboBeforeContact).toBeGreaterThan(initialCombo);

  const playerHpBeforeInvulnerableContact = Number(await playerHp.textContent());
  await movePlayerIntoEnemy(page, 'basic-1', lane.origin, lane.direction);
  expect(Number(await playerHp.textContent())).toBe(playerHpBeforeInvulnerableContact);
  expect(Number(await combo.textContent())).toBe(comboBeforeContact);

  await setPlayerInvulnerable(page, false);
  await movePlayerIntoEnemy(page, 'basic-1', lane.origin, lane.direction);
  expect(Number(await playerHp.textContent())).toBeLessThan(playerHpBeforeInvulnerableContact);
  await expect(combo).toHaveText('0');

  const basicThreeHp = Number(await page.getByTestId('basic-3-hp').textContent());
  if (!Number.isFinite(basicThreeHp) || basicThreeHp <= 0)
    throw new Error('接触cooldown中のコンボを作る基本敵のHPを取得できません。');
  await debugDamageEnemy(page, 'basic-3', basicThreeHp);
  const comboDuringContactCooldown = Number(await combo.textContent());
  const playerHpBeforeContactCooldown = Number(await playerHp.textContent());
  expect(comboDuringContactCooldown).toBeGreaterThan(initialCombo);
  await movePlayerIntoEnemy(page, 'basic-1', lane.origin, lane.direction, true);
  expect(Number(await playerHp.textContent())).toBe(playerHpBeforeContactCooldown);
  expect(Number(await combo.textContent())).toBe(comboDuringContactCooldown);
});

test('自動射撃、ショットガンの発射待ち、リロード、視界遮蔽と再挑戦を確認できる', async ({ page }) => {
  // 80×50マップのLOS検査を含む代表経路に、実時間の余裕を持たせる。
  test.setTimeout(60_000);
  const schedule = createRunSchedule(COMBAT_WAVE_DURATION_MS, 500);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(devStartUrl(`/?restDurationMs=${schedule.restDurationMs}`));
  await setPlayerInvulnerable(page, true);
  const gameCanvas = page.locator('#game canvas');
  await expect(gameCanvas).toBeVisible();
  await page.waitForTimeout(schedule.restDurationMs + 100);
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
  const firstAmmoBox = (await activeAmmoBoxes(page)).find(entry =>
    entry.boxId === `ammo-box-${boxTiles.findIndex(tile => tile.x === firstBox.x && tile.y === firstBox.y) + 1}`);
  if (!firstAmmoBox) throw new Error('種類別弾薬箱の観測値が必要です。');
  const reservesBeforeAmmoPickup = Object.fromEntries(await Promise.all(AMMO_TYPE_ORDER.map(async type => [
    type,
    Number(await page.getByTestId(`ammo-pouch-${type}`).getAttribute('data-reserve')),
  ]))) as Record<(typeof AMMO_TYPE_ORDER)[number], number>;
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, firstBox);
  await expect(page.getByTestId('ammo-box-count')).toHaveText('4');
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  await expect(page.getByTestId('pickup-target')).toHaveText(`${AMMO_TYPES[firstAmmoBox.ammoType].label} ${firstAmmoBox.quantity}発`);
  await expect(page.getByTestId('pickup-action')).toHaveText('を拾う [E]');
  await page.keyboard.press('e');
  await expect(page.getByTestId('ammo-box-count')).toHaveText('3');
  const waitingBoxKeys = await page.getByTestId('ammo-box-count').getAttribute('data-active-tiles');
  expect(tileKeysFromAttribute(waitingBoxKeys)).not.toContain(firstBoxKey);
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', firstBoxKey);
  const ammoPouch = page.getByTestId('ammo-pouch');
  await page.keyboard.press('Tab');
  await expect(ammoPouch).toBeVisible();
  for (const type of AMMO_TYPE_ORDER) {
    const weapon = AMMO_TYPES[type].weapon;
    const expectedReserve = type === firstAmmoBox.ammoType
      ? Math.min(reservesBeforeAmmoPickup[type] + firstAmmoBox.quantity, WEAPONS[weapon].reserveMax)
      : reservesBeforeAmmoPickup[type];
    await expect(page.getByTestId(`ammo-pouch-${type}`)).toHaveAttribute('data-reserve', String(expectedReserve));
  }
  await page.keyboard.press('Tab');
  await expect(ammoPouch).toBeHidden();

  await expect(page.getByTestId('ammo-box-count')).toHaveText('3');
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-active-tiles', waitingBoxKeys ?? '');
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', firstBoxKey);
  await expect(page.getByTestId('ammo-reserve')).toHaveAttribute(
    'data-reserve',
    String(firstAmmoBox.ammoType === 'rifle-ammo'
      ? Math.min(reservesBeforeAmmoPickup['rifle-ammo'] + firstAmmoBox.quantity, WEAPONS.rifle.reserveMax)
      : reservesBeforeAmmoPickup['rifle-ammo']),
  );

  await setArenaPhysics(page, 'pause');
  await collectShotgunPickup(page);
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
  await setPlayerInvulnerable(page, false);
  await setArenaPhysics(page, 'resume');

  await expect(page.getByTestId('defeat')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('wave')).toHaveAttribute('data-state', 'defeat');
  await expect(page.getByTestId('hp')).toHaveText('0');
  await expect.poll(async () => hpBar.evaluate(element => (element as HTMLProgressElement).value)).toBe(0);
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', '');
  expect(await documentBounds(gameCanvas)).toEqual(initialCanvasDocumentBounds);
  await page.getByTestId('retry').click();
  await page.waitForTimeout(schedule.restDurationMs + 100);
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(schedule.combatWaveDurationMs));
  await expect(page.getByTestId('run-panel')).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('run-phase')).toHaveText('夜（戦闘）');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(schedule.combatWaveDurationMs));
  await setArenaPhysics(page, 'pause');
  await expect(page.getByTestId('defeat')).toBeHidden();
  await expect(page.getByTestId('victory')).toBeHidden();
  await expect(page.getByTestId('survival-time')).toHaveText(/^0[67]:\d\d$/);
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
  const schedule = createRunSchedule();
  const { combatWaveDurationMs: combatDurationMs, restDurationMs } = schedule;
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
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(0));
  await expect(runPanel).toHaveAttribute('data-phase', 'preparation');
  await expect(page.getByTestId('run-phase')).toHaveText('昼（準備）');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(restDurationMs));
  for (const id of ENEMY_INSTANCE_IDS)
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'false');
  await expect(page.getByTestId('enemy-current')).toHaveText('0');
  await expect(page.getByTestId('enemy-remaining')).toHaveText('0');
  const preparationWorldItemTiles = new Set(
    (await activeWorldItems(page)).map(({ tile }) => `${tile.x},${tile.y}`),
  );
  await startInitialCombat(page, restDurationMs);
  await expectEnemyHitPointsAndIds(page, 0);
  await expectStrictEnemySpawns(page, INITIAL_ACTIVE_IDS, 'initial');
  for (const { id } of STAGGERED_ENEMIES)
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'false');
  // 固定seedでinitial strict spawnが成功したことを確認してからHUDを比較する。
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(combatDurationMs));
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('run-phase')).toHaveText('夜（戦闘）');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(combatDurationMs));
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
    expect(preparationWorldItemTiles.has(metadata.spawnTile)).toBe(false);
    const spawnTile = parseFloorTile(phaseZeroMap, metadata.spawnTile, `${metadata.stableId}の出現位置`);
    expect(directionFromPlayer(phaseZeroPlayer, spawnTile)).toBe(metadata.assignedDirection);
  });

  await page.clock.fastForward(SPAWN_PHASE_MS - elapsed);
  const phaseOnePrimary = primarySpawnDirection(mapSeed, 1);
  await expect(phaseHud).toHaveText('2');
  await expect(phaseHud).toHaveAttribute('data-phase', '1');
  await expect(primaryHud).toHaveAttribute('data-direction', phaseOnePrimary);
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(combatDurationMs - SPAWN_PHASE_MS));
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(combatDurationMs - SPAWN_PHASE_MS));
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
  expect(preparationWorldItemTiles.has(respawned.spawnTile)).toBe(false);
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
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(combatDurationMs - SPAWN_PHASE_MS * 2));
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(combatDurationMs - SPAWN_PHASE_MS * 2));
  expect(await allEnemySpawnMetadata(page)).toEqual(phaseOne);
  for (const { id, hp } of hitPointsBeforeRest)
    await expect(page.getByTestId(`${id}-hp`)).toHaveText(hp ?? '');

  const combatPanelBackground = await runPanel.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.clock.fastForward(combatDurationMs - SPAWN_PHASE_MS * 2);
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(0));
  await expect(runPanel).toHaveAttribute('data-phase', 'rest');
  await expect(page.getByTestId('run-phase')).toHaveText('昼（休憩）');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(restDurationMs));
  expect(await runPanel.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(combatPanelBackground);
  expect(await allEnemySpawnMetadata(page)).toEqual(phaseOne);
  for (const { id, hp } of hitPointsBeforeRest)
    await expect(page.getByTestId(`${id}-hp`)).toHaveText(hp ?? '');

  await page.clock.fastForward(restDurationMs);
  await expect(page.getByTestId('wave')).toHaveText('2');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(combatDurationMs));
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('run-phase')).toHaveText('夜（戦闘）');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(combatDurationMs));
  expect(await allEnemySpawnMetadata(page)).toEqual(phaseOne);

  await page.getByTestId('retry').dispatchEvent('click');
  await expect(phaseHud).toHaveText('1');
  await expect(phaseHud).toHaveAttribute('data-phase', '0');
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(0));
  await expect(runPanel).toHaveAttribute('data-phase', 'preparation');
  await expect(page.getByTestId('run-phase')).toHaveText('昼（準備）');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(restDurationMs));
  for (const id of ENEMY_INSTANCE_IDS)
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'false');
  await startInitialCombat(page, restDurationMs);
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(combatDurationMs));
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
  await expect(page.getByTestId('run-phase')).toHaveText('夜（戦闘）');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(combatDurationMs));
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
  const schedule = createRunSchedule(1_000, 500);
  const { combatWaveDurationMs, restDurationMs } = schedule;
  const staggerIntervalMs = 500;
  const boundaryMarginMs = 100;
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=1&enemyStaggerIntervalMs=${staggerIntervalMs}&enemySpawnCandidatePool=1&combatWaveDurationMs=${combatWaveDurationMs}&restDurationMs=${restDurationMs}`,
  ));
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
    `combatWaveDurationMs=${combatWaveDurationMs};restDurationMs=${restDurationMs}`,
  );
  await expect(page.getByTestId('survival-time')).toHaveText(formatSurvivalTime(runDurationMs(schedule)));
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(0));
  await expect(runPanel).toHaveAttribute('data-phase', 'preparation');
  await expect(page.getByTestId('run-phase')).toHaveText('昼（準備）');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(restDurationMs));
  for (const id of ENEMY_SPAWN_ORDER) {
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'false');
  }
  await startInitialCombat(page, restDurationMs);
  await expect(page.getByTestId(`${ENEMY_SPAWN_ORDER[0]}-hp`)).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId(`${ENEMY_SPAWN_ORDER[0]}-hp`)).toHaveAttribute('data-spawn-reason', 'initial');
  for (const id of ENEMY_SPAWN_ORDER.slice(1))
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-spawn-reason', 'stagger');

  await page.clock.runFor(staggerIntervalMs + boundaryMarginMs);
  await expect(page.getByTestId(`${ENEMY_SPAWN_ORDER[1]}-hp`)).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId(`${ENEMY_SPAWN_ORDER[1]}-hp`)).toHaveAttribute('data-spawn-reason', 'stagger');
  // frame更新の端数を越えてrestへ入り、境界ちょうどの表示競合を避ける。
  await page.clock.runFor(combatWaveDurationMs - staggerIntervalMs);
  await expect(runPanel).toHaveAttribute('data-phase', 'rest');
  await expect(page.getByTestId('run-phase')).toHaveText('昼（休憩）');
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(0));
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(restDurationMs - boundaryMarginMs));
  await page.clock.runFor(restDurationMs);
  await expect(page.getByTestId('wave')).toHaveText('2');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(combatWaveDurationMs - boundaryMarginMs));
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
});

test('初回combat境界を越えて最初のrestへ大きく進めてもenemy lifecycleを一度だけ開始する', async ({ page }) => {
  const boundaryMarginMs = 100;
  const preparationDurationMs = 500;
  const schedule = createRunSchedule(
    SPAWN_PHASE_MS - preparationDurationMs - boundaryMarginMs * 2,
    preparationDurationMs,
  );
  const firstRestElapsedMs = schedule.restDurationMs + schedule.combatWaveDurationMs + boundaryMarginMs;
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=1&enemyStaggerIntervalMs=30000&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await setArenaPhysics(page, 'pause');
  await setHiddenRecycle(page, false);
  await expect(page.getByTestId('run-panel')).toHaveAttribute('data-phase', 'preparation');
  await expect(page.getByTestId('basic-1-hp')).toHaveAttribute('data-active', 'false');

  await page.clock.fastForward(firstRestElapsedMs);

  await expect(page.getByTestId('run-panel')).toHaveAttribute('data-phase', 'rest');
  await expect(page.getByTestId('basic-1-hp')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('basic-1-hp')).toHaveAttribute('data-spawn-reason', 'initial');
  await expect(page.getByTestId('spawn-phase')).toHaveAttribute('data-phase', '0');
  const initialSpawn = await enemySpawnMetadata(page, 'basic-1');
  await page.clock.runFor(boundaryMarginMs);
  expect(await enemySpawnMetadata(page, 'basic-1')).toEqual(initialSpawn);
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
  const schedule = createRunSchedule();
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl('/'));
  await setArenaPhysics(page, 'pause');
  await startInitialCombat(page, schedule.restDurationMs);
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
  const preCombatGuardDelay = Math.min(oldDeathDelay + 100, schedule.restDurationMs - 1_000);
  await page.clock.runFor(preCombatGuardDelay);
  await expect(retryEnemyHp).toHaveAttribute('data-active', 'false');
  await startInitialCombat(page, schedule.restDurationMs - preCombatGuardDelay);
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
  const schedule = createRunSchedule(1_000, 30_000);
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=1&enemyStaggerIntervalMs=30000&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await setArenaPhysics(page, 'pause');
  await setHiddenRecycle(page, false);
  const target: EnemyId = 'basic-1';
  await startInitialCombat(page, schedule.restDurationMs);
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
  const schedule = createRunSchedule(1_000, 500);
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl(
    `/?combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await setPlayerInvulnerable(page, true);
  await expect(page.getByTestId('survival-time')).toHaveText(formatSurvivalTime(runDurationMs(schedule)));
  const playerTile = page.getByTestId('player-tile');
  const beforeTerminalTile = await playerTile.textContent();
  await page.clock.fastForward(runDurationMs(schedule));
  await expect(page.getByTestId('survival-time')).toHaveText(formatSurvivalTime(0));
  await expect(page.getByTestId('wave')).toHaveText('3');
  await expect(page.getByTestId('wave')).toHaveAttribute('data-state', 'victory');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(0));
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(0));
  await expect(page.getByTestId('victory')).toBeVisible();
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', '');
  await expect(page.getByTestId('defeat')).toBeHidden();
  await page.keyboard.press('2');
  await expect(page.getByTestId('weapon')).toHaveText('アサルトライフル');
  await page.keyboard.down('d');
  await page.clock.fastForward(schedule.restDurationMs);
  await page.keyboard.up('d');
  await expect(playerTile).toHaveText(beforeTerminalTile ?? '');
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('victory')).toBeHidden();
  await expect(page.getByTestId('defeat')).toBeHidden();
  await expect(page.getByTestId('survival-time')).toHaveText(formatSurvivalTime(runDurationMs(schedule)));
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave')).toHaveAttribute('data-state', 'playing');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(0));
  await expect(page.getByTestId('run-panel')).toHaveAttribute('data-phase', 'preparation');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(schedule.restDurationMs));
  await expect(page.getByTestId('enemy-current')).toHaveText('0');
  await startInitialCombat(page, schedule.restDurationMs);
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
  const initialWorldItemTiles = new Set(
    (await activeWorldItems(page)).map(({ tile }) => `${tile.x},${tile.y}`),
  );
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
  const initialBox = (await activeAmmoBoxes(page)).find(entry => entry.boxId === boxId);
  if (!initialBox) throw new Error('初期種類別弾薬箱が必要です。');
  expect(initialBox.quantity).toBe(AMMO_TYPES[initialBox.ammoType].boxQuantity);
  expect(initialBox.worldColor).toBe(AMMO_TYPES[initialBox.ammoType].worldColor);
  expect(initialBox.texture).toBe(`ammo-box-${initialBox.ammoType}`);
  await collectAmmoBoxWithClock(page, firstBox, boxCount);
  await expect(boxCount).toHaveText('3');
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', boxId);
  await expect(boxCount).toHaveAttribute('data-respawn-tiles', firstBoxKey);
  await setArenaPhysics(page, 'pause');
  await page.clock.runFor(AMMO_BOX_RESPAWN_MS);
  await expect.poll(async () => boxCount.textContent()).toBe('4');
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', '');
  const activeEntries = await activeAmmoBoxes(page);
  const respawnedEntry = activeEntries.find(entry => entry.boxId === boxId);
  if (!respawnedEntry) throw new Error('復活した種類別弾薬箱のboxIdが必要です。');
  const respawnedKey = `${respawnedEntry.tile.x},${respawnedEntry.tile.y}`;
  expect(respawnedKey).not.toBe(firstBoxKey);
  expect(respawnedEntry.ammoType).toBe(initialBox.ammoType);
  expect(respawnedEntry.quantity).toBe(AMMO_TYPES[initialBox.ammoType].boxQuantity);
  expect(respawnedEntry.worldColor).toBe(initialBox.worldColor);
  expect(respawnedEntry.texture).toBe(initialBox.texture);
  expect(initialWorldItemTiles.has(respawnedKey)).toBe(false);
  const [x, y] = respawnedKey.split(',').map(Number);
  expect(map.tiles[y][x]).toBe('floor');
  expect(findPath(map, map.start, { x, y }).length).toBeGreaterThan(0);
  expect((await boxCount.getAttribute('data-offscreen-boxes'))?.split('|')).toContain(boxId);
  expect(new Set(activeEntries.map(entry => entry.boxId)).size).toBe(activeEntries.length);
});

test('victoryとretryは弾薬箱の復活待ちをclearし、新しいrunを初期化する', async ({ page }) => {
  test.setTimeout(120_000);
  const schedule = createRunSchedule(10_000, 5_000);
  await page.clock.install({ time: 0 });
  await page.clock.setFixedTime(15);
  const terminalRunDurationMs = runDurationMs(schedule);
  await page.goto(devStartUrl(
    `/?combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
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
  await expect(page.getByTestId('survival-time')).toHaveText(formatSurvivalTime(terminalRunDurationMs));
  await expectAmmoBoxCount(boxCount, 4);
  await expect(boxCount).toHaveAttribute('data-respawn-boxes', '');
});
