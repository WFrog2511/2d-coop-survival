import Phaser from 'phaser';
import { ARENA_HEIGHT_TILES, ARENA_WIDTH_TILES, TILE_SIZE, basicApproachRoleFor, enemyVisibility, findPath, hasLineOfSight, type EnemyVisibility, generateArenaMap, generateNextArenaMap, hiddenRecycleThresholdFor, nextSeed, primarySpawnDirection, recycleDelayFor, respawnDelayFor, selectAmmoBoxTiles, selectEnemySpawnTile, selectSpawnTile, spawnDirectionForSlot, spawnPhaseAt, type ArenaMap, type TilePosition, viewportTileRect } from './arena-map';
import { ArenaEffects } from './arena/effects';
import { ArenaHud } from './arena/hud';
import { ENEMIES, ENEMY_DEFEAT_HIT_STOP_MS, ENEMY_HIT_STOP_MS, ENEMY_IDS, ENEMY_LABELS, ENEMY_SPAWN_ORDER, INITIAL_ENEMY_IDS, PLAYER_HIT_STOP_MS, STAGGERED_ENEMIES } from './game-data';
import { GUNSLINGER_BOOT_KNIFE_DAMAGE, PLAYER_DASH_DURATION_MS, PLAYER_DASH_SPEED_PX_PER_SECOND, PLAYER_ROLES, canDashAt, dashCooldownUntil, dashDirectionFor, gunslingerComboAfterEvent, gunslingerSpeedBuffUntil, gunslingerSpeedMultiplierAt, type DashDirection, type PlayerRole } from './player-data';
import { selectNearbyPickup } from './pickups';
import { AMMO_BOX_RESPAWN_MS, COMBAT_WAVE_DURATION_MS, REST_DURATION_MS, WEAPONS, advanceRunState, advanceSurvivalState, cancelReload, collectAmmoBox as collectAmmoBoxState, completeReload, createRunSchedule, currentRunPhase, damageEnemy, damagePlayer, defeatRun, droneLateralSpeedAt, enemySpeedMultiplierForPhase, fireWeapon, hiddenRecyclePathDistanceForPhase, isEnemyDefeated, recordEnemyDefeated, recordEnemyRecycled, recordEnemySpawned, remainingSurvivalMs, resolveDamage, respawnEnemy, retryCombat, retryRun, runDurationMs, selectWeapon, startReload, type CombatState, type DamageType, type EnemyInstanceId, type EnemyKind, type RunPhase, type RunSchedule, type RunState, type WeaponId } from './rules';

const WIDTH = 800;
const HEIGHT = 500;
const WORLD_WIDTH = ARENA_WIDTH_TILES * TILE_SIZE;
const WORLD_HEIGHT = ARENA_HEIGHT_TILES * TILE_SIZE;
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
type EnemySpawnReason = 'initial' | 'stagger' | 'death' | 'recycle' | 'debug';
type EnemySpawnConfig = {
  initialCount: number;
  staggerIntervalMs: number;
  candidatePool: number;
};
type BulletMeta = {
  weapon: WeaponId;
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
};
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
  private enemies!: Record<EnemyInstanceId, Phaser.Physics.Arcade.Sprite>;
  private silhouettes!: Record<EnemyInstanceId, Phaser.GameObjects.Image>;
  private bullets!: Phaser.Physics.Arcade.Group;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private ammoBoxes!: Phaser.Physics.Arcade.StaticGroup;
  private ammoBoxStates = new Map<string, AmmoBoxState>();
  private ammoBoxRespawns = new Map<string, Phaser.Time.TimerEvent>();
  private survivalTimer: Phaser.Time.TimerEvent | undefined;
  private survivalStartedAt = 0;
  private ground: Phaser.GameObjects.Graphics | undefined;
  private wallArt: Phaser.GameObjects.Graphics | undefined;
  private fadingGround: Phaser.GameObjects.Graphics | undefined;
  private fadingWallArt: Phaser.GameObjects.Graphics | undefined;
  private mapPaletteTransition: Phaser.Tweens.Tween | undefined;
  private visibilityMask!: Phaser.GameObjects.Graphics;
  private visibilityMaskPlayerTile: TilePosition | undefined;
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
  private gunslingerSpeedBuffUntil = 0;
  private gunslingerDashEnemyIds = new Set<EnemyInstanceId>();
  private aimDirection: DashDirection | undefined;
  private enemyHitStopUntil = enemyNumbers();
  private knockbackUntil = enemyNumbers();
  private knockbackVelocity = enemyRecord(() => ({ x: 0, y: 0 }));
  private respawnCount = enemyNumbers();
  private recycleCount = enemyNumbers();
  private lastHitAt = enemyNumbers(Number.NEGATIVE_INFINITY);
  private hiddenSince = new Map<EnemyInstanceId, number>();
  private recyclingEnemyId: EnemyInstanceId | undefined;
  private hiddenRecycleEnabled = true;
  private debugPlayerInvulnerable = false;
  private paths = {} as Record<EnemyInstanceId, PathState>;
  private enemySpawnTimers = new Map<EnemyInstanceId, Phaser.Time.TimerEvent>();
  private reloadTimer: Phaser.Time.TimerEvent | undefined;
  private visibilityTiles = {} as Partial<Record<EnemyInstanceId, { player: TilePosition; enemy: TilePosition }>>;
  constructor(private readonly playerRole: PlayerRole) {
    super('arena');
  }

  create(): void {
    resetArena = () => this.reset();
    this.createTextures();
    this.effects = new ArenaEffects(this, arenaHud.playerHitVignette, this.playerRole.tint);
    this.walls = this.physics.add.staticGroup();
    this.ammoBoxes = this.physics.add.staticGroup();
    this.player = this.physics.add
      .sprite(0, 0, 'player')
      .setCollideWorldBounds(true)
      .setBodySize(28, 28)
      .setDepth(3)
      .setTint(this.playerRole.tint);
    this.visibilityMask = this.add.graphics().setDepth(2).setAlpha(0.25);
    this.enemies = {} as Record<EnemyInstanceId, Phaser.Physics.Arcade.Sprite>;
    this.silhouettes = {} as Record<EnemyInstanceId, Phaser.GameObjects.Image>;
    ENEMY_IDS.forEach((id) => {
      const config = ENEMIES[id];
      const bodySize = config.kind === 'basic' ? { width: 28, height: 28 } : { width: 24, height: 20 };
      this.enemies[id] = this.physics.add
        .sprite(0, 0, config.kind === 'basic' ? 'basic' : 'drone')
        .setCollideWorldBounds(true)
        .setBodySize(bodySize.width, bodySize.height)
        .setDepth(0);
      this.enemies[id].disableBody(true, true);
      this.silhouettes[id] = this.add.image(0, 0, 'enemy-silhouette').setDepth(1).setVisible(false);
      this.physics.add.collider(this.enemies[id], this.walls);
      this.physics.add.overlap(this.player, this.enemies[id], () => this.handlePlayerEnemyOverlap(id));
    });
    this.physics.add.collider(this.player, this.walls);
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: BULLET_POOL_SIZE });
    this.physics.add.collider(this.bullets, this.walls, first => this.disableBullet(first as Phaser.Physics.Arcade.Sprite));
    ENEMY_IDS.forEach(id => this.physics.add.overlap(this.bullets, this.enemies[id], (first, second) => this.hitEnemy(first, second, id)));
    this.keys = this.input.keyboard!.addKeys({ w: 'W', a: 'A', s: 'S', d: 'D', r: 'R', e: 'E', space: 'SPACE', shift: 'SHIFT', up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' }) as Controls;
    this.input.keyboard?.on('keydown-ONE', () => this.changeWeapon('rifle'));
    this.input.keyboard?.on('keydown-TWO', () => this.changeWeapon('shotgun'));
    this.input.keyboard?.on('keydown-R', () => this.reload());
    this.input.keyboard?.on('keydown-E', () => this.collectNearbyAmmoBox());
    this.input.keyboard?.on('keydown-SPACE', () => this.tryDash());
    this.input.keyboard?.on('keydown-SHIFT', () => this.tryDash());
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.updateAimDirection(pointer));
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.updateAimDirection(pointer);
      if (!WEAPONS[this.state.weapon].automatic)
        this.tryFire();
    });
    this.input.keyboard?.addCapture(['W', 'A', 'S', 'D', 'R', 'E', 'SPACE', 'SHIFT', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'ONE', 'TWO']);
    this.reset(true);
  }

  update(): void {
    if (this.state.defeated || this.state.victory)
      return;
    arenaHud.updateFps(Math.round(this.game.loop.actualFps));
    this.updateSpawnPhaseHud();
    this.updateSurvival();
    if (this.state.defeated || this.state.victory)
      return;
    this.updatePlayerMovement();
    this.updateTileHud();
    this.updatePickupPrompt();
    this.updateVisibilityMask();
    this.updateReloadProgressHud();
    ENEMY_IDS.forEach(id => this.moveEnemy(id));
    this.updateEnemyVisibility();
    if (this.aimDirection) {
      const aim = this.aimPoint();
      this.player.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    }
    if (WEAPONS[this.state.weapon].automatic && this.input.activePointer.isDown)
      this.tryFire();
    this.bullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      const data = this.meta.get(bullet);
      if (bullet.active && data && Phaser.Math.Distance.Between(data.startX, data.startY, bullet.x, bullet.y) > data.range)
        this.disableBullet(bullet);
    });
  }

  private updatePlayerMovement(): void {
    const speedMultiplier = this.gunslingerSpeedMultiplier();
    arenaHud.updateGunslinger(this.gunslingerCombo, speedMultiplier, this.playerRole.id === 'gunslinger');
    const dash = this.playerDash;
    if (dash) {
      if (this.time.now >= dash.endsAt || this.isPlayerDashBlocked(dash)) {
        this.cancelPlayerDash();
        return;
      }
      this.player.setVelocity(
        dash.directionX * PLAYER_DASH_SPEED_PX_PER_SECOND,
        dash.directionY * PLAYER_DASH_SPEED_PX_PER_SECOND,
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
    this.playerDashCooldownUntil = dashCooldownUntil(this.time.now);
    this.player.setVelocity(
      direction.x * PLAYER_DASH_SPEED_PX_PER_SECOND,
      direction.y * PLAYER_DASH_SPEED_PX_PER_SECOND,
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
    this.gunslingerCombo = 0;
    this.gunslingerSpeedBuffUntil = 0;
    this.gunslingerDashEnemyIds.clear();
  }

  public debugRespawnEnemy(id: EnemyInstanceId): void {
    if (!IS_DEV)
      throw new Error('debugRespawnEnemyはDEV環境だけで使用できます。');
    if (!ENEMY_IDS.includes(id))
      throw new Error(`未知の敵IDです: ${id}`);
    if (this.state.defeated || this.state.victory || !this.enemies[id].active)
      throw new Error(`再出現できない敵です: ${id}`);
    const enemy = this.enemies[id];
    const previous = {
      x: enemy.x,
      y: enemy.y,
      spawnPhase: String(enemy.getData('spawnPhase') ?? ''),
      primaryDirection: String(enemy.getData('primaryDirection') ?? ''),
      assignedDirection: String(enemy.getData('assignedDirection') ?? ''),
      spawnTile: String(enemy.getData('spawnTile') ?? ''),
      spawnReason: String(enemy.getData('spawnReason') ?? ''),
    };
    const previousRespawnCount = this.respawnCount[id];
    enemy.disableBody(true, true);
    this.hideEnemyVisuals(id);
    delete this.paths[id];
    this.respawnCount[id] += 1;
    if (!this.spawnEnemy(id, 'debug')) {
      this.respawnCount[id] = previousRespawnCount;
      enemy.enableBody(true, previous.x, previous.y, true, true).setVelocity(0, 0);
      enemy.setData('spawnPhase', previous.spawnPhase);
      enemy.setData('primaryDirection', previous.primaryDirection);
      enemy.setData('assignedDirection', previous.assignedDirection);
      enemy.setData('spawnTile', previous.spawnTile);
      enemy.setData('spawnReason', previous.spawnReason);
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

  public debugDamageEnemy(id: EnemyInstanceId, amount: number): void {
    if (!IS_DEV)
      throw new Error('debugDamageEnemyはDEV環境だけで使用できます。');
    if (!ENEMY_IDS.includes(id))
      throw new Error(`未知の敵IDです: ${id}`);
    if (this.state.defeated || this.state.victory || !this.enemies[id].active)
      throw new Error(`ダメージを与えられない敵です: ${id}`);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error('debugDamageEnemyのamountは正の有限値が必要です。');
    this.lastHitAt[id] = this.time.now;
    this.state = damageEnemy(this.state, id, amount);
    const defeated = isEnemyDefeated(this.state, id);
    this.startEnemyImpact(id, this.state.weapon, defeated);
    if (defeated) this.scheduleDefeatedEnemy(id);
    this.refreshHud();
  }

  private reset(initial = false): void {
    this.generation += 1;
    this.stopRunTimers();
    this.physics.resume();
    this.state = retryCombat();
    this.runState = retryRun(RUN_SCHEDULE);
    this.mapPhase = undefined;
    this.survivalStartedAt = this.time.now;
    this.contactAt = enemyNumbers();
    this.playerHitStopUntil = 0;
    this.playerDash = undefined;
    this.playerDashCooldownUntil = 0;
    this.resetGunslingerState();
    this.enemyHitStopUntil = enemyNumbers();
    this.knockbackUntil = enemyNumbers();
    this.knockbackVelocity = enemyRecord(() => ({ x: 0, y: 0 }));
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
    this.visibilityMask.clear();
    this.disableAllBullets();
    const initialEnemyIds = initialEnemyIdsFor(ENEMY_SPAWN_CONFIG);
    ENEMY_IDS.forEach((id) => {
      this.enemies[id].setData('stableId', id);
      this.enemies[id].setData('spawnReason', initialEnemyIds.includes(id) ? 'initial' : 'stagger');
      this.enemies[id].setData('spawnPhase', '');
      this.enemies[id].setData('primaryDirection', '');
      this.enemies[id].setData('assignedDirection', '');
      this.enemies[id].setData('spawnTile', '');
      this.enemies[id].disableBody(true, true);
      this.hideEnemyVisuals(id);
    });
    this.map = initial ? generateArenaMap(this.mapSeed) : generateNextArenaMap(this.map);
    this.mapSeed = this.map.seed;
    this.buildMap();
    const start = this.world(this.map.start);
    this.player.enableBody(true, start.x, start.y, true, true).setVelocity(0, 0);
    this.updateVisibilityMask(true);
    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    camera.centerOn(start.x, start.y);
    camera.startFollow(this.player);
    camera.preRender();
    this.buildAmmoBoxes();
    this.updatePickupPrompt();
    initialEnemyIds.forEach((id) => {
      if (!this.spawnEnemy(id, 'initial'))
        this.scheduleEnemySpawn(id, 'initial', 1000);
    });
    staggeredEnemiesFor(ENEMY_SPAWN_CONFIG).forEach(({ id, delay }) => this.scheduleEnemySpawn(id, 'stagger', delay));
    this.updateEnemyVisibility(true);
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
    this.ammoBoxStates.clear();
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (let y = 0; y < this.map.height; y += 1)
      for (let x = 0; x < this.map.width; x += 1)
        if (this.map.tiles[y][x] === 'wall') {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const wall = this.physics.add.staticImage(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 'wall');
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
    const palette = phase === 'combat'
      ? { ground: 0x101827, grid: 0x31516b, wall: 0x26374a, wallEdge: 0x55728b }
      : { ground: 0x6b573b, grid: 0xae8a58, wall: 0x79573a, wallEdge: 0xe2bb78 };
    ground.fillStyle(palette.ground, 1).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).lineStyle(1, palette.grid, 0.55);
    for (let x = 0; x <= WORLD_WIDTH; x += TILE_SIZE)
      ground.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = 0; y <= WORLD_HEIGHT; y += TILE_SIZE)
      ground.lineBetween(0, y, WORLD_WIDTH, y);
    wallArt.fillStyle(palette.wall, 1).lineStyle(1, palette.wallEdge, 1);
    for (let y = 0; y < this.map.height; y += 1)
      for (let x = 0; x < this.map.width; x += 1)
        if (this.map.tiles[y][x] === 'wall')
          wallArt.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE).strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    return { ground, wallArt };
  }

  private buildAmmoBoxes(): void {
    selectAmmoBoxTiles(this.map).forEach((tile, index) => {
      const boxId = `ammo-box-${index + 1}`;
      this.ammoBoxStates.set(boxId, {
        originTile: { ...tile },
        currentTile: null,
        respawnCount: 0,
        seedOffset: index,
      });
      this.spawnAmmoBox(boxId, tile);
    });
  }

  private spawnAmmoBox(boxId: string, tile: TilePosition): void {
    const state = this.ammoBoxStates.get(boxId);
    if (!state || state.currentTile !== null || this.hasAmmoBox(boxId) || this.activeAmmoBoxTiles().some(activeTile => sameTile(activeTile, tile)))
      return;
    const point = this.world(tile);
    const box = this.physics.add.staticImage(point.x, point.y, 'ammo-box').setDepth(1);
    box.setData('boxId', boxId);
    box.setData('tile', { ...tile });
    box.setData('tileKey', tileKey(tile));
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
        entries.push(`${boxId}:${tileKey(state.currentTile)}`);
    });
    return entries;
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

  private nearbyAmmoBox(): Phaser.GameObjects.GameObject | undefined {
    const candidates = this.ammoBoxes.getChildren().flatMap((box) => {
      if (!box.active)
        return [];
      const id = box.getData('boxId') as string | undefined;
      const tile = box.getData('tile') as TilePosition | undefined;
      return id && tile ? [{ id, tile, box }] : [];
    });
    return selectNearbyPickup(this.tile(this.player), this.muzzlePickupAnchor(), candidates)?.box;
  }

  private muzzlePickupAnchor(): { x: number; y: number } {
    const direction = dashDirectionFor(this.player, this.aimPoint())
      ?? { x: Math.cos(this.player.rotation), y: Math.sin(this.player.rotation) };
    const distance = this.player.displayWidth / 2;
    return {
      x: (this.player.x + direction.x * distance) / TILE_SIZE,
      y: (this.player.y + direction.y * distance) / TILE_SIZE,
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
    arenaHud.setPickupPrompt(this.nearbyAmmoBox() !== undefined);
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
    const nextRunState = advanceRunState(this.runState, this.time.now - this.survivalStartedAt);
    this.runState = nextRunState;
    this.updateMapPalette();
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
    const phase = spawnPhaseAt(this.survivalStartedAt, this.time.now);
    const primaryDirection = primarySpawnDirection(this.map.seed, phase);
    arenaHud.updateSpawnPhase(phase, primaryDirection);
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
    this.visibilityMask.clear().fillStyle(0x000000, 1);
    let obscuredTileCount = 0;
    for (let y = 0; y < this.map.height; y += 1)
      for (let x = 0; x < this.map.width; x += 1)
        if (!hasLineOfSight(this.map, playerTile, { x, y })) {
          this.visibilityMask.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          obscuredTileCount += 1;
        }
    this.visibilityMaskPlayerTile = { ...playerTile };
    arenaHud.updateVisibilityMask(this.visibilityMask.alpha, obscuredTileCount, playerTile);
  }

  private moveEnemy(id: EnemyInstanceId): void {
    const enemy = this.enemies[id];
    if (this.physics.world.isPaused || !enemy.active)
      return;
    if (this.time.now < this.enemyHitStopUntil[id]) {
      enemy.setVelocity(0, 0);
      return;
    }
    if (this.time.now < this.knockbackUntil[id]) {
      const velocity = this.knockbackVelocity[id];
      enemy.setVelocity(velocity.x, velocity.y);
      return;
    }
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
    if (!next) {
      enemy.setVelocity(0, 0);
      return;
    }
    const target = this.world(next);
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    if (config.kind === 'drone') {
      const side = droneLateralSpeedAt(this.time.now);
      enemy.setVelocity(
        ((dx / length) * config.speed - (dy / length) * side) * speedMultiplier,
        ((dy / length) * config.speed + (dx / length) * side) * speedMultiplier,
      );
      return;
    }
    const separation = this.basicSeparation(id);
    const desiredX = dx / length + separation.x * 0.45;
    const desiredY = dy / length + separation.y * 0.45;
    const desiredLength = Math.hypot(desiredX, desiredY) || 1;
    enemy.setVelocity(
      (desiredX / desiredLength) * config.speed * speedMultiplier,
      (desiredY / desiredLength) * config.speed * speedMultiplier,
    );
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
    const enemy = this.enemies[id];
    let x = 0;
    let y = 0;
    ENEMY_IDS.forEach((otherId) => {
      const other = this.enemies[otherId];
      if (otherId === id || ENEMIES[otherId].kind !== 'basic' || !other.active) return;
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
    const playerTile = this.tile(this.player);
    const phase = spawnPhaseAt(this.survivalStartedAt, this.time.now);
    const primaryDirection = primarySpawnDirection(this.map.seed, phase);
    const stableSlot = ENEMY_IDS.indexOf(id);
    const direction = spawnDirectionForSlot(primaryDirection, stableSlot);
    const occupied = [
      playerTile,
      ...this.activeAmmoBoxTiles(),
      ...ENEMY_IDS
        .filter(other => other !== id && this.enemies[other].active)
        .map(other => this.tile(this.enemies[other])),
    ];
    const tile = selectEnemySpawnTile(
      this.map,
      { player: playerTile, viewport: this.viewport(), occupied, direction },
      nextSeed(this.map.seed + this.respawnCount[id] * 31 + this.recycleCount[id] * 131 + stableSlot),
      ENEMY_SPAWN_CONFIG.candidatePool,
    );
    if (!tile) {
      this.enemies[id].setData('spawnReason', reason);
      this.enemies[id].disableBody(true, true);
      this.hideEnemyVisuals(id);
      return false;
    }
    const point = this.world(tile);
    this.enemies[id]
      .enableBody(true, point.x, point.y, true, true)
      .setVelocity(0, 0)
      .clearTint();
    this.runState = recordEnemySpawned(this.runState, id);
    this.enemies[id].setData('stableId', id);
    this.enemies[id].setData('spawnPhase', phase);
    this.enemies[id].setData('primaryDirection', primaryDirection);
    this.enemies[id].setData('assignedDirection', direction);
    this.enemies[id].setData('spawnTile', tileKey(tile));
    this.enemies[id].setData('spawnReason', reason);
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
    this.enemySpawnTimers.get(id)?.remove(false);
    this.enemies[id].setData('spawnReason', reason);
    this.hideEnemyVisuals(id);
    const generation = this.generation;
    const timer = this.time.delayedCall(delay, () => {
      if (this.enemySpawnTimers.get(id) === timer)
        this.enemySpawnTimers.delete(id);
      if (generation !== this.generation || this.state.defeated || this.state.victory)
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
      const enemy = this.enemies[id];
      const silhouette = this.silhouettes[id];
      if (!enemy.active) {
        if (isEnemyDefeated(this.state, id) && this.time.now < this.enemyHitStopUntil[id]) {
          enemy.setVisible(true);
          silhouette.setVisible(false);
          this.syncEnemyHud(id, 'normal');
          return;
        }
        this.hideEnemyVisuals(id);
        delete this.visibilityTiles[id];
        return;
      }
      silhouette.setPosition(enemy.x, enemy.y);
      const enemyTile = this.tile(enemy);
      const previous = this.visibilityTiles[id];
      if (!force && previous && sameTile(previous.player, playerTile) && sameTile(previous.enemy, enemyTile)) {
        const visibility = this.currentEnemyVisibility(id);
        this.syncEnemyHud(id, visibility);
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
    this.enemies[id].disableBody(true, true);
    this.enemies[id].setData('spawnReason', 'recycle');
    this.hideEnemyVisuals(id);
    delete this.paths[id];
    delete this.visibilityTiles[id];
    this.hiddenSince.delete(id);
    this.scheduleEnemySpawn(id, 'recycle', recycleDelayFor(id, this.recycleCount[id], this.map.seed));
    this.refreshHud();
  }

  private applyEnemyVisibility(id: EnemyInstanceId, visibility: EnemyVisibility): void {
    const enemy = this.enemies[id];
    const silhouette = this.silhouettes[id];
    if (visibility === 'normal') {
      enemy.setVisible(true).setAlpha(1);
      silhouette.setVisible(false);
    } else if (visibility === 'boundary') {
      enemy.setVisible(false);
      silhouette.setPosition(enemy.x, enemy.y).setAlpha(0.3).setVisible(true);
    } else {
      enemy.setVisible(false);
      silhouette.setVisible(false);
    }
    this.syncEnemyHud(id, visibility);
  }

  private hideEnemyVisuals(id: EnemyInstanceId): void {
    this.enemies[id].setVisible(false);
    this.silhouettes[id].setVisible(false);
    this.syncEnemyHud(id, 'hidden');
  }

  private currentEnemyVisibility(id: EnemyInstanceId): EnemyVisibility {
    if (this.enemies[id].visible)
      return 'normal';
    return this.silhouettes[id].visible ? 'boundary' : 'hidden';
  }

  private syncEnemyHud(id: EnemyInstanceId, visibility: EnemyVisibility): void {
    const enemy = this.enemies[id];
    const silhouette = this.silhouettes[id];
    arenaHud.updateEnemy(id, {
      stableId: String(enemy.getData('stableId') ?? id),
      spawnPhase: String(enemy.getData('spawnPhase') ?? ''),
      primaryDirection: String(enemy.getData('primaryDirection') ?? ''),
      assignedDirection: String(enemy.getData('assignedDirection') ?? ''),
      spawnTile: String(enemy.getData('spawnTile') ?? ''),
      spawnReason: String(enemy.getData('spawnReason') ?? ''),
      active: enemy.active,
      recycleCount: this.recycleCount[id],
      visibility,
      spriteTexture: enemy.texture.key,
      spriteAlpha: enemy.alpha,
      spriteVisible: enemy.visible,
      silhouetteTexture: silhouette.texture.key,
      silhouetteAlpha: silhouette.alpha,
      silhouetteVisible: silhouette.visible,
    });
  }

  private changeWeapon(weapon: WeaponId): void {
    if (this.state.defeated || this.state.victory || this.state.weapon === weapon)
      return;
    const interrupted = this.state.reloading !== null;
    if (interrupted)
      this.stopReload();
    this.state = selectWeapon(this.state, weapon);
    arenaHud.setFeedback(interrupted ? `リロード中断: ${WEAPONS[weapon].label}` : `武器: ${WEAPONS[weapon].label}`);
    this.refreshHud();
  }

  private reload(): void {
    if (this.state.defeated || this.state.victory)
      return;
    const weapon = this.state.weapon;
    const next = startReload(this.state);
    if (next === this.state) {
      arenaHud.setFeedback(this.state.reloading !== null
        ? 'リロード中です'
        : this.state.reserve[weapon] <= 0
          ? '予備弾薬がありません。弾薬箱を探してください'
          : '弾倉は満タンです');
      return;
    }
    this.state = next;
    const generation = this.generation;
    arenaHud.setFeedback(`リロード中: ${WEAPONS[weapon].label}`);
    this.reloadTimer = this.time.delayedCall(WEAPONS[weapon].reloadMs, () => {
      if (generation !== this.generation || this.state.defeated || this.state.victory)
        return;
      this.state = completeReload(this.state, weapon);
      this.reloadTimer = undefined;
      arenaHud.setFeedback(`リロード完了: ${WEAPONS[weapon].label}`);
      this.refreshHud();
    });
    this.refreshHud();
  }

  private stopReload(): void {
    this.reloadTimer?.remove(false);
    this.reloadTimer = undefined;
    this.state = cancelReload(this.state);
  }

  private tryFire(): void {
    if (this.state.defeated || this.state.victory)
      return;
    const weaponId = this.state.weapon;
    const weapon = WEAPONS[weaponId];
    if (this.state.ammo[weaponId] === 0) {
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
      else if (this.state.ammo[this.state.weapon] === 0)
        arenaHud.setFeedback('弾切れ: Rでリロード');
      return;
    }
    const aim = this.aimPoint();
    const base = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    this.effects.playWeaponFire(this.player, weaponId, base);
    for (let index = 0; index < weapon.pellets; index += 1) {
      const bullet = this.bullets.get(this.player.x, this.player.y, `bullet-${this.state.weapon}`) as Phaser.Physics.Arcade.Sprite | null;
      if (!bullet)
        continue;
      const ratio = weapon.pellets === 1 ? 0 : index / (weapon.pellets - 1) - 0.5;
      const angle = base + ratio * weapon.spread * 2;
      bullet.enableBody(true, this.player.x, this.player.y, true, true).setTexture(`bullet-${this.state.weapon}`).setVelocity(Math.cos(angle) * weapon.speed, Math.sin(angle) * weapon.speed);
      this.meta.set(bullet, { weapon: this.state.weapon, damageType: weapon.damageType, damage: weapon.damage, range: weapon.range, knockback: weapon.knockback, startX: this.player.x, startY: this.player.y, directionX: Math.cos(angle), directionY: Math.sin(angle) });
    }
    this.refreshHud();
  }

  private hitEnemy(firstObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile, secondObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile, id: EnemyInstanceId): void {
    const first = firstObject as Phaser.Physics.Arcade.Sprite;
    const second = secondObject as Phaser.Physics.Arcade.Sprite;
    const bullet = this.meta.has(first) ? first : second;
    const enemy = bullet === first ? second : first;
    const data = this.meta.get(bullet);
    if (!data || enemy !== this.enemies[id] || !enemy.active || this.state.defeated || this.state.victory)
      return;
    this.disableBullet(bullet);
    this.lastHitAt[id] = this.time.now;
    const result = resolveDamage(this.state.enemies[id].kind, data.damageType, data.damage);
    this.state = damageEnemy(this.state, id, result.amount);
    const defeated = isEnemyDefeated(this.state, id);
    this.startEnemyImpact(id, data.weapon, defeated);
    arenaHud.setFeedback(`${result.resisted ? '耐性' : '命中'}: ${WEAPONS[data.weapon].label} → ${ENEMY_LABELS[id]}`);
    this.effects.flashEnemy(enemy);
    if (data.knockback > 0) {
      this.knockbackVelocity[id] = {
        x: data.directionX * data.knockback,
        y: data.directionY * data.knockback,
      };
      this.knockbackUntil[id] = this.enemyHitStopUntil[id] + 180;
    }
    if (defeated) this.scheduleDefeatedEnemy(id);
    this.refreshHud();
  }

  private scheduleDefeatedEnemy(id: EnemyInstanceId): void {
    const enemy = this.enemies[id];
    if (this.playerRole.id === 'gunslinger')
      this.gunslingerCombo = gunslingerComboAfterEvent(this.gunslingerCombo);
    this.runState = recordEnemyDefeated(this.runState, id);
    enemy.disableBody(true, false);
    this.hideEnemyVisuals(id);
    this.hiddenSince.delete(id);
    delete this.paths[id];
    delete this.visibilityTiles[id];
    this.respawnCount[id] += 1;
    const delay = respawnDelayFor(ENEMIES[id].kind, id, this.respawnCount[id], this.map.seed);
    this.scheduleEnemySpawn(id, 'death', delay);
    if (this.time.now < this.enemyHitStopUntil[id]) {
      enemy.setVisible(true);
      this.syncEnemyHud(id, 'normal');
    }
  }

  private handlePlayerEnemyOverlap(id: EnemyInstanceId): void {
    if (this.playerRole.id === 'gunslinger' && this.playerDash) {
      this.bootKnifeEnemy(id);
      return;
    }
    this.hitPlayer(id);
  }

  private bootKnifeEnemy(id: EnemyInstanceId): void {
    const enemy = this.enemies[id];
    if (
      !this.playerDash
      || !enemy.active
      || this.gunslingerDashEnemyIds.has(id)
      || this.state.defeated
      || this.state.victory
    )
      return;
    this.gunslingerDashEnemyIds.add(id);
    this.lastHitAt[id] = this.time.now;
    this.state = damageEnemy(this.state, id, GUNSLINGER_BOOT_KNIFE_DAMAGE);
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
    this.state = damagePlayer(this.state, ENEMIES[id].damage);
    if (!this.state.defeated) {
      this.refreshHud();
      return;
    }
    this.enterTerminal('defeat');
  }

  private startEnemyImpact(id: EnemyInstanceId, weapon: WeaponId, defeated: boolean): void {
    const duration = defeated ? ENEMY_DEFEAT_HIT_STOP_MS[weapon] : ENEMY_HIT_STOP_MS[weapon];
    this.enemyHitStopUntil[id] = Math.max(this.enemyHitStopUntil[id], this.time.now + duration);
    this.enemies[id].setVelocity(0, 0);
    this.effects.playEnemyImpact(this.enemies[id], ENEMIES[id].kind, weapon, defeated);
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
      this.enemies[enemyId].setVelocity(0, 0);
      this.hideEnemyVisuals(enemyId);
    });
    this.disableAllBullets();
    this.physics.pause();
    arenaHud.setPickupPrompt(false);
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
        ...ENEMY_IDS
          .filter(id => this.enemies[id].active)
          .map(id => this.tile(this.enemies[id])),
      ];
      const tile = selectSpawnTile(
        this.map,
        { player: playerTile, viewport: this.viewport(), occupied },
        nextSeed(this.map.seed + current.respawnCount + current.seedOffset),
      );
      if (!tile) {
        arenaHud.setFeedback('弾薬箱の再配置先がありません');
        this.refreshHud();
        return;
      }
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
    const result = collectAmmoBoxState(this.state);
    if (!result.collected)
      return;
    this.state = result.state;
    this.ammoBoxes.remove(box, true, true);
    state.currentTile = null;
    this.scheduleAmmoBoxRespawn(boxId);
    arenaHud.setFeedback('弾薬箱から補給しました');
    this.refreshHud();
    this.updatePickupPrompt();
  }

  private collectNearbyAmmoBox(): void {
    const box = this.nearbyAmmoBox();
    if (box)
      this.collectAmmoBox(box);
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
      x: Phaser.Math.Clamp(Math.floor(sprite.x / TILE_SIZE), 0, ARENA_WIDTH_TILES - 1),
      y: Phaser.Math.Clamp(Math.floor(sprite.y / TILE_SIZE), 0, ARENA_HEIGHT_TILES - 1),
    };
  }

  private world(tile: TilePosition): { x: number; y: number } {
    return {
      x: tile.x * TILE_SIZE + TILE_SIZE / 2,
      y: tile.y * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  private viewport(): { left: number; top: number; right: number; bottom: number } {
    return viewportTileRect(this.cameras.main.worldView);
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
    const phase = spawnPhaseAt(this.survivalStartedAt, this.time.now);
    arenaHud.refresh({
      state: this.state,
      ammoBoxCount: this.ammoBoxes.countActive(true),
      activeAmmoBoxTiles: this.activeAmmoBoxKeys(),
      activeAmmoBoxEntries: this.activeAmmoBoxEntries(),
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
    this.texture('ammo-box', 30, 30, (context) => {
      context.fillStyle = '#d28b35';
      context.fillRect(2, 4, 26, 22);
      context.fillStyle = '#ffe1a3';
      context.fillRect(5, 8, 20, 4);
      context.fillStyle = '#7a461d';
      context.fillRect(13, 4, 4, 22);
    });
    this.texture('bullet-rifle', 10, 10, (context) => {
      context.fillStyle = '#55d6ff';
      context.fillRect(1, 1, 8, 8);
    });
    this.texture('bullet-shotgun', 8, 8, (context) => {
      context.fillStyle = '#ffef76';
      context.beginPath();
      context.arc(4, 4, 3, 0, Math.PI * 2);
      context.fill();
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
