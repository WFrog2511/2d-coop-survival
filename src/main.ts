import Phaser from 'phaser';
import { ARENA_HEIGHT_TILES, ARENA_WIDTH_TILES, TILE_SIZE, basicApproachRoleFor, enemyVisibility, findPath, hasLineOfSight, type EnemyVisibility, generateArenaMap, generateNextArenaMap, hiddenRecycleThresholdFor, nextSeed, primarySpawnDirection, recycleDelayFor, respawnDelayFor, selectAmmoBoxTiles, selectEnemySpawnTile, selectInitialWeaponPickupTiles, selectSpawnTile, selectWorldWeaponDropTile, spawnDirectionForSlot, spawnPhaseAt, type ArenaMap, type Tile, type TilePosition, viewportTileRect } from './arena-map';
import { EnemyActor } from './arena/enemy-actor';
import { ArenaEffects } from './arena/effects';
import { ArenaHud, type InventoryDragSource, type InventoryDropTarget, type MinimapMarker } from './arena/hud';
import { ENEMIES, ENEMY_DEFEAT_HIT_STOP_MS, ENEMY_HIT_STOP_MS, ENEMY_IDS, ENEMY_LABELS, ENEMY_SPAWN_ORDER, INITIAL_ENEMY_IDS, INITIAL_WORLD_WEAPON_MODELS, PLAYER_HIT_STOP_MS, SCRAP_DROP_AMOUNTS, STAGGERED_ENEMIES, scrapVisualTierFor, type ScrapVisualTier } from './game-data';
import { GUNSLINGER_BOOT_KNIFE_DAMAGE, GUNSLINGER_COMBO_TIMEOUT_MS, PLAYER_DASH_DURATION_MS, PLAYER_ROLES, canDashAt, canFireWhileDashing, dashCooldownUntil, dashDirectionFor, dashSpeedFor, gunslingerComboAfterEvent, gunslingerSpeedBuffUntil, gunslingerSpeedMultiplierAt, reloadDurationForWorldWeapon, type DashDirection, type PlayerRole } from './player-data';
import { selectNearbyPickup } from './pickups';
import {
  AMMO_BOX_RESPAWN_MS,
  AMMO_MATERIAL_BOX_CYCLE,
  AMMO_MATERIAL_ORDER,
  AMMO_MATERIALS,
  COMBAT_WAVE_DURATION_MS,
  REST_DURATION_MS,
  WEAPONS,
  WEAPON_MODEL_ORDER,
  activeWeapon,
  advanceRunState,
  advanceSurvivalState,
  cancelReload,
  collectMaterial,
  collectWeapon,
  completeReload,
  createRunSchedule,
  createWeaponInstance,
  currentRunPhase,
  damageEnemy,
  damagePlayer,
  defeatRun,
  dropAmmoMaterial,
  droneLateralSpeedAt,
  enemySpeedMultiplierForPhase,
  fireWeapon,
  hiddenRecyclePathDistanceForPhase,
  inventoryWeaponAt,
  isEnemyDefeated,
  moveInventoryWeapon,
  recordEnemyDefeated,
  recordEnemyRecycled,
  recordEnemySpawned,
  remainingSurvivalMs,
  removeInventoryWeapon,
  resolveDamage,
  respawnEnemy,
  retryCombat,
  retryRun,
  runDurationMs,
  selectQuickSlot,
  startReload,
  type AmmoMaterial,
  type CombatState,
  type DamageType,
  type EnemyInstanceId,
  type EnemyKind,
  type InventorySlotRef,
  type MaterialId,
  type RunPhase,
  type RunSchedule,
  type RunState,
  type WeaponInstance,
  type WeaponModel,
} from './rules';

const WIDTH = 800;
const HEIGHT = 500;
const BULLET_POOL_SIZE = 48;
const IS_DEV = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
const DEFAULT_ENEMY_INITIAL_COUNT = INITIAL_ENEMY_IDS.length;
const DEFAULT_ENEMY_STAGGER_INTERVAL_MS = STAGGERED_ENEMIES[0].delay;
const DEFAULT_ENEMY_SPAWN_CANDIDATE_POOL = 10;
const MIN_ENEMY_STAGGER_INTERVAL_MS = 500;
const MAX_ENEMY_STAGGER_INTERVAL_MS = 5000;
const MAX_ENEMY_SPAWN_CANDIDATE_POOL = ARENA_WIDTH_TILES * ARENA_HEIGHT_TILES;
const MIN_COMBAT_WAVE_DURATION_MS = 1000;
const MAX_COMBAT_WAVE_DURATION_MS = 300000;
const MIN_REST_DURATION_MS = 500;
const MAX_REST_DURATION_MS = 120000;
const MAP_PALETTE_FADE_MS = 450;
const VISIBILITY_MASK_TEXTURE_KEY = 'visibility-mask';
type EnemySpawnReason = 'initial' | 'stagger' | 'death' | 'recycle' | 'debug';
type EnemySpawnConfig = {
  initialCount: number;
  staggerIntervalMs: number;
  candidatePool: number;
};
type BulletMeta = {
  weapon: WeaponModel;
  damageType: DamageType;
  damage: number;
  range: number;
  knockback: number;
  startX: number;
  startY: number;
  directionX: number;
  directionY: number;
};
type PathState = {
  path: TilePosition[];
  nextAt: number;
  playerTile: TilePosition;
  enemyTile: TilePosition;
};
type AmmoBoxState = {
  originTile: TilePosition;
  currentTile: TilePosition | null;
  respawnCount: number;
  seedOffset: number;
  material: AmmoMaterial;
  quantity: number;
};
type WeaponWorldItem = {
  id: string;
  kind: 'weapon';
  tile: TilePosition;
  quantity: number;
  weapon: WeaponInstance;
  sprite: Phaser.Physics.Arcade.Image;
};
type MaterialWorldItem = {
  id: string;
  kind: 'material';
  tile: TilePosition;
  quantity: number;
  material: MaterialId;
  visualTier: ScrapVisualTier;
  sprite: Phaser.Physics.Arcade.Image;
};
type AmmoMaterialWorldItem = {
  id: string;
  kind: 'ammo-material';
  tile: TilePosition;
  quantity: number;
  material: AmmoMaterial;
  worldColor: string;
  texture: string;
  sprite: Phaser.Physics.Arcade.Image;
};
type WorldItem = WeaponWorldItem | MaterialWorldItem | AmmoMaterialWorldItem;
type NearbyPickup
  = { id: string; tile: TilePosition; kind: 'ammo'; box: Phaser.GameObjects.GameObject }
    | { id: string; tile: TilePosition; kind: 'world'; item: WorldItem };
type PickupPrompt = { target: string; action: string };
type PlayerDash = {
  directionX: number;
  directionY: number;
  endsAt: number;
};
type Controls = Phaser.Types.Input.Keyboard.CursorKeys & {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
  e: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  shift: Phaser.Input.Keyboard.Key;
};

function enemyRecord<T>(create: (id: EnemyInstanceId) => T): Record<EnemyInstanceId, T> {
  return Object.fromEntries(ENEMY_IDS.map(id => [id, create(id)])) as Record<EnemyInstanceId, T>;
}

function enemyNumbers(initial = 0): Record<EnemyInstanceId, number> {
  return enemyRecord(() => initial);
}

/** DEV用URL queryを安全な既定値へ正規化し、本番では読み取らない。 */
function resolveEnemySpawnConfig(): EnemySpawnConfig {
  const query = IS_DEV ? new URLSearchParams(window.location.search) : new URLSearchParams();
  return {
    initialCount: readDevIntegerQuery(query, 'enemyInitialCount', DEFAULT_ENEMY_INITIAL_COUNT, 0, ENEMY_SPAWN_ORDER.length),
    staggerIntervalMs: readDevIntegerQuery(query, 'enemyStaggerIntervalMs', DEFAULT_ENEMY_STAGGER_INTERVAL_MS, MIN_ENEMY_STAGGER_INTERVAL_MS, MAX_ENEMY_STAGGER_INTERVAL_MS),
    candidatePool: readDevIntegerQuery(query, 'enemySpawnCandidatePool', DEFAULT_ENEMY_SPAWN_CANDIDATE_POOL, 1, MAX_ENEMY_SPAWN_CANDIDATE_POOL),
  };
}

/** DEV用combat/rest queryを安全な既定値へ正規化し、本番では読み取らない。 */
function resolveRunSchedule(): RunSchedule {
  const query = IS_DEV ? new URLSearchParams(window.location.search) : new URLSearchParams();
  return createRunSchedule(
    readDevIntegerQuery(query, 'combatWaveDurationMs', COMBAT_WAVE_DURATION_MS, MIN_COMBAT_WAVE_DURATION_MS, MAX_COMBAT_WAVE_DURATION_MS),
    readDevIntegerQuery(query, 'restDurationMs', REST_DURATION_MS, MIN_REST_DURATION_MS, MAX_REST_DURATION_MS),
  );
}

function readDevIntegerQuery(
  query: URLSearchParams,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = query.get(name);
  if (value === null || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function initialEnemyIdsFor(config: EnemySpawnConfig): readonly EnemyInstanceId[] {
  return ENEMY_SPAWN_ORDER.slice(0, config.initialCount);
}

function staggeredEnemiesFor(config: EnemySpawnConfig): readonly { id: EnemyInstanceId; delay: number }[] {
  return ENEMY_SPAWN_ORDER.slice(config.initialCount)
    .map((id, index) => ({ id, delay: (index + 1) * config.staggerIntervalMs }));
}

function formatEnemySpawnConfig(config: EnemySpawnConfig): string {
  return `enemyInitialCount=${config.initialCount};enemyStaggerIntervalMs=${config.staggerIntervalMs};enemySpawnCandidatePool=${config.candidatePool}`;
}

function formatRunSchedule(schedule: RunSchedule): string {
  return `combatWaveDurationMs=${schedule.combatWaveDurationMs};restDurationMs=${schedule.restDurationMs}`;
}

const ENEMY_SPAWN_CONFIG = resolveEnemySpawnConfig();
const RUN_SCHEDULE = resolveRunSchedule();
const arenaHud = new ArenaHud(formatEnemySpawnConfig(ENEMY_SPAWN_CONFIG), formatRunSchedule(RUN_SCHEDULE));

function sameTile(left: TilePosition, right: TilePosition): boolean {
  return left.x === right.x && left.y === right.y;
}

function tileKey(tile: TilePosition): string {
  return `${tile.x},${tile.y}`;
}

let resetArena: (() => void) | undefined;
class Arena extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private effects!: ArenaEffects;
  private enemyActors!: Record<EnemyInstanceId, EnemyActor>;
  private bullets!: Phaser.Physics.Arcade.Group;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private ammoBoxes!: Phaser.Physics.Arcade.StaticGroup;
  private worldItems!: Phaser.Physics.Arcade.StaticGroup;
  private ammoBoxStates = new Map<string, AmmoBoxState>();
  private worldItemStates = new Map<string, WorldItem>();
  private ammoBoxRespawns = new Map<string, Phaser.Time.TimerEvent>();
  private survivalTimer: Phaser.Time.TimerEvent | undefined;
  private survivalStartedAt = 0;
  private combatStartedAt = 0;
  private enemyLifecycleStarted = false;
  private ground: Phaser.GameObjects.Graphics | undefined;
  private wallArt: Phaser.GameObjects.Graphics | undefined;
  private fadingGround: Phaser.GameObjects.Graphics | undefined;
  private fadingWallArt: Phaser.GameObjects.Graphics | undefined;
  private mapPaletteTransition: Phaser.Tweens.Tween | undefined;
  private visibilityMask!: Phaser.GameObjects.Image;
  private visibilityMaskTexture!: Phaser.Textures.CanvasTexture;
  private visibilityMaskPlayerTile: TilePosition | undefined;
  private readonly observedTiles = new Map<string, Tile>();
  private readonly visibleTileKeys = new Set<string>();
  private minimapTerrainChanged = true;
  private keys!: Controls;
  private map!: ArenaMap;
  private mapSeed = Date.now() >>> 0;
  private generation = 0;
  private state: CombatState = retryCombat();
  private runState: RunState = retryRun(RUN_SCHEDULE);
  private mapPhase: RunPhase | undefined;
  private meta = new Map<Phaser.Physics.Arcade.Sprite, BulletMeta>();
  private contactAt = enemyNumbers();
  private playerHitStopUntil = 0;
  private playerDash: PlayerDash | undefined;
  private playerDashCooldownUntil = 0;
  private gunslingerCombo = 0;
  private gunslingerComboExpiresAt = 0;
  private gunslingerSpeedBuffUntil = 0;
  private gunslingerDashEnemyIds = new Set<EnemyInstanceId>();
  private aimDirection: DashDirection | undefined;
  private respawnCount = enemyNumbers();
  private recycleCount = enemyNumbers();
  private lastHitAt = enemyNumbers(Number.NEGATIVE_INFINITY);
  private hiddenSince = new Map<EnemyInstanceId, number>();
  private recyclingEnemyId: EnemyInstanceId | undefined;
  private hiddenRecycleEnabled = true;
  private debugPlayerInvulnerable = false;
  private inventoryOpen = false;
  private droppedWeaponSequence = 0;
  private droppedAmmoSequence = 0;
  private readonly onTabKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Tab')
      return;
    event.preventDefault();
    this.toggleInventory();
  };

  private paths = {} as Record<EnemyInstanceId, PathState>;
  private enemySpawnTimers = new Map<EnemyInstanceId, Phaser.Time.TimerEvent>();
  private reloadTimer: Phaser.Time.TimerEvent | undefined;
  private visibilityTiles = {} as Partial<Record<EnemyInstanceId, { player: TilePosition; enemy: TilePosition }>>;
  constructor(private readonly playerRole: PlayerRole) {
    super('arena');
  }

  create(): void {
    resetArena = () => this.reset();
    arenaHud.setInventoryDropListener((source, target) => this.handleInventoryDrop(source, target));
    this.createTextures();
    this.effects = new ArenaEffects(this, arenaHud.playerHitVignette, this.playerRole.tint);
    this.walls = this.physics.add.staticGroup();
    this.ammoBoxes = this.physics.add.staticGroup();
    this.worldItems = this.physics.add.staticGroup();
    this.player = this.physics.add
      .sprite(0, 0, 'player')
      .setCollideWorldBounds(true)
      .setBodySize(28, 28)
      .setDepth(3)
      .setTint(this.playerRole.tint);
    this.enemyActors = {} as Record<EnemyInstanceId, EnemyActor>;
    ENEMY_IDS.forEach((id) => {
      const config = ENEMIES[id];
      const actor = new EnemyActor(this, id, config.kind);
      this.enemyActors[id] = actor;
      this.physics.add.collider(actor.sprite, this.walls);
      this.physics.add.overlap(this.player, actor.sprite, () => this.handlePlayerEnemyOverlap(id));
    });
    this.physics.add.collider(this.player, this.walls);
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: BULLET_POOL_SIZE });
    this.physics.add.collider(this.bullets, this.walls, first => this.disableBullet(first as Phaser.Physics.Arcade.Sprite));
    ENEMY_IDS.forEach(id => this.physics.add.overlap(this.bullets, this.enemyActors[id].sprite, (first, second) => this.hitEnemy(first, second, id)));
    this.keys = this.input.keyboard!.addKeys({ w: 'W', a: 'A', s: 'S', d: 'D', r: 'R', e: 'E', space: 'SPACE', shift: 'SHIFT', up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' }) as Controls;
    this.input.keyboard?.on('keydown-ONE', () => this.changeQuickSlot(0));
    this.input.keyboard?.on('keydown-TWO', () => this.changeQuickSlot(1));
    this.input.keyboard?.on('keydown-THREE', () => this.changeQuickSlot(2));
    window.addEventListener('keydown', this.onTabKeyDown, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.onTabKeyDown, true);
      arenaHud.clearInventoryDrag(true);
      arenaHud.setInventoryDropListener(undefined);
    });
    this.input.keyboard?.on('keydown-R', () => this.reload());
    this.input.keyboard?.on('keydown-E', () => this.collectNearbyPickup());
    this.input.keyboard?.on('keydown-SPACE', () => this.tryDash());
    this.input.keyboard?.on('keydown-SHIFT', () => this.tryDash());
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.updateAimDirection(pointer));
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.updateAimDirection(pointer);
      const weapon = activeWeapon(this.state);
      if (weapon && !WEAPONS[weapon.model].automatic)
        this.tryFire();
    });
    this.input.keyboard?.addCapture(['W', 'A', 'S', 'D', 'R', 'E', 'TAB', 'SPACE', 'SHIFT', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'ONE', 'TWO', 'THREE']);
    this.reset(true);
  }

  update(): void {
    if (this.state.defeated || this.state.victory)
      return;
    arenaHud.updateFps(Math.round(this.game.loop.actualFps));
    this.updateSurvival();
    if (this.state.defeated || this.state.victory)
      return;
    this.updateSpawnPhaseHud();
    this.updatePlayerMovement();
    this.updateTileHud();
    this.updatePickupPrompt();
    this.updateVisibilityMask();
    this.updateReloadProgressHud();
    ENEMY_IDS.forEach(id => this.moveEnemy(id));
    this.updateEnemyVisibility();
    this.updateMinimap();
    if (this.aimDirection) {
      const aim = this.aimPoint();
      this.player.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    }
    const weapon = activeWeapon(this.state);
    if (weapon && WEAPONS[weapon.model].automatic && this.input.activePointer.isDown)
      this.tryFire();
    this.bullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      const data = this.meta.get(bullet);
      if (bullet.active && data && Phaser.Math.Distance.Between(data.startX, data.startY, bullet.x, bullet.y) > data.range)
        this.disableBullet(bullet);
    });
  }

  private updatePlayerMovement(): void {
    this.expireGunslingerCombo();
    const speedMultiplier = this.gunslingerSpeedMultiplier();
    arenaHud.updateGunslinger(this.gunslingerCombo, speedMultiplier, this.playerRole.id === 'gunslinger');
    const dash = this.playerDash;
    if (dash) {
      if (this.time.now >= dash.endsAt || this.isPlayerDashBlocked(dash)) {
        this.cancelPlayerDash();
        return;
      }
      this.player.setVelocity(
        dash.directionX * dashSpeedFor(this.playerRole.id),
        dash.directionY * dashSpeedFor(this.playerRole.id),
      );
      return;
    }
    if (this.time.now < this.playerHitStopUntil) {
      this.player.setVelocity(0, 0);
      return;
    }
    const x = Number(this.keys.d.isDown || this.keys.right.isDown) - Number(this.keys.a.isDown || this.keys.left.isDown);
    const y = Number(this.keys.s.isDown || this.keys.down.isDown) - Number(this.keys.w.isDown || this.keys.up.isDown);
    const length = Math.hypot(x, y) || 1;
    this.player.setVelocity((x / length) * 210 * speedMultiplier, (y / length) * 210 * speedMultiplier);
  }

  private tryDash(): void {
    if (this.state.defeated || this.state.victory || this.playerDash || !canDashAt(this.time.now, this.playerDashCooldownUntil))
      return;
    const direction = dashDirectionFor(this.player, this.aimPoint());
    if (!direction)
      return;
    this.playerDash = {
      directionX: direction.x,
      directionY: direction.y,
      endsAt: this.time.now + PLAYER_DASH_DURATION_MS,
    };
    this.gunslingerDashEnemyIds.clear();
    this.playerDashCooldownUntil = dashCooldownUntil(this.time.now, this.playerRole.id);
    this.player.setVelocity(
      direction.x * dashSpeedFor(this.playerRole.id),
      direction.y * dashSpeedFor(this.playerRole.id),
    );
    this.effects.playPlayerDash();
  }

  private isPlayerDashBlocked(dash: PlayerDash): boolean {
    const body = this.player.body;
    if (!body)
      return false;
    return (dash.directionX < 0 && body.blocked.left)
      || (dash.directionX > 0 && body.blocked.right)
      || (dash.directionY < 0 && body.blocked.up)
      || (dash.directionY > 0 && body.blocked.down);
  }

  private cancelPlayerDash(): void {
    this.playerDash = undefined;
    this.gunslingerDashEnemyIds.clear();
    this.player.setVelocity(0, 0);
  }

  private gunslingerSpeedMultiplier(): number {
    return this.playerRole.id === 'gunslinger'
      ? gunslingerSpeedMultiplierAt(this.time.now, this.gunslingerSpeedBuffUntil)
      : 1;
  }

  private resetGunslingerState(): void {
    this.resetGunslingerCombo();
    this.gunslingerSpeedBuffUntil = 0;
    this.gunslingerDashEnemyIds.clear();
  }

  private resetGunslingerCombo(): void {
    this.gunslingerCombo = 0;
    this.gunslingerComboExpiresAt = 0;
  }

  private extendGunslingerComboTimeout(): void {
    if (this.playerRole.id === 'gunslinger')
      this.gunslingerComboExpiresAt = this.time.now + GUNSLINGER_COMBO_TIMEOUT_MS;
  }

  private expireGunslingerCombo(): void {
    if (this.gunslingerComboExpiresAt > 0 && this.time.now >= this.gunslingerComboExpiresAt)
      this.resetGunslingerCombo();
  }

  public debugRespawnEnemy(id: EnemyInstanceId): void {
    if (!IS_DEV)
      throw new Error('debugRespawnEnemyはDEV環境だけで使用できます。');
    if (!ENEMY_IDS.includes(id))
      throw new Error(`未知の敵IDです: ${id}`);
    const actor = this.enemyActors[id];
    if (this.state.defeated || this.state.victory || !actor.active)
      throw new Error(`再出現できない敵です: ${id}`);
    const enemy = actor.sprite;
    const previous = {
      x: enemy.x,
      y: enemy.y,
      spawnMetadata: actor.currentSpawnMetadata,
    };
    const previousRespawnCount = this.respawnCount[id];
    actor.deactivate();
    delete this.paths[id];
    this.respawnCount[id] += 1;
    if (!this.spawnEnemy(id, 'debug')) {
      this.respawnCount[id] = previousRespawnCount;
      actor.activate(previous.x, previous.y);
      actor.setSpawnMetadata(previous.spawnMetadata);
      this.updateEnemyVisibility(true);
      throw new Error(`${ENEMY_LABELS[id]}の再出現位置がありません。`);
    }
    this.state = respawnEnemy(this.state, id);
    this.lastHitAt[id] = Number.NEGATIVE_INFINITY;
    this.refreshHud();
  }

  public debugSetHiddenRecycleEnabled(enabled: boolean): void {
    if (!IS_DEV)
      throw new Error('debugSetHiddenRecycleEnabledはDEV環境だけで使用できます。');
    this.hiddenRecycleEnabled = enabled;
    if (!enabled) this.hiddenSince.clear();
  }

  public debugSetPlayerInvulnerable(enabled: boolean): void {
    if (!IS_DEV)
      throw new Error('debugSetPlayerInvulnerableはDEV環境だけで使用できます。');
    this.debugPlayerInvulnerable = enabled;
  }

  public debugMovePlayerTo(tile: TilePosition): void {
    if (!IS_DEV)
      throw new Error('debugMovePlayerToはDEV環境だけで使用できます。');
    if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y) || this.map.tiles[tile.y]?.[tile.x] !== 'floor')
      throw new Error('debugMovePlayerToの移動先はfloor tileである必要があります。');
    this.cancelPlayerDash();
    const point = this.world(tile);
    this.player.setPosition(point.x, point.y).setVelocity(0, 0);
    this.player.body?.reset(point.x, point.y);
    this.updateTileHud();
    this.updatePickupPrompt();
    this.updateVisibilityMask(true);
    this.updateEnemyVisibility(true);
  }

  public debugMoveWorldItemTo(id: string, tile: TilePosition): void {
    if (!IS_DEV)
      throw new Error('debugMoveWorldItemToはDEV環境だけで使用できます。');
    if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y) || this.map.tiles[tile.y]?.[tile.x] !== 'floor')
      throw new Error('debugMoveWorldItemToの移動先はfloor tileである必要があります。');
    const item = this.worldItemStates.get(id);
    if (!item || !item.sprite.active)
      throw new Error('移動するactive world itemがありません。');
    const nextTile = { ...tile };
    const point = this.world(nextTile);
    item.tile = nextTile;
    item.sprite.setData('tile', nextTile);
    item.sprite.setPosition(point.x, point.y);
    item.sprite.refreshBody();
    this.updatePickupPrompt();
  }

  public debugDamageEnemy(id: EnemyInstanceId, amount: number): void {
    if (!IS_DEV)
      throw new Error('debugDamageEnemyはDEV環境だけで使用できます。');
    if (!ENEMY_IDS.includes(id))
      throw new Error(`未知の敵IDです: ${id}`);
    if (this.state.defeated || this.state.victory || !this.enemyActors[id].active)
      throw new Error(`ダメージを与えられない敵です: ${id}`);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error('debugDamageEnemyのamountは正の有限値が必要です。');
    this.lastHitAt[id] = this.time.now;
    const previousHp = this.state.enemies[id].hp;
    this.state = damageEnemy(this.state, id, amount);
    if (this.state.enemies[id].hp < previousHp)
      this.extendGunslingerComboTimeout();
    const defeated = isEnemyDefeated(this.state, id);
    this.startEnemyImpact(id, activeWeapon(this.state)?.model ?? 'rifle', defeated);
    if (defeated) this.scheduleDefeatedEnemy(id);
    this.refreshHud();
  }

  private reset(initial = false): void {
    this.generation += 1;
    this.stopRunTimers();
    this.physics.resume();
    this.state = retryCombat();
    this.runState = retryRun(RUN_SCHEDULE);
    this.inventoryOpen = false;
    arenaHud.setInventoryOpen(false);
    arenaHud.clearInventoryDrag(true);
    this.mapPhase = undefined;
    this.survivalStartedAt = this.time.now;
    this.combatStartedAt = 0;
    this.enemyLifecycleStarted = false;
    this.droppedWeaponSequence = 0;
    this.droppedAmmoSequence = 0;
    this.contactAt = enemyNumbers();
    this.playerHitStopUntil = 0;
    this.playerDash = undefined;
    this.playerDashCooldownUntil = 0;
    this.resetGunslingerState();
    this.effects.reset();
    this.respawnCount = enemyNumbers();
    this.recycleCount = enemyNumbers();
    this.lastHitAt = enemyNumbers(Number.NEGATIVE_INFINITY);
    this.hiddenSince.clear();
    this.recyclingEnemyId = undefined;
    this.debugPlayerInvulnerable = false;
    this.paths = {} as Record<EnemyInstanceId, PathState>;
    this.visibilityTiles = {};
    this.visibilityMaskPlayerTile = undefined;
    this.observedTiles.clear();
    this.visibleTileKeys.clear();
    this.minimapTerrainChanged = true;
    this.disableAllBullets();
    const initialEnemyIds = initialEnemyIdsFor(ENEMY_SPAWN_CONFIG);
    ENEMY_IDS.forEach((id) => {
      this.enemyActors[id].reset(initialEnemyIds.includes(id) ? 'initial' : 'stagger');
    });
    this.map = initial ? generateArenaMap(this.mapSeed) : generateNextArenaMap(this.map);
    this.mapSeed = this.map.seed;
    this.resetVisibilityMask();
    this.buildMap();
    const start = this.world(this.map.start);
    this.player.enableBody(true, start.x, start.y, true, true).setVelocity(0, 0);
    this.updateVisibilityMask(true);
    const camera = this.cameras.main;
    const world = this.mapWorldSize();
    camera.setBounds(0, 0, world.width, world.height);
    camera.centerOn(start.x, start.y);
    camera.startFollow(this.player);
    camera.preRender();
    this.buildAmmoBoxes();
    this.buildWorldItems();
    this.updatePickupPrompt();
    this.updateEnemyVisibility(true);
    this.updateMinimap();
    this.startSurvivalTimer();
    if (IS_DEV)
      (window as Window & { __arenaScene?: Arena }).__arenaScene = this;
    arenaHud.setPlaying();
    this.refreshHud();
  }

  private buildMap(): void {
    this.cancelMapPaletteTransition();
    this.ground?.destroy();
    this.wallArt?.destroy();
    this.ground = undefined;
    this.wallArt = undefined;
    this.walls.clear(true, true);
    this.ammoBoxes.clear(true, true);
    this.worldItems.clear(true, true);
    this.ammoBoxStates.clear();
    this.worldItemStates.clear();
    const world = this.mapWorldSize();
    this.physics.world.setBounds(0, 0, world.width, world.height);
    for (let y = 0; y < this.map.height; y += 1)
      for (let x = 0; x < this.map.width; x += 1)
        if (this.map.tiles[y][x] === 'wall') {
          const px = x * this.map.tileSize;
          const py = y * this.map.tileSize;
          const wall = this.physics.add.staticImage(px + this.map.tileSize / 2, py + this.map.tileSize / 2, 'wall');
          wall.setDisplaySize(this.map.tileSize, this.map.tileSize);
          wall.refreshBody();
          wall.setVisible(false);
          this.walls.add(wall);
        }
    this.walls.refresh();
    this.updateMapPalette(true);
  }

  private updateMapPalette(force = false): void {
    const phase = currentRunPhase(this.runState);
    if (!force && this.mapPhase === phase)
      return;
    this.mapPhase = phase;
    if (force || !this.ground || !this.wallArt) {
      this.cancelMapPaletteTransition();
      this.ground?.destroy();
      this.wallArt?.destroy();
      const palette = this.createMapPaletteGraphics(phase);
      this.ground = palette.ground;
      this.wallArt = palette.wallArt;
      return;
    }

    this.cancelMapPaletteTransition();
    const previousGround = this.ground;
    const previousWallArt = this.wallArt;
    const nextPalette = this.createMapPaletteGraphics(phase);
    nextPalette.ground.setAlpha(0);
    nextPalette.wallArt.setAlpha(0);
    this.fadingGround = nextPalette.ground;
    this.fadingWallArt = nextPalette.wallArt;
    this.mapPaletteTransition = this.tweens.add({
      targets: [nextPalette.ground, nextPalette.wallArt],
      alpha: 1,
      duration: MAP_PALETTE_FADE_MS,
      ease: 'Linear',
      onComplete: () => {
        if (this.fadingGround !== nextPalette.ground || this.fadingWallArt !== nextPalette.wallArt)
          return;
        previousGround.destroy();
        previousWallArt.destroy();
        this.ground = nextPalette.ground;
        this.wallArt = nextPalette.wallArt;
        this.fadingGround = undefined;
        this.fadingWallArt = undefined;
        this.mapPaletteTransition = undefined;
      },
    });
  }

  private cancelMapPaletteTransition(): void {
    this.mapPaletteTransition?.stop();
    this.mapPaletteTransition = undefined;
    this.fadingGround?.destroy();
    this.fadingWallArt?.destroy();
    this.fadingGround = undefined;
    this.fadingWallArt = undefined;
  }

  private createMapPaletteGraphics(phase: RunPhase): { ground: Phaser.GameObjects.Graphics; wallArt: Phaser.GameObjects.Graphics } {
    const ground = this.add.graphics().setDepth(-2);
    const wallArt = this.add.graphics().setDepth(-1);
    const world = this.mapWorldSize();
    const tileSize = this.map.tileSize;
    const palette = phase === 'combat'
      ? { ground: 0x101827, grid: 0x31516b, wall: 0x26374a, wallEdge: 0x55728b }
      : { ground: 0x6b573b, grid: 0xae8a58, wall: 0x79573a, wallEdge: 0xe2bb78 };
    ground.fillStyle(palette.ground, 1).fillRect(0, 0, world.width, world.height).lineStyle(1, palette.grid, 0.55);
    for (let x = 0; x <= world.width; x += tileSize)
      ground.lineBetween(x, 0, x, world.height);
    for (let y = 0; y <= world.height; y += tileSize)
      ground.lineBetween(0, y, world.width, y);
    wallArt.fillStyle(palette.wall, 1).lineStyle(1, palette.wallEdge, 1);
    for (let y = 0; y < this.map.height; y += 1)
      for (let x = 0; x < this.map.width; x += 1)
        if (this.map.tiles[y][x] === 'wall')
          wallArt.fillRect(x * tileSize, y * tileSize, tileSize, tileSize).strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
    const reserve = this.map.centralReserve;
    if (reserve) {
      const x = reserve.bounds.left * tileSize;
      const y = reserve.bounds.top * tileSize;
      const width = (reserve.bounds.right - reserve.bounds.left + 1) * tileSize;
      const height = (reserve.bounds.bottom - reserve.bounds.top + 1) * tileSize;
      const marker = phase === 'combat' ? 0xc58cff : 0x6d3b0b;
      wallArt.fillStyle(marker, 0.22).fillRect(x, y, width, height).lineStyle(3, marker, 1).strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
      Object.values(reserve.approaches).forEach((approach) => {
        wallArt.fillStyle(marker, 1).fillCircle(
          approach.x * tileSize + tileSize / 2,
          approach.y * tileSize + tileSize / 2,
          5,
        );
      });
    }
    return { ground, wallArt };
  }

  private buildAmmoBoxes(): void {
    selectAmmoBoxTiles(this.map).forEach((tile, index) => {
      const boxId = `ammo-box-${index + 1}`;
      const material = AMMO_MATERIAL_BOX_CYCLE[index % AMMO_MATERIAL_BOX_CYCLE.length];
      if (!material)
        throw new Error('弾薬素材の設定がありません。');
      this.ammoBoxStates.set(boxId, {
        originTile: { ...tile },
        currentTile: null,
        respawnCount: 0,
        seedOffset: index,
        material,
        quantity: AMMO_MATERIALS[material].boxQuantity,
      });
      this.spawnAmmoBox(boxId, tile);
    });
  }

  private buildWorldItems(): void {
    const occupied = this.activeAmmoBoxTiles();
    const weaponTiles = selectInitialWeaponPickupTiles(
      this.map,
      occupied,
      INITIAL_WORLD_WEAPON_MODELS.length,
    );
    if (weaponTiles.length !== INITIAL_WORLD_WEAPON_MODELS.length)
      throw new Error('初期world weaponの配置先が不足しています。');
    INITIAL_WORLD_WEAPON_MODELS.forEach((model, index) => {
      const tile = weaponTiles[index];
      if (!tile)
        throw new Error('初期world weaponの配置先が不足しています。');
      const id = `weapon-${model}-${index + 1}`;
      this.spawnWeaponWorldItem(id, createWeaponInstance(id, model), tile);
    });
  }

  private spawnWeaponWorldItem(id: string, weapon: WeaponInstance, tile: TilePosition): void {
    if (this.worldItemStates.has(id))
      return;
    const point = this.world(tile);
    const sprite = this.physics.add.staticImage(point.x, point.y, `weapon-${weapon.model}`).setDepth(1);
    sprite.setData('worldItemId', id);
    sprite.setData('tile', { ...tile });
    this.worldItems.add(sprite);
    this.worldItemStates.set(id, { id, kind: 'weapon', tile: { ...tile }, quantity: 1, weapon: { ...weapon }, sprite });
  }

  private spawnAmmoMaterialWorldItem(id: string, material: AmmoMaterial, quantity: number, tile: TilePosition): void {
    if (this.worldItemStates.has(id) || !Number.isSafeInteger(quantity) || quantity <= 0)
      return;
    const ammo = AMMO_MATERIALS[material];
    const texture = `material-box-${material}`;
    const point = this.world(tile);
    const sprite = this.physics.add.staticImage(point.x, point.y, texture).setDepth(1);
    sprite.setData('worldItemId', id);
    sprite.setData('tile', { ...tile });
    sprite.setData('material', material);
    sprite.setData('quantity', quantity);
    sprite.setData('worldColor', ammo.worldColor);
    sprite.setData('texture', texture);
    this.worldItems.add(sprite);
    this.worldItemStates.set(id, {
      id,
      kind: 'ammo-material',
      tile: { ...tile },
      quantity,
      material,
      worldColor: ammo.worldColor,
      texture,
      sprite,
    });
  }

  private dropScrap(tile: TilePosition, quantity: number): void {
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
      return;
    const id = `material-scrap-${tileKey(tile)}`;
    const current = this.worldItemStates.get(id);
    if (current?.kind === 'material') {
      current.quantity += quantity;
      current.visualTier = scrapVisualTierFor(current.quantity);
      current.sprite.setData('quantity', current.quantity);
      current.sprite.setData('visualTier', current.visualTier);
      current.sprite.setTexture(`material-scrap-${current.visualTier}`);
      return;
    }
    const point = this.world(tile);
    const visualTier = scrapVisualTierFor(quantity);
    const sprite = this.physics.add.staticImage(point.x, point.y, `material-scrap-${visualTier}`).setDepth(1);
    sprite.setData('worldItemId', id);
    sprite.setData('tile', { ...tile });
    sprite.setData('quantity', quantity);
    sprite.setData('visualTier', visualTier);
    this.worldItems.add(sprite);
    this.worldItemStates.set(id, {
      id,
      kind: 'material',
      tile: { ...tile },
      quantity,
      material: 'scrap',
      visualTier,
      sprite,
    });
  }

  private spawnAmmoBox(boxId: string, tile: TilePosition): void {
    const state = this.ammoBoxStates.get(boxId);
    if (!state || state.currentTile !== null || this.hasAmmoBox(boxId) || this.activeAmmoBoxTiles().some(activeTile => sameTile(activeTile, tile)))
      return;
    const ammo = AMMO_MATERIALS[state.material];
    const texture = `material-box-${state.material}`;
    const point = this.world(tile);
    const box = this.physics.add.staticImage(point.x, point.y, texture).setDepth(1);
    box.setData('boxId', boxId);
    box.setData('tile', { ...tile });
    box.setData('tileKey', tileKey(tile));
    box.setData('material', state.material);
    box.setData('quantity', state.quantity);
    box.setData('worldColor', ammo.worldColor);
    box.setData('texture', texture);
    this.ammoBoxes.add(box);
    state.currentTile = { ...tile };
  }

  private hasAmmoBox(boxId: string): boolean {
    return this.ammoBoxes.getChildren().some(child => child.active && child.getData('boxId') === boxId);
  }

  private activeAmmoBoxTiles(): TilePosition[] {
    const tiles: TilePosition[] = [];
    this.ammoBoxStates.forEach((state) => {
      if (state.currentTile)
        tiles.push(state.currentTile);
    });
    return tiles;
  }

  private activeAmmoBoxKeys(): string[] {
    return this.activeAmmoBoxTiles().map(tileKey);
  }

  private activeAmmoBoxEntries(): string[] {
    const entries: string[] = [];
    this.ammoBoxStates.forEach((state, boxId) => {
      if (state.currentTile)
        entries.push(`${boxId}:${tileKey(state.currentTile)}:${state.material}:${state.quantity}:${AMMO_MATERIALS[state.material].worldColor}:material-box-${state.material}`);
    });
    return entries;
  }

  private activeWorldItemTiles(): TilePosition[] {
    return [...this.worldItemStates.values()]
      .filter(item => item.sprite.active)
      .map(item => item.tile);
  }

  private activeEnemyTiles(): TilePosition[] {
    return ENEMY_IDS
      .filter(id => this.enemyActors[id].active)
      .map(id => this.tile(this.enemyActors[id].sprite));
  }

  private activeWorldItemEntries(): string[] {
    return [...this.worldItemStates.values()]
      .filter(item => item.sprite.active)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((item) => {
        const itemType = item.kind === 'weapon'
          ? item.weapon.model
          : item.kind === 'material'
            ? item.material
            : item.material;
        const visualTier = item.kind === 'material' ? item.visualTier : '';
        const worldColor = item.kind === 'ammo-material' ? item.worldColor : '';
        const texture = item.kind === 'ammo-material' ? item.texture : '';
        return `${item.id}:${item.kind}:${itemType}:${tileKey(item.tile)}:${item.quantity}:${visualTier}:${worldColor}:${texture}`;
      });
  }

  private offscreenAmmoBoxIds(): string[] {
    const view = this.viewport();
    const ids: string[] = [];
    this.ammoBoxStates.forEach((state, boxId) => {
      const tile = state.currentTile;
      if (tile && (tile.x < view.left || tile.x > view.right || tile.y < view.top || tile.y > view.bottom))
        ids.push(boxId);
    });
    return ids;
  }

  private nearbyPickup(): NearbyPickup | undefined {
    const candidates: NearbyPickup[] = [];
    this.ammoBoxes.getChildren().forEach((box) => {
      if (!box.active)
        return;
      const id = box.getData('boxId') as string | undefined;
      const tile = box.getData('tile') as TilePosition | undefined;
      const state = id ? this.ammoBoxStates.get(id) : undefined;
      if (state && state.quantity > 0 && id && tile)
        candidates.push({ id: `0:${id}`, tile, kind: 'ammo', box });
    });
    this.worldItemStates.forEach((item) => {
      if (!item.sprite.active)
        return;
      const priority = item.kind === 'weapon' ? '1' : item.kind === 'material' ? '2' : '0';
      candidates.push({ id: `${priority}:${item.id}`, tile: item.tile, kind: 'world', item });
    });
    return selectNearbyPickup(this.tile(this.player), this.muzzlePickupAnchor(), candidates);
  }

  private muzzlePickupAnchor(): { x: number; y: number } {
    const direction = dashDirectionFor(this.player, this.aimPoint())
      ?? { x: Math.cos(this.player.rotation), y: Math.sin(this.player.rotation) };
    const distance = this.player.displayWidth / 2;
    return {
      x: (this.player.x + direction.x * distance) / this.map.tileSize,
      y: (this.player.y + direction.y * distance) / this.map.tileSize,
    };
  }

  private updateAimDirection(pointer: Phaser.Input.Pointer): void {
    const direction = dashDirectionFor(this.player, { x: pointer.worldX, y: pointer.worldY });
    if (direction)
      this.aimDirection = direction;
  }

  private aimPoint(): { x: number; y: number } {
    const direction = this.aimDirection ?? { x: Math.cos(this.player.rotation), y: Math.sin(this.player.rotation) };
    return {
      x: this.player.x + direction.x * TILE_SIZE,
      y: this.player.y + direction.y * TILE_SIZE,
    };
  }

  private updatePickupPrompt(): void {
    const pickup = this.state.defeated || this.state.victory ? undefined : this.nearbyPickup();
    arenaHud.setPickupPrompt(pickup ? this.pickupPromptFor(pickup) : undefined);
  }

  private pickupPromptFor(pickup: NearbyPickup): PickupPrompt {
    if (pickup.kind === 'ammo') {
      const boxId = pickup.box.getData('boxId') as string | undefined;
      const state = boxId ? this.ammoBoxStates.get(boxId) : undefined;
      if (state)
        return { target: `${AMMO_MATERIALS[state.material].label} ${state.quantity}個`, action: 'を拾う [E]' };
      return { target: '弾薬素材箱', action: 'を拾う [E]' };
    }
    if (pickup.item.kind === 'weapon')
      return { target: WEAPONS[pickup.item.weapon.model].label, action: 'を拾う [E]' };
    if (pickup.item.kind === 'ammo-material')
      return { target: `${AMMO_MATERIALS[pickup.item.material].label} ${pickup.item.quantity}個`, action: 'を拾う [E]' };
    return { target: `スクラップ ${pickup.item.quantity}個`, action: 'を拾う [E]' };
  }

  private toggleInventory(): void {
    if (this.state.defeated || this.state.victory)
      return;
    this.input.activePointer.reset();
    this.inventoryOpen = !this.inventoryOpen;
    arenaHud.setInventoryOpen(this.inventoryOpen);
  }

  private handleInventoryDrop(source: InventoryDragSource, target: InventoryDropTarget): void {
    if (this.state.defeated || this.state.victory)
      return;
    if (source.kind === 'material') {
      if (target === 'world')
        this.dropInventoryAmmoMaterial(source.material);
      return;
    }
    if (target === 'world') {
      this.dropInventoryWeapon(source.slot);
      return;
    }
    const next = moveInventoryWeapon(this.state, source.slot, target);
    if (!this.applyInventoryState(next))
      return;
    arenaHud.setFeedback('武器を移動しました');
  }

  private dropInventoryWeapon(source: InventorySlotRef): void {
    const weapon = inventoryWeaponAt(this.state, source);
    if (!weapon)
      return;
    const tile = selectWorldWeaponDropTile(this.map, this.tile(this.player), [
      ...this.activeWorldItemTiles(),
      ...this.activeAmmoBoxTiles(),
      ...this.activeEnemyTiles(),
    ]);
    if (!tile) {
      arenaHud.setInventoryDragMessage('置ける場所がありません');
      return;
    }
    const next = removeInventoryWeapon(this.state, source);
    if (next === this.state)
      return;
    const id = this.nextDroppedWeaponId(weapon.model);
    this.spawnWeaponWorldItem(id, weapon, tile);
    this.applyInventoryState(next);
    arenaHud.setFeedback(`${WEAPONS[weapon.model].label}を置きました`);
    this.updatePickupPrompt();
  }

  private dropInventoryAmmoMaterial(material: AmmoMaterial): void {
    const result = dropAmmoMaterial(this.state, material);
    if (result.dropped === 0)
      return;
    const tile = selectWorldWeaponDropTile(this.map, this.tile(this.player), [
      ...this.activeWorldItemTiles(),
      ...this.activeAmmoBoxTiles(),
      ...this.activeEnemyTiles(),
    ]);
    if (!tile) {
      arenaHud.setInventoryDragMessage('置ける場所がありません');
      return;
    }
    const id = this.nextDroppedAmmoMaterialId(material);
    this.spawnAmmoMaterialWorldItem(id, material, result.dropped, tile);
    this.applyInventoryState(result.state);
    arenaHud.setFeedback(`${AMMO_MATERIALS[material].label}を${result.dropped}個置きました`);
    this.updatePickupPrompt();
  }

  private applyInventoryState(next: CombatState): boolean {
    if (next === this.state)
      return false;
    if (this.state.reloading !== null && next.reloading === null)
      this.clearReloadTimer();
    this.state = next;
    this.refreshHud();
    return true;
  }

  private nextDroppedWeaponId(model: WeaponModel): string {
    let sequence = this.droppedWeaponSequence + 1;
    let id = `dropped-weapon-${this.generation}-${model}-${sequence}`;
    while (this.worldItemStates.has(id)) {
      sequence += 1;
      id = `dropped-weapon-${this.generation}-${model}-${sequence}`;
    }
    this.droppedWeaponSequence = sequence;
    return id;
  }

  private nextDroppedAmmoMaterialId(material: AmmoMaterial): string {
    let sequence = this.droppedAmmoSequence + 1;
    let id = `dropped-ammo-material-${this.generation}-${material}-${sequence}`;
    while (this.worldItemStates.has(id)) {
      sequence += 1;
      id = `dropped-ammo-material-${this.generation}-${material}-${sequence}`;
    }
    this.droppedAmmoSequence = sequence;
    return id;
  }

  private startSurvivalTimer(): void {
    const generation = this.generation;
    this.survivalTimer = this.time.delayedCall(runDurationMs(this.runState.schedule), () => {
      this.survivalTimer = undefined;
      if (generation !== this.generation)
        return;
      this.updateSurvival();
    });
  }

  private updateSurvival(): void {
    const elapsedMs = this.time.now - this.survivalStartedAt;
    const nextRunState = advanceRunState(this.runState, elapsedMs);
    this.runState = nextRunState;
    this.updateMapPalette();
    if (this.hasReachedInitialCombat(elapsedMs))
      this.startEnemyLifecycle();
    this.updateSurvivalHud();
    if (nextRunState.status !== 'victory')
      return;
    const nextCombatState = advanceSurvivalState(
      this.state,
      this.survivalStartedAt,
      this.time.now,
      runDurationMs(nextRunState.schedule),
    );
    if (nextCombatState === this.state)
      return;
    this.state = nextCombatState;
    this.enterTerminal('victory');
  }

  private updateSurvivalHud(): void {
    arenaHud.updateSurvival(remainingSurvivalMs(
      this.survivalStartedAt,
      this.time.now,
      runDurationMs(this.runState.schedule),
    ));
    arenaHud.updateRun(this.runState);
  }

  private updateSpawnPhaseHud(): void {
    const phase = this.currentSpawnPhase();
    const primaryDirection = primarySpawnDirection(this.map.seed, phase);
    arenaHud.updateSpawnPhase(phase, primaryDirection);
  }

  private startEnemyLifecycle(): void {
    if (
      this.enemyLifecycleStarted
      || this.state.defeated
      || this.state.victory
      || !this.hasReachedInitialCombat()
    ) return;
    this.enemyLifecycleStarted = true;
    this.combatStartedAt = this.survivalStartedAt + this.runState.schedule.restDurationMs;
    initialEnemyIdsFor(ENEMY_SPAWN_CONFIG).forEach((id) => {
      if (!this.spawnEnemy(id, 'initial'))
        this.scheduleEnemySpawn(id, 'initial', 1000);
    });
    staggeredEnemiesFor(ENEMY_SPAWN_CONFIG).forEach(({ id, delay }) => {
      this.scheduleEnemySpawn(id, 'stagger', delay);
    });
    this.updateSpawnPhaseHud();
    this.refreshHud();
  }

  private hasReachedInitialCombat(elapsedMs = this.time.now - this.survivalStartedAt): boolean {
    return this.runState.status === 'playing'
      && elapsedMs >= this.runState.schedule.restDurationMs;
  }

  private currentSpawnPhase(): number {
    return this.enemyLifecycleStarted ? spawnPhaseAt(this.combatStartedAt, this.time.now) : 0;
  }

  private stopRunTimers(): void {
    this.cancelPlayerDash();
    this.survivalTimer?.remove(false);
    this.survivalTimer = undefined;
    this.cancelMapPaletteTransition();
    this.enemySpawnTimers.forEach(timer => timer.remove(false));
    this.ammoBoxRespawns.forEach(timer => timer.remove(false));
    this.enemySpawnTimers.clear();
    this.ammoBoxRespawns.clear();
    this.effects.stop();
    this.reloadTimer?.remove(false);
    this.reloadTimer = undefined;
    this.recyclingEnemyId = undefined;
  }

  private updateVisibilityMask(force = false): void {
    const playerTile = this.tile(this.player);
    if (!force && this.visibilityMaskPlayerTile && sameTile(this.visibilityMaskPlayerTile, playerTile))
      return;
    const context = this.visibilityMaskTexture.context;
    context.clearRect(0, 0, this.map.width, this.map.height);
    context.fillStyle = '#000000';
    const nextVisibleTileKeys = new Set<string>();
    let observedTerrainChanged = false;
    let obscuredTileCount = 0;
    for (let y = 0; y < this.map.height; y += 1)
      for (let x = 0; x < this.map.width; x += 1)
        if (!hasLineOfSight(this.map, playerTile, { x, y })) {
          context.fillRect(x, y, 1, 1);
          obscuredTileCount += 1;
        } else {
          const key = `${x},${y}`;
          const tile = this.map.tiles[y][x];
          nextVisibleTileKeys.add(key);
          if (this.observedTiles.get(key) !== tile) {
            this.observedTiles.set(key, tile);
            observedTerrainChanged = true;
          }
        }
    this.visibilityMaskTexture.refresh();
    const visibleTerrainChanged = nextVisibleTileKeys.size !== this.visibleTileKeys.size
      || [...nextVisibleTileKeys].some(key => !this.visibleTileKeys.has(key));
    if (visibleTerrainChanged) {
      this.visibleTileKeys.clear();
      nextVisibleTileKeys.forEach(key => this.visibleTileKeys.add(key));
    }
    if (observedTerrainChanged || visibleTerrainChanged)
      this.minimapTerrainChanged = true;
    this.visibilityMaskPlayerTile = { ...playerTile };
    arenaHud.updateVisibilityMask(this.visibilityMask.alpha, obscuredTileCount, playerTile);
  }

  private resetVisibilityMask(): void {
    const world = this.mapWorldSize();
    if (!this.visibilityMaskTexture) {
      const texture = this.textures.createCanvas(VISIBILITY_MASK_TEXTURE_KEY, this.map.width, this.map.height);
      if (!texture)
        throw new Error('視界mask用CanvasTextureを作成できません。');
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.visibilityMaskTexture = texture;
      this.visibilityMask = this.add.image(0, 0, VISIBILITY_MASK_TEXTURE_KEY);
    } else {
      this.visibilityMaskTexture.setSize(this.map.width, this.map.height);
    }
    this.visibilityMask
      .setPosition(0, 0)
      .setOrigin(0)
      .setDisplaySize(world.width, world.height)
      .setDepth(2)
      .setAlpha(0.25);
  }

  private updateMinimap(): void {
    const markers: MinimapMarker[] = [];
    if (!this.state.defeated && !this.state.victory) {
      ENEMY_IDS.forEach((id) => {
        const actor = this.enemyActors[id];
        if (!actor.active || actor.runtimeView().visibility !== 'normal')
          return;
        const tile = this.tile(actor.sprite);
        if (this.visibleTileKeys.has(tileKey(tile)))
          markers.push({ kind: 'enemy', tile });
      });
      this.ammoBoxStates.forEach((state) => {
        if (state.currentTile && state.quantity > 0 && this.visibleTileKeys.has(tileKey(state.currentTile)))
          markers.push({ kind: 'ammo', tile: state.currentTile });
      });
      this.worldItemStates.forEach((item) => {
        if (!item.sprite.active || !this.visibleTileKeys.has(tileKey(item.tile)))
          return;
        markers.push({
          kind: item.kind === 'weapon' ? 'weapon' : item.kind === 'ammo-material' ? 'ammo' : 'scrap',
          tile: item.tile,
        });
      });
    }
    arenaHud.updateMinimap({
      map: this.map,
      observedTiles: this.observedTiles,
      visibleTileKeys: this.visibleTileKeys,
      terrainChanged: this.minimapTerrainChanged,
      playerTile: this.tile(this.player),
      markers,
    });
    this.minimapTerrainChanged = false;
  }

  private moveEnemy(id: EnemyInstanceId): void {
    const actor = this.enemyActors[id];
    const enemy = actor.sprite;
    if (this.physics.world.isPaused || !actor.active)
      return;
    actor.applyMovement(this.time.now, () => {
      const config = ENEMIES[id];
      const speedMultiplier = enemySpeedMultiplierForPhase(currentRunPhase(this.runState));
      const playerTile = this.tile(this.player);
      const enemyTile = this.tile(enemy);
      const cached = this.paths[id];
      if (
        !cached
        || this.time.now >= cached.nextAt
        || !sameTile(cached.playerTile, playerTile)
        || !sameTile(cached.enemyTile, enemyTile)
      ) {
        const approachTarget = config.kind === 'basic'
          ? this.basicApproachTarget(id, enemyTile, playerTile)
          : playerTile;
        const tieBreakSeed = config.kind === 'basic'
          ? nextSeed(this.map.seed + ENEMY_IDS.indexOf(id))
          : undefined;
        let path = findPath(this.map, enemyTile, approachTarget, tieBreakSeed);
        if (path.length === 0 && !sameTile(approachTarget, playerTile))
          path = findPath(this.map, enemyTile, playerTile, tieBreakSeed);
        this.paths[id] = {
          path,
          nextAt: this.time.now + 250,
          playerTile,
          enemyTile,
        };
      }
      const next = this.paths[id].path[1];
      if (!next)
        return { x: 0, y: 0 };
      const target = this.world(next);
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const length = Math.hypot(dx, dy) || 1;
      if (config.kind === 'drone') {
        const side = droneLateralSpeedAt(this.time.now);
        return {
          x: ((dx / length) * config.speed - (dy / length) * side) * speedMultiplier,
          y: ((dy / length) * config.speed + (dx / length) * side) * speedMultiplier,
        };
      }
      const separation = this.basicSeparation(id);
      const desiredX = dx / length + separation.x * 0.45;
      const desiredY = dy / length + separation.y * 0.45;
      const desiredLength = Math.hypot(desiredX, desiredY) || 1;
      return {
        x: (desiredX / desiredLength) * config.speed * speedMultiplier,
        y: (desiredY / desiredLength) * config.speed * speedMultiplier,
      };
    });
  }

  private basicApproachTarget(id: EnemyInstanceId, enemy: TilePosition, player: TilePosition): TilePosition {
    const role = basicApproachRoleFor(id);
    if (role === null || role === 'direct') return player;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const side = role === 'left' ? 1 : -1;
    if (Math.abs(dx) >= Math.abs(dy))
      return { x: player.x, y: player.y - Math.sign(dx || 1) * side * 2 };
    return { x: player.x + Math.sign(dy || 1) * side * 2, y: player.y };
  }

  private basicSeparation(id: EnemyInstanceId): { x: number; y: number } {
    const enemy = this.enemyActors[id].sprite;
    let x = 0;
    let y = 0;
    ENEMY_IDS.forEach((otherId) => {
      const otherActor = this.enemyActors[otherId];
      const other = otherActor.sprite;
      if (otherId === id || ENEMIES[otherId].kind !== 'basic' || !otherActor.active) return;
      const dx = enemy.x - other.x;
      const dy = enemy.y - other.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= TILE_SIZE) return;
      if (distance < 0.001) {
        x += ENEMY_IDS.indexOf(id) < ENEMY_IDS.indexOf(otherId) ? -1 : 1;
        return;
      }
      const strength = (TILE_SIZE - distance) / TILE_SIZE;
      x += (dx / distance) * strength;
      y += (dy / distance) * strength;
    });
    return { x, y };
  }

  private spawnEnemy(id: EnemyInstanceId, reason: EnemySpawnReason): boolean {
    if (!this.enemyLifecycleStarted || this.state.defeated || this.state.victory)
      return false;
    const playerTile = this.tile(this.player);
    const phase = this.currentSpawnPhase();
    const primaryDirection = primarySpawnDirection(this.map.seed, phase);
    const stableSlot = ENEMY_IDS.indexOf(id);
    const direction = spawnDirectionForSlot(primaryDirection, stableSlot);
    const actor = this.enemyActors[id];
    const occupied = [
      playerTile,
      ...this.activeAmmoBoxTiles(),
      ...this.activeWorldItemTiles(),
      ...ENEMY_IDS
        .filter(other => other !== id && this.enemyActors[other].active)
        .map(other => this.tile(this.enemyActors[other].sprite)),
    ];
    const tile = selectEnemySpawnTile(
      this.map,
      { player: playerTile, viewport: this.viewport(), occupied, direction },
      nextSeed(this.map.seed + this.respawnCount[id] * 31 + this.recycleCount[id] * 131 + stableSlot),
      ENEMY_SPAWN_CONFIG.candidatePool,
    );
    if (!tile) {
      actor.setSpawnReason(reason);
      actor.deactivate();
      this.syncEnemyHud(id);
      return false;
    }
    const point = this.world(tile);
    actor.activate(point.x, point.y);
    this.runState = recordEnemySpawned(this.runState, id);
    actor.setSpawnMetadata({
      spawnPhase: String(phase),
      primaryDirection,
      assignedDirection: direction,
      spawnTile: tileKey(tile),
      spawnReason: reason,
    });
    this.hiddenSince.delete(id);
    this.paths[id] = {
      path: [],
      nextAt: 0,
      playerTile,
      enemyTile: tile,
    };
    this.updateVisibilityMask(true);
    this.updateEnemyVisibility(true);
    return true;
  }

  private scheduleEnemySpawn(id: EnemyInstanceId, reason: EnemySpawnReason, delay: number): void {
    if (!this.enemyLifecycleStarted || this.state.defeated || this.state.victory)
      return;
    this.enemySpawnTimers.get(id)?.remove(false);
    this.enemyActors[id].setSpawnReason(reason);
    this.hideEnemyVisuals(id);
    const generation = this.generation;
    const timer = this.time.delayedCall(delay, () => {
      if (this.enemySpawnTimers.get(id) === timer)
        this.enemySpawnTimers.delete(id);
      if (generation !== this.generation || !this.enemyLifecycleStarted || this.state.defeated || this.state.victory)
        return;
      if (!this.spawnEnemy(id, reason)) {
        this.scheduleEnemySpawn(id, reason, 1000);
        return;
      }
      if (reason === 'death') {
        this.state = respawnEnemy(this.state, id);
        this.lastHitAt[id] = Number.NEGATIVE_INFINITY;
      }
      if (reason === 'recycle' && this.recyclingEnemyId === id)
        this.recyclingEnemyId = undefined;
      this.refreshHud();
    });
    this.enemySpawnTimers.set(id, timer);
  }

  private updateEnemyVisibility(force = false): void {
    const playerTile = this.tile(this.player);
    ENEMY_IDS.forEach((id) => {
      const actor = this.enemyActors[id];
      const enemy = actor.sprite;
      if (!actor.active) {
        if (isEnemyDefeated(this.state, id) && actor.showDefeatedHitStop(this.time.now)) {
          this.syncEnemyHud(id);
          return;
        }
        this.hideEnemyVisuals(id);
        delete this.visibilityTiles[id];
        return;
      }
      actor.syncSilhouettePosition();
      const enemyTile = this.tile(enemy);
      const previous = this.visibilityTiles[id];
      if (!force && previous && sameTile(previous.player, playerTile) && sameTile(previous.enemy, enemyTile)) {
        const visibility = actor.runtimeView().visibility;
        this.syncEnemyHud(id);
        this.updateHiddenRecycle(id, visibility, playerTile, enemyTile);
        return;
      }
      const visibility = enemyVisibility(this.map, playerTile, enemyTile);
      this.applyEnemyVisibility(id, visibility);
      this.visibilityTiles[id] = { player: playerTile, enemy: enemyTile };
      this.updateHiddenRecycle(id, visibility, playerTile, enemyTile);
    });
  }

  private updateHiddenRecycle(
    id: EnemyInstanceId,
    visibility: EnemyVisibility,
    playerTile: TilePosition,
    enemyTile: TilePosition,
  ): void {
    if (!this.hiddenRecycleEnabled) {
      this.hiddenSince.delete(id);
      return;
    }
    if (visibility !== 'hidden') {
      this.hiddenSince.delete(id);
      return;
    }
    const hiddenSince = this.hiddenSince.get(id);
    if (hiddenSince === undefined) {
      this.hiddenSince.set(id, this.time.now);
      return;
    }
    const threshold = hiddenRecycleThresholdFor(id, this.recycleCount[id], this.map.seed);
    if (this.time.now - hiddenSince < threshold) return;
    if (this.recyclingEnemyId !== undefined || this.time.now - this.lastHitAt[id] < 3000) {
      this.hiddenSince.set(id, this.time.now);
      return;
    }
    const pathDistance = findPath(this.map, enemyTile, playerTile).length - 1;
    if (pathDistance < hiddenRecyclePathDistanceForPhase(currentRunPhase(this.runState))) {
      this.hiddenSince.set(id, this.time.now);
      return;
    }
    this.recyclingEnemyId = id;
    this.recycleCount[id] += 1;
    this.runState = recordEnemyRecycled(this.runState, id);
    this.enemyActors[id].setSpawnReason('recycle');
    this.enemyActors[id].deactivate();
    this.syncEnemyHud(id);
    delete this.paths[id];
    delete this.visibilityTiles[id];
    this.hiddenSince.delete(id);
    this.scheduleEnemySpawn(id, 'recycle', recycleDelayFor(id, this.recycleCount[id], this.map.seed));
    this.refreshHud();
  }

  private applyEnemyVisibility(id: EnemyInstanceId, visibility: EnemyVisibility): void {
    this.enemyActors[id].applyVisibility(visibility);
    this.syncEnemyHud(id);
  }

  private hideEnemyVisuals(id: EnemyInstanceId): void {
    this.enemyActors[id].hideVisuals();
    this.syncEnemyHud(id);
  }

  private syncEnemyHud(id: EnemyInstanceId): void {
    arenaHud.updateEnemy(id, this.enemyActors[id].hudView(this.recycleCount[id]));
  }

  private changeQuickSlot(slot: number): void {
    if (this.state.defeated || this.state.victory || this.state.inventory.selectedQuickSlot === slot)
      return;
    const weapon = this.state.inventory.quickSlots[slot];
    if (!weapon)
      return;
    const next = selectQuickSlot(this.state, slot);
    const interrupted = this.state.reloading !== null && next.reloading === null;
    if (interrupted) this.clearReloadTimer();
    this.state = next;
    arenaHud.setFeedback(interrupted ? `リロード中断: ${WEAPONS[weapon.model].label}` : `武器: ${WEAPONS[weapon.model].label}`);
    this.refreshHud();
  }

  private reload(): void {
    if (this.state.defeated || this.state.victory)
      return;
    const weapon = activeWeapon(this.state);
    if (!weapon)
      return;
    const definition = WEAPONS[weapon.model];
    const next = startReload(this.state);
    if (next === this.state) {
      arenaHud.setFeedback(this.state.reloading !== null
        ? 'リロード中です'
        : this.state.inventory.materials[definition.material] < definition.materialCostPerShot
          ? `${AMMO_MATERIALS[definition.material].label}が不足しています。素材箱を探してください`
          : '弾倉は満タンです');
      return;
    }
    this.state = next;
    const generation = this.generation;
    arenaHud.setFeedback(`リロード中: ${definition.label}`);
    const timer = this.time.delayedCall(reloadDurationForWorldWeapon(definition.reloadMs, this.playerRole.id), () => {
      if (
        this.reloadTimer !== timer
        || generation !== this.generation
        || this.state.defeated
        || this.state.victory
        || this.state.reloading !== weapon.id
        || activeWeapon(this.state)?.id !== weapon.id
      )
        return;
      this.state = completeReload(this.state, weapon.id);
      this.reloadTimer = undefined;
      arenaHud.setFeedback(`リロード完了: ${definition.label}`);
      this.refreshHud();
    });
    this.reloadTimer = timer;
    this.refreshHud();
  }

  private stopReload(): void {
    this.clearReloadTimer();
    this.state = cancelReload(this.state);
  }

  private clearReloadTimer(): void {
    this.reloadTimer?.remove(false);
    this.reloadTimer = undefined;
  }

  private tryFire(): void {
    if (this.inventoryOpen || this.state.defeated || this.state.victory || (this.playerDash && !canFireWhileDashing(this.playerRole.id)))
      return;
    const weaponInstance = activeWeapon(this.state);
    if (!weaponInstance)
      return;
    const weapon = WEAPONS[weaponInstance.model];
    if (weaponInstance.magazine === 0) {
      this.reload();
      return;
    }
    if (BULLET_POOL_SIZE - this.bullets.countActive(true) < weapon.pellets)
      return;
    const result = fireWeapon(this.state, this.time.now);
    this.state = result.state;
    if (!result.fired) {
      if (this.state.reloading !== null)
        arenaHud.setFeedback('リロード中です');
      else if (activeWeapon(this.state)?.magazine === 0)
        arenaHud.setFeedback('弾切れ: Rでリロード');
      return;
    }
    const aim = this.aimPoint();
    const base = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    this.effects.playWeaponFire(this.player, weaponInstance.model, base);
    for (let index = 0; index < weapon.pellets; index += 1) {
      const bullet = this.bullets.get(this.player.x, this.player.y, `bullet-${weaponInstance.model}`) as Phaser.Physics.Arcade.Sprite | null;
      if (!bullet)
        continue;
      const ratio = weapon.pellets === 1 ? 0 : index / (weapon.pellets - 1) - 0.5;
      const angle = base + ratio * weapon.spread * 2;
      bullet
        .enableBody(true, this.player.x, this.player.y, true, true)
        .setTexture(`bullet-${weaponInstance.model}`)
        .setScale(weapon.bulletHitboxScale)
        // Arcade BodyはGameObjectのscaleを適用するため、非スケールframe寸法を渡す。
        .setBodySize(bullet.width, bullet.height, true)
        .setVelocity(Math.cos(angle) * weapon.speed, Math.sin(angle) * weapon.speed);
      this.meta.set(bullet, { weapon: weaponInstance.model, damageType: weapon.damageType, damage: weapon.damage, range: weapon.range, knockback: weapon.knockback, startX: this.player.x, startY: this.player.y, directionX: Math.cos(angle), directionY: Math.sin(angle) });
    }
    this.refreshHud();
  }

  private hitEnemy(firstObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile, secondObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile, id: EnemyInstanceId): void {
    const first = firstObject as Phaser.Physics.Arcade.Sprite;
    const second = secondObject as Phaser.Physics.Arcade.Sprite;
    const bullet = this.meta.has(first) ? first : second;
    const enemy = bullet === first ? second : first;
    const data = this.meta.get(bullet);
    const actor = this.enemyActors[id];
    if (!data || enemy !== actor.sprite || !actor.active || this.state.defeated || this.state.victory)
      return;
    this.disableBullet(bullet);
    this.lastHitAt[id] = this.time.now;
    const result = resolveDamage(this.state.enemies[id].kind, data.damageType, data.damage);
    const previousHp = this.state.enemies[id].hp;
    this.state = damageEnemy(this.state, id, result.amount);
    if (this.state.enemies[id].hp < previousHp)
      this.extendGunslingerComboTimeout();
    const defeated = isEnemyDefeated(this.state, id);
    this.startEnemyImpact(id, data.weapon, defeated);
    arenaHud.setFeedback(`${result.resisted ? '耐性' : '命中'}: ${WEAPONS[data.weapon].label} → ${ENEMY_LABELS[id]}`);
    this.effects.flashEnemy(enemy);
    if (data.knockback > 0) {
      actor.startKnockback({
        x: data.directionX * data.knockback,
        y: data.directionY * data.knockback,
      }, actor.hitStopEndsAt + 180);
    }
    if (defeated) this.scheduleDefeatedEnemy(id);
    this.refreshHud();
  }

  private scheduleDefeatedEnemy(id: EnemyInstanceId): void {
    const actor = this.enemyActors[id];
    const enemy = actor.sprite;
    if (!actor.active || this.state.defeated || this.state.victory)
      return;
    const tile = this.tile(enemy);
    if (this.playerRole.id === 'gunslinger')
      this.gunslingerCombo = gunslingerComboAfterEvent(this.gunslingerCombo);
    this.runState = recordEnemyDefeated(this.runState, id);
    actor.deactivateDefeated();
    this.syncEnemyHud(id);
    this.hiddenSince.delete(id);
    delete this.paths[id];
    delete this.visibilityTiles[id];
    this.respawnCount[id] += 1;
    this.dropScrap(tile, SCRAP_DROP_AMOUNTS[ENEMIES[id].kind]);
    const delay = respawnDelayFor(ENEMIES[id].kind, id, this.respawnCount[id], this.map.seed);
    this.scheduleEnemySpawn(id, 'death', delay);
    if (actor.showDefeatedHitStop(this.time.now))
      this.syncEnemyHud(id);
  }

  private handlePlayerEnemyOverlap(id: EnemyInstanceId): void {
    if (this.playerRole.id === 'gunslinger' && this.playerDash) {
      this.bootKnifeEnemy(id);
      return;
    }
    this.hitPlayer(id);
  }

  private bootKnifeEnemy(id: EnemyInstanceId): void {
    const actor = this.enemyActors[id];
    const enemy = actor.sprite;
    if (
      !this.playerDash
      || !actor.active
      || this.gunslingerDashEnemyIds.has(id)
      || this.state.defeated
      || this.state.victory
    )
      return;
    this.gunslingerDashEnemyIds.add(id);
    this.lastHitAt[id] = this.time.now;
    const previousHp = this.state.enemies[id].hp;
    this.state = damageEnemy(this.state, id, GUNSLINGER_BOOT_KNIFE_DAMAGE);
    if (this.state.enemies[id].hp < previousHp)
      this.extendGunslingerComboTimeout();
    const defeated = isEnemyDefeated(this.state, id);
    this.startEnemyImpact(id, 'rifle', defeated);
    this.effects.flashEnemy(enemy);
    arenaHud.setFeedback(`ブーツナイフ: ${ENEMY_LABELS[id]}`);
    if (defeated) this.scheduleDefeatedEnemy(id);
    this.gunslingerCombo = gunslingerComboAfterEvent(this.gunslingerCombo);
    this.gunslingerSpeedBuffUntil = gunslingerSpeedBuffUntil(this.time.now);
    this.refreshHud();
  }

  private hitPlayer(id: EnemyInstanceId): void {
    if (this.playerDash || (IS_DEV && this.debugPlayerInvulnerable))
      return;
    if (this.state.defeated || this.state.victory || this.time.now - this.contactAt[id] < ENEMIES[id].cooldown)
      return;
    this.contactAt[id] = this.time.now;
    this.startPlayerImpact(ENEMIES[id].kind);
    const previousPlayerHp = this.state.playerHp;
    this.state = damagePlayer(this.state, ENEMIES[id].damage);
    if (this.state.playerHp < previousPlayerHp)
      this.resetGunslingerCombo();
    if (!this.state.defeated) {
      this.refreshHud();
      return;
    }
    this.enterTerminal('defeat');
  }

  private startEnemyImpact(id: EnemyInstanceId, weapon: WeaponModel, defeated: boolean): void {
    const duration = defeated ? ENEMY_DEFEAT_HIT_STOP_MS[weapon] : ENEMY_HIT_STOP_MS[weapon];
    const actor = this.enemyActors[id];
    actor.startHitStop(this.time.now, duration);
    this.effects.playEnemyImpact(actor.sprite, ENEMIES[id].kind, weapon, defeated);
  }

  private startPlayerImpact(kind: EnemyKind): void {
    this.playerHitStopUntil = Math.max(this.playerHitStopUntil, this.time.now + PLAYER_HIT_STOP_MS[kind]);
    this.player.setVelocity(0, 0);
    this.effects.playPlayerImpact(kind);
  }

  private enterTerminal(result: 'defeat' | 'victory'): void {
    this.runState = result === 'defeat'
      ? defeatRun(this.runState)
      : advanceRunState(this.runState, runDurationMs(this.runState.schedule));
    this.stopRunTimers();
    this.state = cancelReload(this.state);
    this.resetGunslingerState();
    this.player.setVelocity(0, 0);
    ENEMY_IDS.forEach((enemyId) => {
      this.enemyActors[enemyId].stop();
      this.hideEnemyVisuals(enemyId);
    });
    this.disableAllBullets();
    this.physics.pause();
    this.inventoryOpen = false;
    arenaHud.setInventoryOpen(false);
    arenaHud.setPickupPrompt(undefined);
    this.updateMinimap();
    arenaHud.showResult(result);
    this.refreshHud();
  }

  private scheduleAmmoBoxRespawn(boxId: string): void {
    if (this.ammoBoxRespawns.has(boxId))
      return;
    const state = this.ammoBoxStates.get(boxId);
    if (!state || state.currentTile !== null)
      return;
    const generation = this.generation;
    this.ammoBoxRespawns.set(boxId, this.time.delayedCall(AMMO_BOX_RESPAWN_MS, () => {
      this.ammoBoxRespawns.delete(boxId);
      if (generation !== this.generation || this.state.defeated || this.state.victory)
        return;
      const current = this.ammoBoxStates.get(boxId);
      if (!current || current.currentTile !== null || this.hasAmmoBox(boxId))
        return;
      current.respawnCount += 1;
      const playerTile = this.tile(this.player);
      const occupied = [
        playerTile,
        current.originTile,
        ...this.activeAmmoBoxTiles(),
        ...this.activeWorldItemTiles(),
        ...ENEMY_IDS
          .filter(id => this.enemyActors[id].active)
          .map(id => this.tile(this.enemyActors[id].sprite)),
      ];
      const tile = selectSpawnTile(
        this.map,
        { player: playerTile, viewport: this.viewport(), occupied },
        nextSeed(this.map.seed + current.respawnCount + current.seedOffset),
      );
      if (!tile) {
        arenaHud.setFeedback('弾薬素材箱の再配置先がありません');
        this.refreshHud();
        return;
      }
      current.quantity = AMMO_MATERIALS[current.material].boxQuantity;
      this.spawnAmmoBox(boxId, tile);
      this.refreshHud();
    }));
  }

  private collectAmmoBox(box: Phaser.GameObjects.GameObject): void {
    if (this.state.defeated || this.state.victory || !box.active)
      return;
    const boxId = box.getData('boxId') as string | undefined;
    const state = boxId ? this.ammoBoxStates.get(boxId) : undefined;
    if (!boxId || !state || state.currentTile === null || this.ammoBoxRespawns.has(boxId))
      return;
    const next = collectMaterial(this.state, state.material, state.quantity);
    if (next === this.state)
      return;
    this.state = next;
    this.ammoBoxes.remove(box, true, true);
    state.currentTile = null;
    state.quantity = 0;
    this.scheduleAmmoBoxRespawn(boxId);
    arenaHud.setFeedback(`${AMMO_MATERIALS[state.material].label}を取得しました`);
    this.refreshHud();
    this.updatePickupPrompt();
  }

  private collectWorldItem(item: WorldItem): void {
    if (this.state.defeated || this.state.victory || !item.sprite.active || this.worldItemStates.get(item.id) !== item)
      return;
    if (item.kind === 'ammo-material') {
      const next = collectMaterial(this.state, item.material, item.quantity);
      if (next === this.state)
        return;
      this.state = next;
      this.worldItems.remove(item.sprite, true, true);
      this.worldItemStates.delete(item.id);
      arenaHud.setFeedback(`${AMMO_MATERIALS[item.material].label}を取得しました`);
      this.refreshHud();
      this.updatePickupPrompt();
      return;
    }
    const next = item.kind === 'weapon'
      ? collectWeapon(this.state, item.weapon)
      : collectMaterial(this.state, item.material, item.quantity);
    if (next === this.state)
      return;
    this.state = next;
    this.worldItems.remove(item.sprite, true, true);
    this.worldItemStates.delete(item.id);
    arenaHud.setFeedback(item.kind === 'weapon'
      ? `${WEAPONS[item.weapon.model].label}を取得しました`
      : `スクラップを${item.quantity}取得しました`);
    this.refreshHud();
    this.updatePickupPrompt();
  }

  private collectNearbyPickup(): void {
    if (this.state.defeated || this.state.victory)
      return;
    const pickup = this.nearbyPickup();
    if (!pickup)
      return;
    if (pickup.kind === 'ammo') {
      this.collectAmmoBox(pickup.box);
      return;
    }
    this.collectWorldItem(pickup.item);
  }

  private disableBullet(bullet: Phaser.Physics.Arcade.Sprite): void {
    this.meta.delete(bullet);
    bullet.setVelocity(0, 0).disableBody(true, true);
  }

  private disableAllBullets(): void {
    this.bullets.getChildren().forEach(child => this.disableBullet(child as Phaser.Physics.Arcade.Sprite));
  }

  private tile(sprite: Phaser.GameObjects.Components.Transform): TilePosition {
    return {
      x: Phaser.Math.Clamp(Math.floor(sprite.x / this.map.tileSize), 0, this.map.width - 1),
      y: Phaser.Math.Clamp(Math.floor(sprite.y / this.map.tileSize), 0, this.map.height - 1),
    };
  }

  private world(tile: TilePosition): { x: number; y: number } {
    return {
      x: tile.x * this.map.tileSize + this.map.tileSize / 2,
      y: tile.y * this.map.tileSize + this.map.tileSize / 2,
    };
  }

  private mapWorldSize(): { width: number; height: number } {
    return {
      width: this.map.width * this.map.tileSize,
      height: this.map.height * this.map.tileSize,
    };
  }

  private viewport(): { left: number; top: number; right: number; bottom: number } {
    return viewportTileRect(this.cameras.main.worldView, this.map);
  }

  private updateTileHud(): void {
    arenaHud.updateTile(this.tile(this.player));
  }

  private updateReloadProgressHud(): void {
    const isReloading = this.state.reloading !== null && this.reloadTimer !== undefined;
    arenaHud.updateReloadProgress({
      active: isReloading,
      progress: isReloading ? Phaser.Math.Clamp(this.reloadTimer!.getProgress(), 0, 1) : 0,
    });
  }

  private refreshHud(): void {
    const pendingBoxIds = [...this.ammoBoxRespawns.keys()];
    const pendingAmmoBoxOriginTiles = pendingBoxIds.map((boxId) => {
      const state = this.ammoBoxStates.get(boxId);
      return state ? tileKey(state.originTile) : '';
    }).filter(key => key.length > 0);
    const isReloading = this.state.reloading !== null && this.reloadTimer !== undefined;
    const phase = this.currentSpawnPhase();
    arenaHud.refresh({
      state: this.state,
      ammoBoxCount: this.ammoBoxes.countActive(true),
      activeAmmoBoxTiles: this.activeAmmoBoxKeys(),
      activeAmmoBoxEntries: this.activeAmmoBoxEntries(),
      activeWorldItemEntries: this.activeWorldItemEntries(),
      offscreenAmmoBoxIds: this.offscreenAmmoBoxIds(),
      pendingAmmoBoxIds: pendingBoxIds,
      pendingAmmoBoxOriginTiles,
      gunslingerCombo: this.gunslingerCombo,
      gunslingerSpeedMultiplier: this.gunslingerSpeedMultiplier(),
      isGunslinger: this.playerRole.id === 'gunslinger',
      reload: {
        active: isReloading,
        progress: isReloading ? Phaser.Math.Clamp(this.reloadTimer!.getProgress(), 0, 1) : 0,
      },
      runState: this.runState,
      remainingSurvivalMs: remainingSurvivalMs(
        this.survivalStartedAt,
        this.time.now,
        runDurationMs(this.runState.schedule),
      ),
      spawnPhase: phase,
      primaryDirection: primarySpawnDirection(this.map.seed, phase),
      mapSeed: this.map.seed,
      playerTile: this.tile(this.player),
    });
  }

  private createTextures(): void {
    this.texture('player', 50, 38, (context) => {
      context.fillStyle = '#c8c8c8';
      context.beginPath();
      context.moveTo(48, 19);
      context.lineTo(30, 3);
      context.lineTo(8, 7);
      context.lineTo(3, 19);
      context.lineTo(8, 31);
      context.lineTo(30, 35);
      context.closePath();
      context.fill();
      context.fillStyle = '#ffffff';
      context.fillRect(28, 14, 13, 10);
    });
    this.texture('basic', 46, 46, (context) => {
      context.fillStyle = '#454545';
      context.fillRect(5, 32, 9, 11);
      context.fillRect(32, 32, 9, 11);
      context.fillStyle = '#9f9f9f';
      context.beginPath();
      context.moveTo(23, 2);
      context.lineTo(43, 16);
      context.lineTo(36, 37);
      context.lineTo(10, 37);
      context.lineTo(3, 16);
      context.closePath();
      context.fill();
      context.fillStyle = '#d0d0d0';
      context.beginPath();
      context.arc(23, 21, 7, 0, Math.PI * 2);
      context.fill();
    });
    this.texture('drone', 36, 28, (context) => {
      context.fillStyle = '#707070';
      context.beginPath();
      context.moveTo(18, 1);
      context.lineTo(35, 14);
      context.lineTo(18, 27);
      context.lineTo(1, 14);
      context.closePath();
      context.fill();
      context.fillStyle = '#d7d7d7';
      context.fillRect(13, 10, 10, 8);
    });
    this.texture('enemy-silhouette', 36, 36, (context) => {
      context.fillStyle = '#a4a4a4';
      context.beginPath();
      context.arc(18, 18, 15, 0, Math.PI * 2);
      context.fill();
    });
    this.texture('wall', TILE_SIZE, TILE_SIZE, (context) => {
      context.fillStyle = '#26374a';
      context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    });
    AMMO_MATERIAL_ORDER.forEach((material) => {
      const ammo = AMMO_MATERIALS[material];
      this.texture(`material-box-${material}`, 30, 30, (context) => {
        context.fillStyle = ammo.worldColor;
        context.fillRect(2, 4, 26, 22);
        context.fillStyle = '#f4f7ff';
        context.fillRect(5, 8, 20, 4);
        context.fillStyle = '#1b2633';
        context.fillRect(13, 4, 4, 22);
      });
    });
    WEAPON_MODEL_ORDER.forEach((model) => {
      const weapon = WEAPONS[model];
      this.texture(`weapon-${model}`, 32, 18, (context) => {
        context.fillStyle = weapon.weaponColor;
        if (model === 'repeating-crossbow') {
          context.fillRect(2, 8, 26, 3);
          context.fillRect(13, 2, 4, 14);
          context.fillStyle = '#6f4a32';
          context.fillRect(3, 5, 5, 9);
          context.fillRect(24, 5, 5, 9);
          return;
        }
        if (model === 'flamethrower') {
          context.fillRect(2, 6, 24, 7);
          context.fillStyle = '#6b3d32';
          context.fillRect(20, 12, 8, 5);
          context.fillStyle = '#ffe19e';
          context.fillRect(5, 8, 8, 3);
          return;
        }
        context.fillRect(2, 7, 25, 5);
        context.fillStyle = '#55728b';
        context.fillRect(20, 11, 8, 5);
        context.fillStyle = '#f4f7ff';
        context.fillRect(6, 4, 10, 3);
      });
      this.texture(`bullet-${model}`, model === 'shotgun' ? 8 : 10, model === 'shotgun' ? 8 : 10, (context) => {
        context.fillStyle = weapon.bulletColor;
        if (model === 'shotgun' || model === 'flamethrower') {
          context.beginPath();
          context.arc(model === 'shotgun' ? 4 : 5, model === 'shotgun' ? 4 : 5, model === 'shotgun' ? 3 : 4, 0, Math.PI * 2);
          context.fill();
          return;
        }
        if (model === 'repeating-crossbow') {
          context.beginPath();
          context.moveTo(9, 5);
          context.lineTo(1, 1);
          context.lineTo(1, 9);
          context.closePath();
          context.fill();
          return;
        }
        context.fillRect(1, 1, 8, 8);
      });
    });
    this.texture('material-scrap-small', 18, 18, (context) => {
      context.fillStyle = '#8fa8b8';
      context.fillRect(3, 5, 12, 4);
      context.fillStyle = '#d5e2e8';
      context.fillRect(6, 10, 9, 4);
      context.fillStyle = '#55728b';
      context.fillRect(2, 14, 7, 2);
    });
    this.texture('material-scrap-medium', 24, 24, (context) => {
      context.fillStyle = '#8fa8b8';
      context.fillRect(3, 5, 18, 5);
      context.fillStyle = '#d5e2e8';
      context.fillRect(7, 12, 13, 5);
      context.fillStyle = '#55728b';
      context.fillRect(4, 18, 9, 3);
    });
    this.texture('material-scrap-large', 32, 30, (context) => {
      context.fillStyle = '#8fa8b8';
      context.fillRect(3, 5, 25, 7);
      context.fillStyle = '#d5e2e8';
      context.fillRect(10, 14, 18, 7);
      context.fillStyle = '#55728b';
      context.fillRect(4, 23, 15, 4);
    });
  }

  private texture(key: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): void {
    const texture = this.textures.createCanvas(key, width, height);
    if (!texture)
      return;
    draw(texture.context);
    texture.refresh();
  }
}

let arenaGame: Phaser.Game | undefined;

function playerRoleFrom(value: string | undefined): PlayerRole | undefined {
  return PLAYER_ROLES.find(role => role.id === value);
}

function startArena(role: PlayerRole): void {
  if (arenaGame)
    return;
  const gate = document.querySelector<HTMLElement>('#start-gate');
  if (!gate)
    throw new Error('開始ゲートが見つかりません。');
  gate.hidden = true;
  arenaHud.setPlayerRole(role.id);
  arenaGame = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: WIDTH, height: HEIGHT, backgroundColor: '#101827', physics: { default: 'arcade', arcade: { debug: false } }, scene: new Arena(role) });
}

function setupStartGate(): void {
  const options = document.querySelector<HTMLElement>('#role-options');
  const start = document.querySelector<HTMLButtonElement>('[data-testid="start"]');
  if (!options || !start)
    throw new Error('開始ゲートの操作要素が見つかりません。');
  PLAYER_ROLES.forEach((role) => {
    const label = document.createElement('label');
    label.className = 'role-option';
    label.style.setProperty('--role-accent', role.accent);
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'player-role';
    input.value = role.id;
    input.dataset.testid = `role-${role.id}`;
    input.addEventListener('change', () => {
      start.disabled = false;
    });
    const text = document.createElement('span');
    text.textContent = `${role.label}（${role.color}）`;
    label.append(input, text);
    options.append(label);
  });
  start.addEventListener('click', () => {
    const selected = document.querySelector<HTMLInputElement>('input[name="player-role"]:checked');
    const role = playerRoleFrom(selected?.value);
    if (role)
      startArena(role);
  });
  if (IS_DEV && new URLSearchParams(window.location.search).get('start') === 'dev')
    startArena(PLAYER_ROLES[0]);
}

arenaHud.onRetry(() => resetArena?.());
setupStartGate();
