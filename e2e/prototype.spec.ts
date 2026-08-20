import { expect, test } from '@playwright/test';
import { ARENA_HEIGHT_TILES, ARENA_WIDTH_TILES, SPAWN_PHASE_MS, TILE_SIZE, WORLD_WEAPON_DROP_MAX_PATH_DISTANCE, enemyVisibility, findPath, generateArenaMap, hasLineOfSight, hiddenRecycleThresholdFor, primarySpawnDirection, recycleDelayFor, respawnDelayFor, selectAmmoBoxTiles, spawnDirectionForSlot, type SpawnDirection, type TilePosition, viewportTileRect } from '../src/arena-map';
import { formatSurvivalTime } from '../src/arena/hud';
import { INITIAL_WORLD_WEAPON_MODELS, SCRAP_DROP_AMOUNTS, SCRAP_VISUAL_TIER_THRESHOLDS, WORLD_SIDEARM_MODELS, scrapVisualTierFor } from '../src/game-data';
import { GUNSLINGER_BOOT_KNIFE_DAMAGE, GUNSLINGER_COMBO_PER_EVENT, GUNSLINGER_COMBO_TIMEOUT_MS, PLAYER_DASH_DURATION_MS } from '../src/player-data';
import { AMMO_BOX_RESPAWN_MS, AMMO_MATERIAL_BOX_CYCLE, AMMO_MATERIAL_ORDER, AMMO_MATERIALS, COMBAT_WAVE_DURATION_MS, ENEMY_INSTANCE_IDS, WEAPON_MODELS, WEAPONS, createRunSchedule, runDurationMs, type AmmoMaterial, type WeaponModel } from '../src/rules';

type EnemyId = (typeof ENEMY_INSTANCE_IDS)[number];
type EnemyPresentation = 'normal' | 'boundary' | 'hidden';
type WorldItemEntry = {
  id: string;
  kind: 'weapon' | 'material' | 'ammo-material';
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
  material: AmmoMaterial;
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
type ArenaDebugBody = {
  x: number;
  y: number;
  active?: boolean;
  enable?: boolean;
  width?: number;
  height?: number;
  reset: (x: number, y: number) => void;
};
type ArenaDebugEnemy = {
  active: boolean;
  x: number;
  y: number;
  body?: ArenaDebugBody;
  setPosition: (x: number, y: number) => ArenaDebugEnemy;
  setVelocity: (x: number, y: number) => ArenaDebugEnemy;
};
type ArenaDebugPlayer = {
  x: number;
  y: number;
  rotation: number;
  tintTopLeft: number;
  body?: ArenaDebugBody;
  setPosition: (x: number, y: number) => ArenaDebugPlayer;
  setVelocity: (x: number, y: number) => ArenaDebugPlayer;
};
type AcousticNodeDebug = {
  nodeId: string;
  arrivalCost: number;
  remainingStrength: number;
  predecessorNodeId?: string;
};
type AcousticTileDebug = {
  tile: TilePosition;
  nodeId: string;
  arrivalCost: number;
  intraNodeDistance: number;
  alpha: number;
};
type AcousticWaveDebug = {
  snapshot: {
    revision: number;
    source: TilePosition;
    sourceNodeId: string;
    nodes: readonly AcousticNodeDebug[];
  };
  renderSnapshot: {
    revision: number;
    tiles: readonly AcousticTileDebug[];
  };
};
type AcousticWaveViewDebug = {
  tiles: readonly AcousticTileDebug[];
  profile: { minimapAlpha: number };
};
type ArenaDebugScene = {
  physics: { pause: () => void; resume: () => void };
  time: { now: number };
  scene: { setVisible: (value: boolean) => unknown };
  cameras: { main: { worldView: { left: number; top: number; right: number; bottom: number } } };
  children: { getChildren: () => readonly { fillColor?: number }[] };
  walls: { getChildren: () => readonly { active: boolean; x: number; y: number; body?: ArenaDebugBody }[] };
  wallArt: { commandBuffer: readonly unknown[] };
  player: ArenaDebugPlayer;
  topology: {
    width: number;
    height: number;
    tileSize: number;
    tiles: readonly (readonly ('wall' | 'floor')[])[];
    revision: number;
  };
  areaGraph: {
    revision: number;
    nodes: readonly { id: string; kind: 'area' | 'junction' | 'corridor'; neighborIds: readonly string[] }[];
    tileNodeIds: readonly (readonly (string | undefined)[])[];
  };
  activeSoundWaves: readonly AcousticWaveDebug[];
  soundWaveViews: readonly AcousticWaveViewDebug[];
  playerDash?: { startX: number; startY: number; soundEmitted: boolean };
  playerDashCooldownUntil: number;
  observedTiles: { get: (key: string) => 'wall' | 'floor' | undefined };
  visibleTileKeys: { has: (key: string) => boolean };
  state: {
    inventory: {
      quickSlots: readonly ({ id: string; model: WeaponModel; magazine: number; nextFireAt: number } | null)[];
      materials: Record<AmmoMaterial, number>;
    };
    enemies: Record<EnemyId, { hp: number; maxHp: number; defeated: boolean }>;
  };
  enemyActors: Record<EnemyId, { active: boolean; sprite: ArenaDebugEnemy }>;
  textures: { get: (key: string) => { getSourceImage: () => HTMLCanvasElement } };
  debugRespawnEnemy: (id: EnemyId) => void;
  debugSetHiddenRecycleEnabled: (enabled: boolean) => void;
  debugSetPlayerInvulnerable: (enabled: boolean) => void;
  debugMovePlayerTo: (tile: TilePosition) => void;
  debugMoveWorldItemTo: (id: string, tile: TilePosition) => void;
  debugOpenWall: (tile: TilePosition) => void;
  debugDamageEnemy: (id: EnemyId, amount: number) => void;
  refreshHud: () => void;
  updateMinimap: () => void;
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
      || (kind !== 'weapon' && kind !== 'material' && kind !== 'ammo-material')
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
    const [boxId, tile, material, quantity, worldColor, texture] = entry.split(':');
    const [x, y] = tile?.split(',').map(Number) ?? [];
    if (
      !boxId
      || !AMMO_MATERIAL_ORDER.includes(material as AmmoMaterial)
      || !Number.isInteger(x)
      || !Number.isInteger(y)
      || !Number.isSafeInteger(Number(quantity))
      || !worldColor
      || !texture
    ) throw new Error(`弾薬箱の観測値が不正です: ${entry}`);
    return {
      boxId,
      tile: { x, y },
      material: material as AmmoMaterial,
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
    const enemy = scene.enemyActors[enemyId].sprite;
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

function findRuntimeWallOpening(map: ReturnType<typeof generateArenaMap>): {
  wall: TilePosition;
  floor: TilePosition;
  key: 'w' | 'a' | 's' | 'd';
} {
  const reserve = map.centralReserve;
  const directions: readonly { x: number; y: number; key: 'w' | 'a' | 's' | 'd' }[] = [
    { x: 1, y: 0, key: 'd' },
    { x: -1, y: 0, key: 'a' },
    { x: 0, y: 1, key: 's' },
    { x: 0, y: -1, key: 'w' },
  ];
  for (let y = 1; y < map.height - 1; y += 1)
    for (let x = 1; x < map.width - 1; x += 1) {
      const inReserve = reserve
        && x >= reserve.bounds.left
        && x <= reserve.bounds.right
        && y >= reserve.bounds.top
        && y <= reserve.bounds.bottom;
      if (map.tiles[y][x] !== 'wall' || inReserve)
        continue;
      for (const direction of directions) {
        const floor = { x: x - direction.x, y: y - direction.y };
        if (map.tiles[floor.y]?.[floor.x] === 'floor')
          return { wall: { x, y }, floor, key: direction.key };
      }
    }
  throw new Error('runtime topology E2E用の通常wallが見つかりません。');
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
      const enemy = scene.enemyActors[enemyId].sprite;
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

test('Issue #64: 中央予約とミニマップは探索済みterrainと現在可視のworld markerを表示する', async ({ page }) => {
  await page.goto(devStartUrl('/?enemyInitialCount=0'));
  await expect(page.locator('#game canvas')).toBeVisible();
  const minimap = page.getByTestId('minimap');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const reserve = map.centralReserve;
  if (!reserve)
    throw new Error('標準アリーナの中央予約metadataが必要です。');
  for (let y = reserve.bounds.top; y <= reserve.bounds.bottom; y += 1)
    for (let x = reserve.bounds.left; x <= reserve.bounds.right; x += 1)
      expect(map.tiles[y][x]).toBe('wall');
  for (const approach of Object.values(reserve.approaches)) {
    expect(map.tiles[approach.y][approach.x]).toBe('floor');
    expect(findPath(map, map.start, approach).length).toBeGreaterThan(0);
  }

  const initiallyVisible = map.width * map.height - expectedObscuredTileCount(map, map.start);
  await expect(minimap).toHaveAttribute('data-width', String(map.width));
  await expect(minimap).toHaveAttribute('data-height', String(map.height));
  await expect(minimap).toHaveAttribute('data-observed-tiles', String(initiallyVisible));
  const hiddenWeapon = (await activeWorldItems(page)).find(item =>
    item.kind === 'weapon' && !hasLineOfSight(map, map.start, item.tile),
  );
  if (!hiddenWeapon)
    throw new Error('探索後の可視marker確認用に、開始地点から見えないworld weaponが必要です。');

  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, hiddenWeapon.tile);
  await expect.poll(async () => Number(await minimap.getAttribute('data-observed-tiles')))
    .toBeGreaterThan(initiallyVisible);
  const marker = `weapon:${hiddenWeapon.tile.x},${hiddenWeapon.tile.y}`;
  await expect.poll(async () => (await minimap.getAttribute('data-visible-markers'))?.split('|').includes(marker) ?? false)
    .toBe(true);

  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, map.start);
  await expect.poll(async () => (await minimap.getAttribute('data-visible-markers'))?.split('|').includes(marker) ?? false)
    .toBe(false);
});

test('Issue #64: retryはミニマップ探索を初期化し、表示はキーボード入力を妨げない', async ({ page }) => {
  const schedule = createRunSchedule(1_000, 500);
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=0&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await expect(page.locator('#game canvas')).toBeVisible();
  const minimap = page.getByTestId('minimap');
  expect(await page.locator('#minimap-panel').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');

  const playerTile = page.getByTestId('player-tile');
  const initialPlayerTile = await playerTile.textContent();
  await page.keyboard.down('d');
  try {
    await page.clock.runFor(500);
    await expect(playerTile).not.toHaveText(initialPlayerTile ?? '', { timeout: 2_000 });
  } finally {
    await page.keyboard.up('d');
  }

  const previousSeed = await page.getByTestId('map-seed').textContent();
  await page.clock.fastForward(runDurationMs(schedule));
  await expect(page.getByTestId('victory')).toBeVisible();
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('map-seed')).not.toHaveText(previousSeed ?? '');
  const retryMap = generateArenaMap(Number(await page.getByTestId('map-seed').textContent()));
  const expectedVisible = retryMap.width * retryMap.height - expectedObscuredTileCount(retryMap, retryMap.start);
  await expect(playerTile).toHaveText(`${retryMap.start.x},${retryMap.start.y}`);
  await expect(minimap).toHaveAttribute('data-observed-tiles', String(expectedVisible));
  await expect(minimap).toHaveAttribute('data-visible-tiles', String(expectedVisible));
});

test('Issue #98 / #100: DEVの通常wall変更はcurrent terrainとarea graphを更新する', async ({ page }) => {
  const schedule = createRunSchedule(1_000, 500);
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=1&enemyStaggerIntervalMs=5000&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await expect(page.locator('#game canvas')).toBeVisible();
  await startInitialCombat(page, schedule.restDurationMs);
  const activeEnemyId: EnemyId = 'basic-1';
  await expect(page.getByTestId(`${activeEnemyId}-hp`)).toHaveAttribute('data-active', 'true');
  await setHiddenRecycle(page, false);
  await setPlayerInvulnerable(page, true);
  await setArenaPhysics(page, 'pause');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const { wall, floor, key } = findRuntimeWallOpening(map);
  const worldItemsBefore = await activeWorldItems(page);
  const ammoBoxesBefore = await activeAmmoBoxes(page);
  const inventoryBefore = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return scene.state.inventory;
  });

  const opened = await page.evaluate(({ floor, wall, enemyId }) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    const actor = scene.enemyActors[enemyId];
    const sprite = actor.sprite;
    const body = sprite.body;
    if (!body) throw new Error(`${enemyId}のArcade Bodyが必要です。`);
    const enemySnapshot = () => {
      const currentBody = sprite.body;
      if (!currentBody) throw new Error(`${enemyId}のArcade Bodyが必要です。`);
      const enemy = scene.state.enemies[enemyId];
      return {
        actorActive: actor.active,
        spriteActive: sprite.active,
        bodyEnabled: Boolean(currentBody.enable),
        bodyActive: Boolean(currentBody.active),
        bodyWidth: Number(currentBody.width),
        bodyHeight: Number(currentBody.height),
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        defeated: enemy.defeated,
      };
    };
    const minimapPixel = () => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="minimap"]');
      if (!canvas) throw new Error('ミニマップCanvasが見つかりません。');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('ミニマップCanvasの2D contextがありません。');
      const x = Math.min(canvas.width - 1, Math.floor((wall.x + 0.5) * canvas.width / scene.topology.width));
      const y = Math.min(canvas.height - 1, Math.floor((wall.y + 0.5) * canvas.height / scene.topology.height));
      return Array.from(context.getImageData(x, y, 1, 1).data);
    };
    scene.debugMovePlayerTo(floor);
    scene.updateMinimap();
    const minimapPixelBefore = minimapPixel();
    const wallArt = scene.wallArt;
    const wallArtCommandCount = wallArt.commandBuffer.length;
    const enemyBefore = enemySnapshot();
    const areaGraph = scene.areaGraph;
    scene.debugOpenWall(wall);
    const centerX = wall.x * scene.topology.tileSize + scene.topology.tileSize / 2;
    const centerY = wall.y * scene.topology.tileSize + scene.topology.tileSize / 2;
    return {
      topology: scene.topology,
      areaGraph: {
        sameSnapshot: scene.areaGraph === areaGraph,
        revision: scene.areaGraph.revision,
        node: (() => {
          const nodeId = scene.areaGraph.tileNodeIds[wall.y]?.[wall.x];
          return nodeId === undefined ? undefined : scene.areaGraph.nodes.find(candidate => candidate.id === nodeId);
        })(),
      },
      observed: scene.observedTiles.get(`${wall.x},${wall.y}`),
      visible: scene.visibleTileKeys.has(`${wall.x},${wall.y}`),
      hasWallCollider: scene.walls.getChildren().some(candidate =>
        candidate.active && candidate.x === centerX && candidate.y === centerY),
      inventory: scene.state.inventory,
      enemy: {
        sameActor: scene.enemyActors[enemyId] === actor,
        sameSprite: scene.enemyActors[enemyId].sprite === sprite,
        sameBody: scene.enemyActors[enemyId].sprite.body === body,
        before: enemyBefore,
        after: enemySnapshot(),
      },
      minimapPixelBefore,
      minimapPixelAfter: minimapPixel(),
      wallArtRebuilt: scene.wallArt !== wallArt,
      wallArtCommandCountBefore: wallArtCommandCount,
      wallArtCommandCountAfter: scene.wallArt.commandBuffer.length,
    };
  }, { floor, wall, enemyId: activeEnemyId });

  expect(opened.topology.revision).toBe(1);
  expect(opened.topology.tiles[wall.y]?.[wall.x]).toBe('floor');
  expect(opened.areaGraph.sameSnapshot).toBe(false);
  expect(opened.areaGraph.revision).toBe(opened.topology.revision);
  expect(opened.areaGraph.node?.kind).toMatch(/^(area|junction|corridor)$/);
  expect(map.tiles[wall.y][wall.x]).toBe('wall');
  expect(findPath(opened.topology, floor, wall)).toEqual([floor, wall]);
  expect(opened.observed).toBe('floor');
  expect(opened.visible).toBe(true);
  expect(opened.hasWallCollider).toBe(false);
  expect(opened.enemy.sameActor).toBe(true);
  expect(opened.enemy.sameSprite).toBe(true);
  expect(opened.enemy.sameBody).toBe(true);
  expect(opened.enemy.after).toEqual(opened.enemy.before);
  expect(opened.minimapPixelAfter).not.toEqual(opened.minimapPixelBefore);
  expect(opened.wallArtRebuilt).toBe(true);
  expect(opened.wallArtCommandCountAfter).toBeLessThan(opened.wallArtCommandCountBefore);
  expect(opened.inventory).toEqual(inventoryBefore);
  expect(await activeWorldItems(page)).toEqual(worldItemsBefore);
  expect(await activeAmmoBoxes(page)).toEqual(ammoBoxesBefore);

  await setArenaPhysics(page, 'resume');
  await page.keyboard.down(key);
  try {
    await page.clock.runFor(140);
    await expect(page.getByTestId('player-tile')).toHaveText(`${wall.x},${wall.y}`);
  } finally {
    await page.keyboard.up(key);
  }

  const previousSeed = await page.getByTestId('map-seed').textContent();
  await page.clock.fastForward(runDurationMs(schedule));
  await expect(page.getByTestId('victory')).toBeVisible();
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('map-seed')).not.toHaveText(previousSeed ?? '');
  const retryMap = generateArenaMap(Number(await page.getByTestId('map-seed').textContent()));
  const retried = await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return {
      revision: scene.topology.revision,
      tile: scene.topology.tiles[tile.y]?.[tile.x],
      areaGraphRevision: scene.areaGraph.revision,
    };
  }, wall);
  expect(retried.revision).toBe(0);
  expect(retried.areaGraphRevision).toBe(0);
  expect(retried.tile).toBe(retryMap.tiles[wall.y][wall.x]);
});

test('Issue #102: 成功射撃はnode音響snapshotをworldとminimapへ同じviewで渡し、retryでclearする', async ({ page }) => {
  await page.goto(devStartUrl('/?enemyInitialCount=0&enemyStaggerIntervalMs=5000'));
  await expect(page.locator('#game canvas')).toBeVisible();
  await setPlayerInvulnerable(page, true);
  await aimPlayer(page, { x: 1, y: 0 });
  const ammoBefore = await currentAmmo(page);
  await page.mouse.down();
  try {
    await page.evaluate(() => new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  } finally {
    await page.mouse.up();
  }
  await expect.poll(async () => page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return scene.activeSoundWaves.length;
  })).toBeGreaterThan(0);
  const observed = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.updateMinimap();
    const wave = scene.activeSoundWaves.at(-1);
    if (!wave) throw new Error('成功射撃の音響snapshotを観測できません。');
    const reached = new Set(wave.snapshot.nodes.map(node => node.nodeId));
    const nodes = new Map(scene.areaGraph.nodes.map(node => [node.id, node]));
    const predecessorValid = wave.snapshot.nodes.every((node) => {
      if (node.nodeId === wave.snapshot.sourceNodeId)
        return node.arrivalCost === 0 && node.predecessorNodeId === undefined;
      return node.predecessorNodeId !== undefined
        && reached.has(node.predecessorNodeId)
        && nodes.get(node.nodeId)?.neighborIds.includes(node.predecessorNodeId) === true;
    });
    const currentViewTiles = scene.soundWaveViews.flatMap(view => view.tiles);
    const minimap = document.querySelector<HTMLCanvasElement>('[data-testid="minimap"]');
    const context = minimap?.getContext('2d');
    if (!minimap || !context) throw new Error('既存minimap Canvasを観測できません。');
    const tileWidth = minimap.width / scene.topology.width;
    const tileHeight = minimap.height / scene.topology.height;
    const expectedWaveRects = scene.soundWaveViews.flatMap(view => view.tiles.flatMap((entry) => {
      if (scene.observedTiles.get(`${entry.tile.x},${entry.tile.y}`) === undefined)
        return [];
      return [{
        x: entry.tile.x * tileWidth + Math.max(1, tileWidth * 0.14),
        y: entry.tile.y * tileHeight + Math.max(1, tileHeight * 0.14),
        width: Math.max(2, tileWidth * 0.72),
        height: Math.max(2, tileHeight * 0.72),
        alpha: view.profile.minimapAlpha * entry.alpha,
      }];
    }));
    const soundLayerFillRects: { x: number; y: number; width: number; height: number; alpha: number }[] = [];
    const originalFillRect = context.fillRect.bind(context);
    const originalSave = context.save.bind(context);
    const originalRestore = context.restore.bind(context);
    let inSoundLayer = false;
    context.save = (): void => {
      originalSave();
      inSoundLayer = true;
    };
    context.restore = (): void => {
      originalRestore();
      inSoundLayer = false;
    };
    context.fillRect = (x, y, width, height): void => {
      if (inSoundLayer)
        soundLayerFillRects.push({ x, y, width, height, alpha: context.globalAlpha });
      originalFillRect(x, y, width, height);
    };
    try {
      scene.updateMinimap();
    } finally {
      context.fillRect = originalFillRect;
      context.save = originalSave;
      context.restore = originalRestore;
    }
    return {
      topologyRevision: scene.topology.revision,
      graphRevision: scene.areaGraph.revision,
      snapshotRevision: wave.snapshot.revision,
      renderRevision: wave.renderSnapshot.revision,
      sourceNodeMatches: scene.areaGraph.tileNodeIds[wave.snapshot.source.y]?.[wave.snapshot.source.x] === wave.snapshot.sourceNodeId,
      reachedNodesKnown: wave.snapshot.nodes.every(node => nodes.has(node.nodeId)),
      predecessorValid,
      renderIsReachedSubset: wave.renderSnapshot.tiles.every(tile => reached.has(tile.nodeId)),
      worldViewIsRenderSubset: currentViewTiles.every(tile => reached.has(tile.nodeId)),
      sourceWasObserved: scene.observedTiles.get(`${wave.snapshot.source.x},${wave.snapshot.source.y}`) !== undefined,
      expectedWaveRects,
      soundLayerFillRects,
    };
  });
  expect(await currentAmmo(page)).toBeLessThan(ammoBefore);
  expect(observed.graphRevision).toBe(observed.topologyRevision);
  expect(observed.snapshotRevision).toBe(observed.topologyRevision);
  expect(observed.renderRevision).toBe(observed.topologyRevision);
  expect(observed.sourceNodeMatches).toBe(true);
  expect(observed.reachedNodesKnown).toBe(true);
  expect(observed.predecessorValid).toBe(true);
  expect(observed.renderIsReachedSubset).toBe(true);
  expect(observed.worldViewIsRenderSubset).toBe(true);
  expect(observed.sourceWasObserved).toBe(true);
  expect(observed.expectedWaveRects).not.toHaveLength(0);
  expect(observed.soundLayerFillRects).toEqual(observed.expectedWaveRects);

  await page.getByTestId('retry').dispatchEvent('click');
  await expect.poll(async () => page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return {
      active: scene.activeSoundWaves.length,
      views: scene.soundWaveViews.length,
    };
  })).toEqual({ active: 0, views: 0 });
});

test('Issue #102: dashは実移動を確認した時だけ一度だけ音を発生させる', async ({ page }) => {
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl('/?enemyInitialCount=0&enemyStaggerIntervalMs=5000'));
  await expect(page.locator('#game canvas')).toBeVisible();
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const lane = findDashLane(generateArenaMap(mapSeed));
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, lane.origin);
  await page.clock.runFor(1);
  await aimPlayer(page, lane.direction);
  const beforeSuccessfulDash = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return { waveCount: scene.activeSoundWaves.length, x: scene.player.x, y: scene.player.y };
  });
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await page.clock.runFor(PLAYER_DASH_DURATION_MS + 1);
  const successfulDash = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return { waveCount: scene.activeSoundWaves.length, dashActive: scene.playerDash !== undefined, x: scene.player.x, y: scene.player.y };
  });
  expect(successfulDash.waveCount).toBe(beforeSuccessfulDash.waveCount + 1);
  expect(successfulDash.dashActive).toBe(false);
  expect(successfulDash.x !== beforeSuccessfulDash.x || successfulDash.y !== beforeSuccessfulDash.y).toBe(true);
});

test('Issue #102: 壁密着dashは移動も音波も発生させずdurationで終了する', async ({ page }) => {
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl('/?enemyInitialCount=0&enemyStaggerIntervalMs=5000'));
  await expect(page.locator('#game canvas')).toBeVisible();
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const blocked = findRuntimeWallOpening(generateArenaMap(mapSeed));
  const directions = {
    w: { x: 0, y: -1 },
    a: { x: -1, y: 0 },
    s: { x: 0, y: 1 },
    d: { x: 1, y: 0 },
  } as const;
  const direction = directions[blocked.key];
  await page.evaluate(({ floor, wall, dashDirection }) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(floor);
    const body = scene.player.body;
    const tileSize = scene.topology.tileSize;
    const wallSprite = scene.walls.getChildren().find(candidate =>
      candidate.x === wall.x * tileSize + tileSize / 2 && candidate.y === wall.y * tileSize + tileSize / 2);
    const wallBody = wallSprite?.body;
    if (!body?.width || !body.height || !wallBody?.width || !wallBody.height)
      throw new Error('wall密着dashにはplayerとwallのbodyサイズが必要です。');
    const targetBodyX = dashDirection.x > 0
      ? wallBody.x - body.width
      : dashDirection.x < 0 ? wallBody.x + wallBody.width : body.x;
    const targetBodyY = dashDirection.y > 0
      ? wallBody.y - body.height
      : dashDirection.y < 0 ? wallBody.y + wallBody.height : body.y;
    const x = targetBodyX - (body.x - scene.player.x);
    const y = targetBodyY - (body.y - scene.player.y);
    scene.player.setPosition(x, y).setVelocity(0, 0);
    body.reset(x, y);
  }, { floor: blocked.floor, wall: blocked.wall, dashDirection: direction });
  await page.evaluate((dashDirection) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    const arena = scene as unknown as {
      updateAimDirection: (pointer: { worldX: number; worldY: number }) => void;
    };
    arena.updateAimDirection({
      worldX: scene.player.x + dashDirection.x * scene.topology.tileSize,
      worldY: scene.player.y + dashDirection.y * scene.topology.tileSize,
    });
  }, direction);
  const beforeBlockedDash = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return { waveCount: scene.activeSoundWaves.length, cooldownUntil: scene.playerDashCooldownUntil };
  });
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  const startedBlockedDash = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return scene.playerDashCooldownUntil;
  });
  expect(startedBlockedDash).toBeGreaterThan(beforeBlockedDash.cooldownUntil);
  await page.clock.runFor(PLAYER_DASH_DURATION_MS + 1);
  const blockedDash = await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    return {
      waveCount: scene.activeSoundWaves.length,
      dashActive: scene.playerDash !== undefined,
      tile: {
        x: Math.floor(scene.player.x / scene.topology.tileSize),
        y: Math.floor(scene.player.y / scene.topology.tileSize),
      },
    };
  });
  expect(blockedDash).toEqual({
    waveCount: beforeBlockedDash.waveCount,
    dashActive: false,
    tile: blocked.floor,
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
    materialQuantity: string | null;
    reload: string | null;
    reloadProgressHidden: boolean;
    reloadProgressValue: number;
  }> => ({
    magazine: await currentAmmo(page),
    materialQuantity: await page.getByTestId('ammo-material').getAttribute('data-quantity'),
    reload: await reloadHud.textContent(),
    reloadProgressHidden: await reloadProgress.isHidden(),
    reloadProgressValue: await reloadProgress.evaluate(element =>
      (element as HTMLProgressElement).value),
  });
  const expectSelectedAmmoState = async (before: {
    magazine: number;
    materialQuantity: string | null;
    reload: string | null;
    reloadProgressHidden: boolean;
    reloadProgressValue: number;
  }): Promise<void> => {
    expect(await currentAmmo(page)).toBe(before.magazine);
    expect(await page.getByTestId('ammo-material').getAttribute('data-quantity')).toBe(before.materialQuantity);
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
    const rifle = scene.state.inventory.quickSlots[0];
    if (!rifle || rifle.model !== 'rifle') throw new Error('初期ライフルinstanceが必要です。');
    rifle.magazine = 0;
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
  expect(await page.getByTestId('ammo-material').getAttribute('data-quantity'))
    .toBe(emptyRifleBeforeBlockedHold.materialQuantity);
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
  const emptyShotgunMaterial = await page.getByTestId('ammo-material').getAttribute('data-quantity');
  const emptyShotgunReloadProgressWasHidden = await reloadProgress.isHidden();
  const emptyShotgunReloadProgressValueBefore = await reloadProgress.evaluate(element =>
    (element as HTMLProgressElement).value);
  await expect(reloadHud).toHaveText('待機');
  await expect(reloadProgress).toBeHidden();
  await page.keyboard.press('Tab');
  const emptyShotgunCanvasPoint = await findGameCanvasInputPoint(page);
  await clickGameCanvasAt(page, emptyShotgunCanvasPoint);
  expect(await currentAmmo(page)).toBe(0);
  expect(await page.getByTestId('ammo-material').getAttribute('data-quantity')).toBe(emptyShotgunMaterial);
  await expect(reloadHud).toHaveText('待機');
  expect(await reloadProgress.isHidden()).toBe(emptyShotgunReloadProgressWasHidden);
  expect(await reloadProgress.evaluate(element => (element as HTMLProgressElement).value))
    .toBe(emptyShotgunReloadProgressValueBefore);
  await holdGameCanvasAt(page, emptyShotgunCanvasPoint, WEAPONS.shotgun.fireIntervalMs);
  expect(await currentAmmo(page)).toBe(0);
  expect(await page.getByTestId('ammo-material').getAttribute('data-quantity')).toBe(emptyShotgunMaterial);
  await expect(reloadHud).toHaveText('待機');
  expect(await reloadProgress.isHidden()).toBe(emptyShotgunReloadProgressWasHidden);
  expect(await reloadProgress.evaluate(element => (element as HTMLProgressElement).value))
    .toBe(emptyShotgunReloadProgressValueBefore);
  await page.keyboard.press('Tab');
  await clickGameCanvasAt(page, emptyShotgunCanvasPoint);
  await expect(reloadHud).toContainText('リロード中');
  await expect(reloadProgress).toBeVisible();
  expect(await currentAmmo(page)).toBe(0);
  expect(await page.getByTestId('ammo-material').getAttribute('data-quantity')).toBe(emptyShotgunMaterial);
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
  expect(WEAPONS[duplicateModel].material).toBe('ballistic-material');
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
  for (const material of AMMO_MATERIAL_ORDER) {
    const ammo = AMMO_MATERIALS[material];
    const pouchEntry = page.getByTestId(`ammo-pouch-${material}`);
    await expect(pouchEntry).toHaveAttribute('data-material', material);
    await expect(pouchEntry).toHaveAttribute('data-quantity', /^\d+$/);
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

test('弾薬ポーチの素材をworldへ置き、Eで回収できる', async ({ page }) => {
  test.setTimeout(30_000);
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl('/'));
  await setArenaPhysics(page, 'pause');
  const material: AmmoMaterial = 'projectile-material';
  const ammo = AMMO_MATERIALS[material];
  const droppedQuantity = Math.max(1, Math.floor(ammo.boxQuantity / 2));
  if (droppedQuantity >= ammo.boxQuantity)
    throw new Error('less-than-chunk確認には弾薬箱の設定量が2以上必要です。');
  await page.evaluate(({ material, quantity }) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.state.inventory.materials[material] = quantity;
    scene.refreshHud();
  }, { material, quantity: droppedQuantity });

  await page.keyboard.press('Tab');
  const pouchEntry = page.getByTestId(`ammo-pouch-${material}`);
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
  await expect(pouchEntry).toHaveAttribute('data-quantity', '0');
  const selectedAmmoBeforeClose = await currentAmmo(page);
  const selectedMaterialBeforeClose = await page.getByTestId('ammo-material').getAttribute('data-quantity');
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
    expect(await page.getByTestId('ammo-material').getAttribute('data-quantity'))
      .toBe(selectedMaterialBeforeClose);
    expect(await reloadHud.textContent()).toBe(reloadBeforeClose);
    expect(await reloadProgress.isHidden()).toBe(reloadProgressWasHidden);
    expect(await reloadProgress.evaluate(element => (element as HTMLProgressElement).value))
      .toBe(reloadProgressBeforeClose);
  } finally {
    await page.mouse.up();
  }
  await holdGameCanvasAt(page, canvasPoint, WEAPONS.rifle.fireIntervalMs);
  await expect.poll(() => currentAmmo(page)).toBeLessThan(selectedAmmoBeforeClose);

  const dropped = (await activeWorldItems(page)).find(item => item.id.startsWith('dropped-ammo-material-'));
  if (!dropped || dropped.kind !== 'ammo-material')
    throw new Error('worldへ置いた素材が必要です。');
  expect(dropped.item).toBe(material);
  expect(dropped.quantity).toBe(droppedQuantity);
  expect(dropped.quantity).toBeLessThan(ammo.boxQuantity);
  expect(dropped.worldColor).toBe(ammo.worldColor);
  expect(dropped.texture).toBe(`material-box-${material}`);
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  await expect(page.getByTestId('pickup-target')).toHaveText(`${ammo.label} ${dropped.quantity}個`);
  await expect(page.getByTestId('pickup-action')).toHaveText('を拾う [E]');
  await page.keyboard.press('e');
  expect((await activeWorldItems(page)).some(item => item.id === dropped.id)).toBe(false);
  await expect(pouchEntry).toHaveAttribute('data-quantity', String(droppedQuantity));
});

test('Issue #77: 連弩と火炎放射器は対応マテリアルからreloadして発射できる', async ({ page }) => {
  test.setTimeout(45_000);
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl('/?enemyInitialCount=0&enemyStaggerIntervalMs=5000'));
  await setPlayerInvulnerable(page, true);
  const playerTileMatch = /^(\d+),(\d+)$/.exec(await page.getByTestId('player-tile').textContent() ?? '');
  if (!playerTileMatch)
    throw new Error('weapon pickup時のplayer tileを取得できません。');
  const playerTile = { x: Number(playerTileMatch[1]), y: Number(playerTileMatch[2]) };
  if (!Number.isSafeInteger(playerTile.x) || !Number.isSafeInteger(playerTile.y)
    || playerTile.x < 0 || playerTile.x >= ARENA_WIDTH_TILES
    || playerTile.y < 0 || playerTile.y >= ARENA_HEIGHT_TILES)
    throw new Error('weapon pickup時のplayer tileがmap範囲外です。');
  const canvasPoint = await findGameCanvasInputPoint(page);
  const reloadHud = page.getByTestId('reload');

  for (const [model, quickSlot] of [
    ['repeating-crossbow', '2'],
    ['flamethrower', '3'],
  ] as const) {
    const definition = WEAPONS[model];
    const pickup = (await activeWorldItems(page)).find(item => item.kind === 'weapon' && item.item === model);
    if (!pickup)
      throw new Error(`${definition.label}のworld pickupが必要です。`);
    await page.evaluate(({ itemId, targetTile }) => {
      const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
      if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
      scene.debugMoveWorldItemTo(itemId, targetTile);
    }, { itemId: pickup.id, targetTile: playerTile });
    await page.keyboard.press('e');
    await expect(page.getByTestId(`quick-slot-${quickSlot}`)).toHaveAttribute('data-model', model);
    await page.keyboard.press(quickSlot);
    await expect(page.getByTestId('ammo-material')).toHaveAttribute('data-material', definition.material);

    const initialAmmo = await currentAmmo(page);
    await aimPlayer(page, { x: 1, y: 0 });
    await holdGameCanvasAt(
      page,
      canvasPoint,
      Math.max(1, definition.fireIntervalMs - 1),
    );
    const beforeReload = await currentAmmo(page);
    expect(beforeReload).toBe(initialAmmo - 1);
    const materialBeforeReload = Number(await page.getByTestId('ammo-material').getAttribute('data-quantity'));
    if (!Number.isSafeInteger(materialBeforeReload))
      throw new Error(`${definition.label}のreload前マテリアル数が必要です。`);

    await page.keyboard.press('r');
    await expect(reloadHud).toContainText('リロード中');
    await page.evaluate(() => {
      const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
      if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
      scene.scene.setVisible(false);
    });
    try {
      await page.clock.runFor(definition.reloadMs + 100);
    } finally {
      await page.evaluate(() => {
        const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
        if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
        scene.scene.setVisible(true);
      });
    }
    await expect(reloadHud).toHaveText('待機');
    const reloaded = await currentAmmo(page);
    expect(reloaded).toBe(beforeReload + 1);
    const materialAfterReload = Number(await page.getByTestId('ammo-material').getAttribute('data-quantity'));
    expect(materialAfterReload).toBe(
      materialBeforeReload - (reloaded - beforeReload) * definition.materialCostPerShot,
    );

    await holdGameCanvasAt(page, canvasPoint, Math.max(1, definition.fireIntervalMs - 1));
    await expect.poll(() => currentAmmo(page)).toBe(reloaded - 1);
  }
});

test('Issue #77: terminal/retry後に旧reload callbackは新runの初期状態を変えない', async ({ page }) => {
  test.setTimeout(45_000);
  const definition = WEAPONS.rifle;
  const initialMaterial = AMMO_MATERIALS[definition.material].initialQuantity;
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl('/'));
  const reloadHud = page.getByTestId('reload');
  const reloadProgress = page.getByTestId('reload-progress');

  await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    const rifle = scene.state.inventory.quickSlots[0];
    if (!rifle || rifle.model !== 'rifle') throw new Error('初期ライフルinstanceが必要です。');
    rifle.magazine = 0;
    scene.refreshHud();
  });
  await expect.poll(() => currentAmmo(page)).toBe(0);
  await expect(page.getByTestId('ammo-material')).toHaveAttribute('data-quantity', String(initialMaterial));

  await page.keyboard.press('r');
  await expect(reloadHud).toContainText('リロード中');
  await expect(reloadProgress).toBeVisible();

  await page.evaluate(() => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    (scene as unknown as { enterTerminal: (result: 'defeat') => void }).enterTerminal('defeat');
  });
  await expect(page.getByTestId('defeat')).toBeVisible();
  await page.getByTestId('retry').click();

  await expect(page.getByTestId('defeat')).toBeHidden();
  await expect.poll(() => currentAmmo(page)).toBe(definition.magazineSize);
  await expect(page.getByTestId('ammo-material')).toHaveAttribute('data-material', definition.material);
  await expect(page.getByTestId('ammo-material')).toHaveAttribute('data-quantity', String(initialMaterial));
  await expect(reloadHud).toHaveText('待機');
  await expect(reloadProgress).toBeHidden();

  await page.clock.runFor(definition.reloadMs + 1);
  await expect.poll(() => currentAmmo(page)).toBe(definition.magazineSize);
  await expect(page.getByTestId('ammo-material')).toHaveAttribute('data-quantity', String(initialMaterial));
  await expect(reloadHud).toHaveText('待機');
  await expect(reloadProgress).toBeHidden();
});

test('同じtileのスクラップは数量と見た目を集約しEで取得できる', async ({ page }) => {
  test.setTimeout(45_000);
  const dropsToMediumTier = Math.max(1, Math.ceil(SCRAP_VISUAL_TIER_THRESHOLDS.medium / SCRAP_DROP_AMOUNTS.basic));
  const initialBasicIds = INITIAL_ACTIVE_IDS.filter(id => id.startsWith('basic-')).slice(0, dropsToMediumTier);
  if (initialBasicIds.length !== dropsToMediumTier)
    throw new Error('スクラップ中段階の確認に必要な初期基本敵枠がありません。');
  const schedule = createRunSchedule(15_000, 500);
  await page.clock.install({ time: 15 });
  await page.clock.pauseAt(15);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=${dropsToMediumTier}&enemyStaggerIntervalMs=30000&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`,
  ));
  await setArenaPhysics(page, 'pause');
  await startInitialCombat(page, schedule.restDurationMs);
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const anchor = generateArenaMap(mapSeed).start;

  let firstScrap: WorldItemEntry | undefined;
  let secondScrap: WorldItemEntry | undefined;
  for (const id of initialBasicIds) {
    await moveEnemyToTile(page, id, anchor);
    await debugDamageEnemy(page, id, Number(await page.getByTestId(`${id}-hp`).textContent()));
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
  expect(secondScrap.quantity).toBe(dropsToMediumTier * SCRAP_DROP_AMOUNTS.basic);
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

  const material: AmmoMaterial = 'ballistic-material';
  const pouch = page.getByTestId('ammo-pouch');
  const pouchEntry = page.getByTestId(`ammo-pouch-${material}`);
  const materialBeforeAmmoDrop = await pouchEntry.getAttribute('data-quantity');
  await beginInventoryDrag(page, `ammo-pouch-${material}`);
  await expect(pouch).toHaveAttribute('data-drag-source', `material:${material}`);
  await dragInventorySlot(page, `ammo-pouch-${material}`, '#game');
  await expect(page.getByTestId('feedback')).toHaveText('置ける場所がありません');
  await expect(pouchEntry).toHaveAttribute('data-quantity', materialBeforeAmmoDrop ?? '');
  expect(await activeWorldItems(page)).toEqual(worldItemsBeforeDrop);
});

test('素材箱と同tileのスクラップをEで取得できる', async ({ page }) => {
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
  await expect(ammoBoxCount).toHaveText('3');
  await page.keyboard.press('e');
  await expect(page.getByTestId('scrap')).toHaveAttribute('data-count', /[1-9]/);
  expect((await activeWorldItems(page)).some(item => item.id === scrap.id)).toBe(false);
  await expect.poll(async () => tileKeysFromAttribute(await ammoBoxCount.getAttribute('data-active-tiles'))).not.toContain(targetBoxKey);
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
  await dragInventorySlot(page, 'ammo-pouch-projectile-material', '#game');
  const droppedAmmo = (await activeWorldItems(page)).find(item => item.id.startsWith('dropped-ammo-material-'));
  if (!droppedAmmo || droppedAmmo.kind !== 'ammo-material')
    throw new Error('retry初期化確認用のworld素材が必要です。');
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
  for (const material of AMMO_MATERIAL_ORDER) {
    await expect(page.getByTestId(`ammo-pouch-${material}`))
      .toHaveAttribute('data-quantity', String(AMMO_MATERIALS[material].initialQuantity));
  }
  const retriedItems = await activeWorldItems(page);
  expect(retriedItems.filter(item => item.kind === 'weapon').map(item => item.item).sort()).toEqual([...INITIAL_WORLD_WEAPON_MODELS].sort());
  expect(retriedItems.filter(item => item.kind === 'material')).toHaveLength(0);
  expect(retriedItems.some(item => item.id === droppedAmmo.id)).toBe(false);
  const retriedBoxes = await activeAmmoBoxes(page);
  expect(retriedBoxes).toHaveLength(selectAmmoBoxTiles(generateArenaMap(Number(await page.getByTestId('map-seed').textContent()))).length);
  retriedBoxes.forEach((box, index) => {
    const expectedMaterial = AMMO_MATERIAL_BOX_CYCLE[index % AMMO_MATERIAL_BOX_CYCLE.length];
    if (!expectedMaterial) throw new Error('弾薬素材の設定が必要です。');
    expect(box.material).toBe(expectedMaterial);
    expect(box.quantity).toBe(AMMO_MATERIALS[expectedMaterial].boxQuantity);
    expect(box.worldColor).toBe(AMMO_MATERIALS[expectedMaterial].worldColor);
    expect(box.texture).toBe(`material-box-${expectedMaterial}`);
  });
});

test('ガンスリンガーは回避中の敵を一度だけブーツナイフで通過し、コンボと速度buffを更新する', async ({ page }) => {
  // 標準113×71 mapをterminal/retryで2回生成し、同じstable IDへの再適用を確認するため。
  test.setTimeout(45_000);
  const schedule = createRunSchedule(1_000, 500);
  const staggerIntervalMs = runDurationMs(schedule) + 1;
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(`/?enemyInitialCount=1&enemyStaggerIntervalMs=${staggerIntervalMs}&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`);
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
});

test('ガンスリンガーのコンボ期限は有効命中で更新され、無効接触では維持する', async ({ page }) => {
  test.setTimeout(30_000);
  const schedule = createRunSchedule(GUNSLINGER_COMBO_TIMEOUT_MS * 4, 500);
  const deadlineMarginMs = Math.max(1, Math.floor(GUNSLINGER_COMBO_TIMEOUT_MS / 10));
  const beforeExpiryMs = GUNSLINGER_COMBO_TIMEOUT_MS - deadlineMarginMs;
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(`/?enemyInitialCount=4&combatWaveDurationMs=${schedule.combatWaveDurationMs}&restDurationMs=${schedule.restDurationMs}`);
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
  await setArenaPhysics(page, 'pause');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const lane = findDashLane(generateArenaMap(mapSeed));
  const basicOneHp = Number(await page.getByTestId('basic-1-hp').textContent());
  if (!Number.isFinite(basicOneHp) || basicOneHp <= 0)
    throw new Error('最初のコンボを作る基本敵のHPを取得できません。');
  await debugDamageEnemy(page, 'basic-1', basicOneHp);
  const comboAfterBasicOne = Number(await combo.textContent());
  expect(comboAfterBasicOne).toBeGreaterThan(0);

  await debugDamageEnemy(page, 'basic-2', 1);
  await page.clock.fastForward(beforeExpiryMs);
  expect(Number(await combo.textContent())).toBe(comboAfterBasicOne);
  await debugDamageEnemy(page, 'basic-2', 1);
  await page.clock.fastForward(beforeExpiryMs);
  expect(Number(await combo.textContent())).toBe(comboAfterBasicOne);
  await page.clock.fastForward(deadlineMarginMs + 1);
  await expect(combo).toHaveText('0');

  const basicThreeHp = Number(await page.getByTestId('basic-3-hp').textContent());
  if (!Number.isFinite(basicThreeHp) || basicThreeHp <= 0)
    throw new Error('無敵中のコンボを作る基本敵のHPを取得できません。');
  await debugDamageEnemy(page, 'basic-3', basicThreeHp);
  const comboBeforeInvulnerableContact = Number(await combo.textContent());
  expect(comboBeforeInvulnerableContact).toBeGreaterThan(0);

  await setArenaPhysics(page, 'resume');
  const playerHpBeforeInvulnerableContact = Number(await playerHp.textContent());
  await movePlayerIntoEnemy(page, 'basic-2', lane.origin, lane.direction);
  expect(Number(await playerHp.textContent())).toBe(playerHpBeforeInvulnerableContact);
  expect(Number(await combo.textContent())).toBe(comboBeforeInvulnerableContact);

  await setPlayerInvulnerable(page, false);
  await movePlayerIntoEnemy(page, 'basic-2', lane.origin, lane.direction);
  expect(Number(await playerHp.textContent())).toBeLessThan(playerHpBeforeInvulnerableContact);
  await expect(combo).toHaveText('0');

  const basicFourHp = Number(await page.getByTestId('basic-4-hp').textContent());
  if (!Number.isFinite(basicFourHp) || basicFourHp <= 0)
    throw new Error('接触cooldown中のコンボを作る基本敵のHPを取得できません。');
  await debugDamageEnemy(page, 'basic-4', basicFourHp);
  const comboDuringContactCooldown = Number(await combo.textContent());
  const playerHpBeforeContactCooldown = Number(await playerHp.textContent());
  expect(comboDuringContactCooldown).toBeGreaterThan(0);
  await movePlayerIntoEnemy(page, 'basic-2', lane.origin, lane.direction, true);
  expect(Number(await playerHp.textContent())).toBe(playerHpBeforeContactCooldown);
  expect(Number(await combo.textContent())).toBe(comboDuringContactCooldown);
});

test('自動射撃、ショットガンの発射待ち、リロード、視界遮蔽と再挑戦を確認できる', async ({ page }) => {
  // 標準mapのLOS検査を含む代表経路に、実時間の余裕を持たせる。
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
  await expect(page.getByTestId('ammo-material')).toHaveText(`素材 ${AMMO_MATERIALS['ballistic-material'].label} ${AMMO_MATERIALS['ballistic-material'].initialQuantity}`);
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
  const materialsBeforeAmmoPickup = Object.fromEntries(await Promise.all(AMMO_MATERIAL_ORDER.map(async material => [
    material,
    Number(await page.getByTestId(`ammo-pouch-${material}`).getAttribute('data-quantity')),
  ]))) as Record<AmmoMaterial, number>;
  await page.evaluate((tile) => {
    const scene = (window as Window & { __arenaScene?: ArenaDebugScene }).__arenaScene;
    if (!scene) throw new Error('DEV用Arena Sceneがwindowへ公開されていません。');
    scene.debugMovePlayerTo(tile);
  }, firstBox);
  await expect(page.getByTestId('ammo-box-count')).toHaveText('4');
  await expect(page.getByTestId('pickup-prompt')).toBeVisible();
  await expect(page.getByTestId('pickup-target')).toHaveText(`${AMMO_MATERIALS[firstAmmoBox.material].label} ${firstAmmoBox.quantity}個`);
  await expect(page.getByTestId('pickup-action')).toHaveText('を拾う [E]');
  await page.keyboard.press('e');
  await expect(page.getByTestId('ammo-box-count')).toHaveText('3');
  const waitingBoxKeys = await page.getByTestId('ammo-box-count').getAttribute('data-active-tiles');
  expect(tileKeysFromAttribute(waitingBoxKeys)).not.toContain(firstBoxKey);
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', firstBoxKey);
  const ammoPouch = page.getByTestId('ammo-pouch');
  await page.keyboard.press('Tab');
  await expect(ammoPouch).toBeVisible();
  for (const material of AMMO_MATERIAL_ORDER) {
    const expectedQuantity = material === firstAmmoBox.material
      ? materialsBeforeAmmoPickup[material] + firstAmmoBox.quantity
      : materialsBeforeAmmoPickup[material];
    await expect(page.getByTestId(`ammo-pouch-${material}`)).toHaveAttribute('data-quantity', String(expectedQuantity));
  }
  await page.keyboard.press('Tab');
  await expect(ammoPouch).toBeHidden();

  await expect(page.getByTestId('ammo-box-count')).toHaveText('3');
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-active-tiles', waitingBoxKeys ?? '');
  await expect(page.getByTestId('ammo-box-count')).toHaveAttribute('data-respawn-tiles', firstBoxKey);
  await expect(page.getByTestId('ammo-material')).toHaveAttribute(
    'data-quantity',
    String(firstAmmoBox.material === 'ballistic-material'
      ? materialsBeforeAmmoPickup['ballistic-material'] + firstAmmoBox.quantity
      : materialsBeforeAmmoPickup['ballistic-material']),
  );

  await setArenaPhysics(page, 'pause');
  await collectShotgunPickup(page);
  await page.keyboard.press('2');
  await expect(page.getByTestId('weapon')).toHaveText('ショットガン');
  await expect(page.getByTestId('ammo')).toHaveText('4/4');
  await expect(page.getByTestId('ammo-material')).toHaveText(/素材 実弾マテリアル \d+/);
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
  await expect(page.getByTestId('ammo-material')).toHaveText(/素材 実弾マテリアル \d+/);
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
  await expect(page.getByTestId('ammo-material')).toHaveText(`素材 ${AMMO_MATERIALS['ballistic-material'].label} ${AMMO_MATERIALS['ballistic-material'].initialQuantity}`);
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
  const boundaryMarginMs = Math.max(1, Math.floor(SPAWN_PHASE_MS / 120));
  const staggerIntervalMs = 500;
  const staggerMarginMs = Math.max(1, Math.floor(staggerIntervalMs / 10));
  const schedule = createRunSchedule(SPAWN_PHASE_MS + boundaryMarginMs, boundaryMarginMs);
  const { combatWaveDurationMs: combatDurationMs, restDurationMs } = schedule;
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl(
    `/?enemyStaggerIntervalMs=${staggerIntervalMs}&combatWaveDurationMs=${combatDurationMs}&restDurationMs=${restDurationMs}`,
  ));
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
  for (const [index, { id }] of STAGGERED_ENEMIES.entries()) {
    const delay = (index + 1) * staggerIntervalMs + staggerMarginMs;
    await page.clock.runFor(delay - elapsed);
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId(`${id}-hp`)).toHaveAttribute('data-spawn-reason', 'stagger');
    const expectedActiveCount = INITIAL_ACTIVE_IDS.length + index + 1;
    await expect(page.getByTestId('enemy-current')).toHaveText(String(expectedActiveCount));
    await expect(page.getByTestId('enemy-remaining')).toHaveText(String(expectedActiveCount));
    elapsed = delay;
  }
  await expectStrictEnemySpawns(page, STAGGERED_ENEMIES.map(({ id }) => id), 'stagger');
  const phaseZero = await allEnemySpawnMetadata(page);
  expect(new Set(phaseZero.map(metadata => metadata.stableId))).toEqual(new Set(ENEMY_INSTANCE_IDS));
  expect(new Set(phaseZero.map(metadata => metadata.spawnTile)).size).toBe(12);
  expect(phaseZero.every(metadata => !preparationWorldItemTiles.has(metadata.spawnTile))).toBe(true);

  await page.clock.fastForward(SPAWN_PHASE_MS - elapsed);
  const phaseOnePrimary = primarySpawnDirection(mapSeed, 1);
  await expect(phaseHud).toHaveText('2');
  await expect(phaseHud).toHaveAttribute('data-phase', '1');
  await expect(primaryHud).toHaveAttribute('data-direction', phaseOnePrimary);
  await expect(runPanel).toHaveAttribute('data-phase', 'combat');
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
  expect(preparationWorldItemTiles.has(respawned.spawnTile)).toBe(false);
  expect(respawned.spawnTile).not.toBe(phaseZero[targetSlot].spawnTile);
  expect(new Set(phaseOne.map(metadata => metadata.spawnTile)).size).toBe(12);

  const hitPointsBeforeRest = await Promise.all(ENEMY_INSTANCE_IDS.map(async id => ({
    id,
    hp: await page.getByTestId(`${id}-hp`).textContent(),
  })));
  await page.clock.fastForward(boundaryMarginMs);
  await expect(page.getByTestId('wave')).toHaveText('1');
  await expect(page.getByTestId('wave-remaining')).toHaveText(formatSurvivalTime(0));
  await expect(runPanel).toHaveAttribute('data-phase', 'rest');
  await expect(page.getByTestId('run-phase')).toHaveText('昼（休憩）');
  await expect(page.getByTestId('phase-remaining')).toHaveText(formatSurvivalTime(restDurationMs));
  expect(await allEnemySpawnMetadata(page)).toEqual(phaseOne);
  for (const { id, hp } of hitPointsBeforeRest)
    await expect(page.getByTestId(`${id}-hp`)).toHaveText(hp ?? '');
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
  await page.goto(devStartUrl(`/?enemyInitialCount=13&enemyStaggerIntervalMs=0&enemySpawnCandidatePool=${ARENA_WIDTH_TILES * ARENA_HEIGHT_TILES + 1}&combatWaveDurationMs=999&restDurationMs=120001`));
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
  // 標準mapの再出現・retry仮想時計処理に、実時間の余裕を持たせる。
  test.setTimeout(90_000);
  const schedule = createRunSchedule(COMBAT_WAVE_DURATION_MS, 500);
  await page.clock.install({ time: 1 });
  await page.clock.pauseAt(1);
  await page.goto(devStartUrl(
    `/?enemyInitialCount=1&enemyStaggerIntervalMs=5000&restDurationMs=${schedule.restDurationMs}`,
  ));
  await setArenaPhysics(page, 'pause');
  await startInitialCombat(page, schedule.restDurationMs);
  await expectStrictEnemySpawns(page, ['basic-1'], 'initial');
  const mapSeed = Number(await page.getByTestId('map-seed').textContent());
  const map = generateArenaMap(mapSeed);
  const player = parseFloorTile(map, await page.getByTestId('player-tile').textContent(), 'プレイヤー');
  const initialSpawn = await enemySpawnMetadata(page, 'basic-1');
  const initialSpawnTile = parseFloorTile(map, initialSpawn.spawnTile, 'basic-1の初期spawn');
  expect(findPath(map, initialSpawnTile, player).length - 1).toBeGreaterThanOrEqual(10);
  const basicEnemyHp = page.getByTestId('basic-1-hp');
  const initialHp = Number(await basicEnemyHp.textContent());
  if (!Number.isSafeInteger(initialHp) || initialHp <= 1)
    throw new Error('basic-1の初期HPが必要です。');
  const partialDamage = Math.max(1, Math.floor(initialHp / 2));
  const partialHp = initialHp - partialDamage;
  const recycleThreshold = hiddenRecycleThresholdFor('basic-1', 0, mapSeed);

  await debugDamageEnemy(page, 'basic-1', partialDamage);
  await expect(basicEnemyHp).toHaveText(String(partialHp));
  await page.clock.runFor(recycleThreshold + 100);
  const recycling = await enemySpawnMetadata(page, 'basic-1');
  expect(recycling.recycleCount).toBe('1');
  expect(recycling.active).toBe('false');
  expect(recycling.spawnReason).toBe('recycle');

  await page.clock.runFor(recycleDelayFor('basic-1', 1, mapSeed) + 100);
  await expect(basicEnemyHp).toHaveAttribute('data-active', 'true');
  await expect(basicEnemyHp).toHaveAttribute('data-spawn-reason', 'recycle');
  await expect(basicEnemyHp).toHaveText(String(partialHp));

  await debugDamageEnemy(page, 'basic-1', partialHp);
  await expect(basicEnemyHp).toHaveAttribute('data-active', 'false');
  await page.clock.runFor(respawnDelayFor('basic', 'basic-1', 1, mapSeed) + 100);
  await expect(basicEnemyHp).toHaveAttribute('data-active', 'true');
  await expect(basicEnemyHp).toHaveAttribute('data-spawn-reason', 'death');
  await expectOutputValue(basicEnemyHp, String(initialHp));

  const oldDeathDelay = respawnDelayFor('basic', 'basic-1', 2, mapSeed);
  await debugDamageEnemy(page, 'basic-1', initialHp);
  await expect(basicEnemyHp).toHaveAttribute('data-active', 'false');
  await page.getByTestId('retry').dispatchEvent('click');
  await setHiddenRecycle(page, false);
  await setArenaPhysics(page, 'pause');
  await startInitialCombat(page, schedule.restDurationMs);
  await expect(basicEnemyHp).toHaveAttribute('data-active', 'true');
  await expect(basicEnemyHp).toHaveAttribute('data-spawn-reason', 'initial');
  await expectOutputValue(basicEnemyHp, String(initialHp));
  await page.clock.runFor(oldDeathDelay + 100);
  await expect(basicEnemyHp).toHaveAttribute('data-active', 'true');
  await expect(basicEnemyHp).toHaveAttribute('data-spawn-reason', 'initial');
  await expectOutputValue(basicEnemyHp, String(initialHp));
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
  // 標準mapの仮想時計処理に、実時間の余裕を持たせる。
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
  expect(initialBox.quantity).toBe(AMMO_MATERIALS[initialBox.material].boxQuantity);
  expect(initialBox.worldColor).toBe(AMMO_MATERIALS[initialBox.material].worldColor);
  expect(initialBox.texture).toBe(`material-box-${initialBox.material}`);
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
  expect(respawnedEntry.material).toBe(initialBox.material);
  expect(respawnedEntry.quantity).toBe(AMMO_MATERIALS[initialBox.material].boxQuantity);
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
