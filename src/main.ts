import Phaser from 'phaser';
import { ARENA_HEIGHT_TILES, ARENA_WIDTH_TILES, TILE_SIZE, basicApproachRoleFor, enemyVisibility, findPath, hasLineOfSight, type EnemyVisibility, generateArenaMap, generateNextArenaMap, hiddenRecycleThresholdFor, nextSeed, primarySpawnDirection, recycleDelayFor, respawnDelayFor, selectAmmoBoxTiles, selectEnemySpawnTile, selectSpawnTile, spawnDirectionForSlot, spawnPhaseAt, type ArenaMap, type SpawnDirection, type TilePosition, viewportTileRect } from './arena-map';
import { AMMO_BOX_RESPAWN_MS, ENEMY_INSTANCE_IDS, SURVIVAL_LIMIT_MS, WEAPONS, advanceSurvivalState, cancelReload, collectAmmoBox as collectAmmoBoxState, completeReload, damageEnemy, damagePlayer, droneLateralSpeedAt, fireWeapon, isEnemyDefeated, remainingSurvivalMs, resolveDamage, respawnEnemy, retryCombat, selectWeapon, startReload, type CombatState, type DamageType, type EnemyInstanceId, type EnemyKind, type WeaponId } from './rules';
const WIDTH = 800;
const HEIGHT = 500;
const WORLD_WIDTH = ARENA_WIDTH_TILES * TILE_SIZE;
const WORLD_HEIGHT = ARENA_HEIGHT_TILES * TILE_SIZE;
const BULLET_POOL_SIZE = 48;
const ENEMY_HIT_STOP_MS: Record<WeaponId, number> = { rifle: 12, shotgun: 35 };
const ENEMY_DEFEAT_HIT_STOP_MS: Record<WeaponId, number> = { rifle: 24, shotgun: 42 };
const PLAYER_HIT_STOP_MS: Record<EnemyKind, number> = { basic: 30, drone: 45 };
const CAMERA_SHAKE_COOLDOWN_MS = 70;
const SHOTGUN_SHAKE = { duration: 70, intensity: 0.0016 };
const FIRE_SHAKE = { duration: 95, intensity: 0.0024 };
const DEFEAT_SHAKE = { duration: 190, intensity: 0.0048 };
const PLAYER_HIT_SHAKE: Record<EnemyKind, { duration: number; intensity: number }> = {
  basic: { duration: 55, intensity: 0.0008 },
  drone: { duration: 120, intensity: 0.0032 },
};
const ENEMY_IDS = ENEMY_INSTANCE_IDS;
const INITIAL_ENEMY_IDS: readonly EnemyInstanceId[] = ['basic-1', 'basic-2', 'basic-3', 'basic-4', 'basic-5', 'basic-6', 'drone-1', 'drone-2'];
const STAGGERED_ENEMIES: readonly { id: EnemyInstanceId; delay: number }[] = [
  { id: 'basic-7', delay: 3000 },
  { id: 'basic-8', delay: 6000 },
  { id: 'basic-9', delay: 9000 },
  { id: 'drone-3', delay: 12000 },
];
const IS_DEV = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
type EnemySpawnReason = 'initial' | 'stagger' | 'death' | 'recycle' | 'debug';
type EnemyConfig = {
  kind: EnemyKind;
  speed: number;
  damage: number;
  cooldown: number;
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
type Controls = Phaser.Types.Input.Keyboard.CursorKeys & {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
};

function enemyRecord<T>(create: (id: EnemyInstanceId) => T): Record<EnemyInstanceId, T> {
  return Object.fromEntries(ENEMY_IDS.map(id => [id, create(id)])) as Record<EnemyInstanceId, T>;
}

const ENEMIES = enemyRecord<EnemyConfig>(id => id.startsWith('basic-')
  ? { kind: 'basic', speed: 68, damage: 8, cooldown: 1500 }
  : { kind: 'drone', speed: 150, damage: 6, cooldown: 1200 });
const ENEMY_LABELS = enemyRecord((id) => {
  const number = id.split('-')[1];
  return id.startsWith('basic-') ? `基本敵 #${number}` : `高速ドローン #${number}`;
});
const DIRECTION_LABELS: Record<SpawnDirection, string> = {
  up: '上',
  right: '右',
  down: '下',
  left: '左',
};
function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value)
    throw new Error(`必要なHUD要素が見つかりません: ${selector}`);
  return value;
}
function enemyNumbers(initial = 0): Record<EnemyInstanceId, number> {
  return enemyRecord(() => initial);
}

function sameTile(left: TilePosition, right: TilePosition): boolean {
  return left.x === right.x && left.y === right.y;
}

function tileKey(tile: TilePosition): string {
  return `${tile.x},${tile.y}`;
}

function formatSurvivalTime(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}
const playerHp = element<HTMLOutputElement>('[data-testid="hp"]');
const playerHpBar = element<HTMLProgressElement>('[data-testid="hp-bar"]');
const weaponHud = element<HTMLOutputElement>('[data-testid="weapon"]');
const ammoHud = element<HTMLOutputElement>('[data-testid="ammo"]');
const ammoPanelWeaponHud = element<HTMLOutputElement>('[data-testid="ammo-panel-weapon"]');
const reserveHud = element<HTMLOutputElement>('[data-testid="ammo-reserve"]');
const ammoBoxCountHud = element<HTMLOutputElement>('[data-testid="ammo-box-count"]');
const reloadProgressLabel = element<HTMLElement>('[data-testid="reload-progress-label"]');
const reloadProgressHud = element<HTMLProgressElement>('[data-testid="reload-progress"]');
const reloadHud = element<HTMLOutputElement>('[data-testid="reload"]');
const mapSeedHud = element<HTMLOutputElement>('[data-testid="map-seed"]');
const playerTileHud = element<HTMLOutputElement>('[data-testid="player-tile"]');
const fps = element<HTMLOutputElement>('[data-testid="fps"]');
const survivalTimeHud = element<HTMLOutputElement>('[data-testid="survival-time"]');
const spawnPhaseHud = element<HTMLOutputElement>('[data-testid="spawn-phase"]');
const primaryDirectionHud = element<HTMLOutputElement>('[data-testid="primary-direction"]');
const feedback = element<HTMLElement>('[data-testid="feedback"]');
const resultPanel = element<HTMLElement>('[data-testid="result"]');
const defeat = element<HTMLElement>('[data-testid="defeat"]');
const victory = element<HTMLElement>('[data-testid="victory"]');
const retry = element<HTMLButtonElement>('[data-testid="retry"]');
const enemyHp = enemyRecord(id => element<HTMLOutputElement>(`[data-testid="${id}-hp"]`));
let resetArena: (() => void) | undefined;
class Arena extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
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
  private visibilityMask!: Phaser.GameObjects.Graphics;
  private visibilityMaskPlayerTile: TilePosition | undefined;
  private keys!: Controls;
  private map!: ArenaMap;
  private mapSeed = Date.now() >>> 0;
  private generation = 0;
  private state: CombatState = retryCombat();
  private meta = new Map<Phaser.Physics.Arcade.Sprite, BulletMeta>();
  private contactAt = enemyNumbers();
  private playerHitStopUntil = 0;
  private enemyHitStopUntil = enemyNumbers();
  private knockbackUntil = enemyNumbers();
  private knockbackVelocity = enemyRecord(() => ({ x: 0, y: 0 }));
  private shakeCooldownUntil = 0;
  private shakeIntensity = 0;
  private respawnCount = enemyNumbers();
  private recycleCount = enemyNumbers();
  private lastHitAt = enemyNumbers(Number.NEGATIVE_INFINITY);
  private hiddenSince = new Map<EnemyInstanceId, number>();
  private recyclingEnemyId: EnemyInstanceId | undefined;
  private hiddenRecycleEnabled = true;
  private paths = {} as Record<EnemyInstanceId, PathState>;
  private enemySpawnTimers = new Map<EnemyInstanceId, Phaser.Time.TimerEvent>();
  private flashes = new Map<EnemyInstanceId, Phaser.Time.TimerEvent>();
  private reloadTimer: Phaser.Time.TimerEvent | undefined;
  private visibilityTiles = {} as Partial<Record<EnemyInstanceId, { player: TilePosition; enemy: TilePosition }>>;
  constructor() {
    super('arena');
  }

  create(): void {
    resetArena = () => this.reset();
    this.createTextures();
    this.walls = this.physics.add.staticGroup();
    this.ammoBoxes = this.physics.add.staticGroup();
    this.player = this.physics.add
      .sprite(0, 0, 'player')
      .setCollideWorldBounds(true)
      .setBodySize(28, 28)
      .setDepth(3);
    this.physics.add.overlap(this.player, this.ammoBoxes, (_player, box) => this.collectAmmoBox(box as Phaser.GameObjects.GameObject));
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
      this.physics.add.overlap(this.player, this.enemies[id], () => this.hitPlayer(id));
    });
    this.physics.add.collider(this.player, this.walls);
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: BULLET_POOL_SIZE });
    this.physics.add.collider(this.bullets, this.walls, first => this.disableBullet(first as Phaser.Physics.Arcade.Sprite));
    ENEMY_IDS.forEach(id => this.physics.add.overlap(this.bullets, this.enemies[id], (first, second) => this.hitEnemy(first, second, id)));
    this.keys = this.input.keyboard!.addKeys({ w: 'W', a: 'A', s: 'S', d: 'D', r: 'R', up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' }) as Controls;
    this.input.keyboard?.on('keydown-ONE', () => this.changeWeapon('rifle'));
    this.input.keyboard?.on('keydown-TWO', () => this.changeWeapon('shotgun'));
    this.input.keyboard?.on('keydown-R', () => this.reload());
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!WEAPONS[this.state.weapon].automatic)
        this.tryFire(pointer);
    });
    this.input.keyboard?.addCapture(['W', 'A', 'S', 'D', 'R', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'ONE', 'TWO']);
    this.reset(true);
  }

  update(): void {
    if (this.state.defeated || this.state.victory)
      return;
    fps.value = String(Math.round(this.game.loop.actualFps));
    this.updateSpawnPhaseHud();
    this.updateSurvival();
    if (this.state.defeated || this.state.victory)
      return;
    if (this.time.now < this.playerHitStopUntil) {
      this.player.setVelocity(0, 0);
    } else {
      const x = Number(this.keys.d.isDown || this.keys.right.isDown) - Number(this.keys.a.isDown || this.keys.left.isDown);
      const y = Number(this.keys.s.isDown || this.keys.down.isDown) - Number(this.keys.w.isDown || this.keys.up.isDown);
      const length = Math.hypot(x, y) || 1;
      this.player.setVelocity((x / length) * 210, (y / length) * 210);
    }
    this.updateTileHud();
    this.updateVisibilityMask();
    this.updateReloadProgressHud();
    ENEMY_IDS.forEach(id => this.moveEnemy(id));
    this.updateEnemyVisibility();
    this.player.rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.input.activePointer.worldX, this.input.activePointer.worldY);
    if (WEAPONS[this.state.weapon].automatic && this.input.activePointer.isDown)
      this.tryFire(this.input.activePointer);
    this.bullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      const data = this.meta.get(bullet);
      if (bullet.active && data && Phaser.Math.Distance.Between(data.startX, data.startY, bullet.x, bullet.y) > data.range)
        this.disableBullet(bullet);
    });
  }

  public debugRespawnEnemy(id: EnemyInstanceId): void {
    if (!IS_DEV)
      throw new Error('debugRespawnEnemyはDEV環境だけで使用できます。');
    if (!ENEMY_IDS.includes(id))
      throw new Error(`未知の敵IDです: ${id}`);
    if (this.state.defeated || this.state.victory || !this.enemies[id].active)
      throw new Error(`再出現できない敵です: ${id}`);
    const enemy = this.enemies[id];
    const hud = enemyHp[id];
    const previous = {
      x: enemy.x,
      y: enemy.y,
      spawnPhase: hud.dataset.spawnPhase ?? '',
      primaryDirection: hud.dataset.primaryDirection ?? '',
      assignedDirection: hud.dataset.assignedDirection ?? '',
      spawnTile: hud.dataset.spawnTile ?? '',
      spawnReason: hud.dataset.spawnReason ?? '',
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
    this.refreshHud();
    if (defeated) this.scheduleDefeatedEnemy(id);
  }

  private reset(initial = false): void {
    this.generation += 1;
    this.stopRunTimers();
    this.physics.resume();
    this.state = retryCombat();
    this.survivalStartedAt = this.time.now;
    this.contactAt = enemyNumbers();
    this.playerHitStopUntil = 0;
    this.enemyHitStopUntil = enemyNumbers();
    this.knockbackUntil = enemyNumbers();
    this.knockbackVelocity = enemyRecord(() => ({ x: 0, y: 0 }));
    this.shakeCooldownUntil = 0;
    this.shakeIntensity = 0;
    this.cameras.main.resetFX();
    this.respawnCount = enemyNumbers();
    this.recycleCount = enemyNumbers();
    this.lastHitAt = enemyNumbers(Number.NEGATIVE_INFINITY);
    this.hiddenSince.clear();
    this.recyclingEnemyId = undefined;
    this.paths = {} as Record<EnemyInstanceId, PathState>;
    this.visibilityTiles = {};
    this.visibilityMaskPlayerTile = undefined;
    this.visibilityMask.clear();
    this.disableAllBullets();
    ENEMY_IDS.forEach((id) => {
      this.enemies[id].setData('stableId', id);
      this.enemies[id].setData('spawnReason', INITIAL_ENEMY_IDS.includes(id) ? 'initial' : 'stagger');
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
    INITIAL_ENEMY_IDS.forEach((id) => {
      if (!this.spawnEnemy(id, 'initial'))
        this.scheduleEnemySpawn(id, 'initial', 1000);
    });
    STAGGERED_ENEMIES.forEach(({ id, delay }) => this.scheduleEnemySpawn(id, 'stagger', delay));
    this.updateEnemyVisibility(true);
    this.startSurvivalTimer();
    if (IS_DEV)
      (window as Window & { __arenaScene?: Arena }).__arenaScene = this;
    feedback.textContent = '-';
    resultPanel.hidden = true;
    resultPanel.dataset.state = 'playing';
    defeat.hidden = true;
    victory.hidden = true;
    this.refreshHud();
  }

  private buildMap(): void {
    this.ground?.destroy();
    this.wallArt?.destroy();
    this.walls.clear(true, true);
    this.ammoBoxes.clear(true, true);
    this.ammoBoxStates.clear();
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.ground = this.add.graphics().setDepth(-2).lineStyle(1, 0x31516b, 0.55);
    for (let x = 0; x <= WORLD_WIDTH; x += TILE_SIZE)
      this.ground.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = 0; y <= WORLD_HEIGHT; y += TILE_SIZE)
      this.ground.lineBetween(0, y, WORLD_WIDTH, y);
    this.wallArt = this.add.graphics().setDepth(-1).fillStyle(0x26374a, 1).lineStyle(1, 0x55728b, 1);
    for (let y = 0; y < this.map.height; y += 1)
      for (let x = 0; x < this.map.width; x += 1)
        if (this.map.tiles[y][x] === 'wall') {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          this.wallArt.fillRect(px, py, TILE_SIZE, TILE_SIZE).strokeRect(px, py, TILE_SIZE, TILE_SIZE);
          const wall = this.physics.add.staticImage(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 'wall');
          wall.setVisible(false);
          this.walls.add(wall);
        }
    this.walls.refresh();
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

  private startSurvivalTimer(): void {
    const generation = this.generation;
    this.survivalTimer = this.time.delayedCall(SURVIVAL_LIMIT_MS, () => {
      this.survivalTimer = undefined;
      if (generation !== this.generation)
        return;
      this.updateSurvival();
    });
  }

  private updateSurvival(): void {
    const next = advanceSurvivalState(this.state, this.survivalStartedAt, this.time.now);
    this.updateSurvivalHud();
    if (next === this.state)
      return;
    this.state = next;
    this.enterTerminal('victory');
  }

  private updateSurvivalHud(): void {
    survivalTimeHud.value = formatSurvivalTime(remainingSurvivalMs(this.survivalStartedAt, this.time.now));
  }

  private updateSpawnPhaseHud(): void {
    const phase = spawnPhaseAt(this.survivalStartedAt, this.time.now);
    const primaryDirection = primarySpawnDirection(this.map.seed, phase);
    spawnPhaseHud.value = String(phase + 1);
    spawnPhaseHud.dataset.phase = String(phase);
    primaryDirectionHud.value = DIRECTION_LABELS[primaryDirection];
    primaryDirectionHud.dataset.direction = primaryDirection;
  }

  private stopRunTimers(): void {
    this.survivalTimer?.remove(false);
    this.survivalTimer = undefined;
    this.enemySpawnTimers.forEach(timer => timer.remove(false));
    this.flashes.forEach(timer => timer.remove(false));
    this.ammoBoxRespawns.forEach(timer => timer.remove(false));
    this.enemySpawnTimers.clear();
    this.flashes.clear();
    this.ammoBoxRespawns.clear();
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
    playerTileHud.dataset.visibilityMaskAlpha = String(this.visibilityMask.alpha);
    playerTileHud.dataset.obscuredTileCount = String(obscuredTileCount);
    playerTileHud.dataset.visibilityPlayerTile = `${playerTile.x},${playerTile.y}`;
  }

  private moveEnemy(id: EnemyInstanceId): void {
    const enemy = this.enemies[id];
    if (!enemy.active)
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
      enemy.setVelocity((dx / length) * config.speed - (dy / length) * side, (dy / length) * config.speed + (dx / length) * side);
      return;
    }
    const separation = this.basicSeparation(id);
    const desiredX = dx / length + separation.x * 0.45;
    const desiredY = dy / length + separation.y * 0.45;
    const desiredLength = Math.hypot(desiredX, desiredY) || 1;
    enemy.setVelocity((desiredX / desiredLength) * config.speed, (desiredY / desiredLength) * config.speed);
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
        const visibility = enemyHp[id].dataset.visibility as EnemyVisibility;
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
    if (pathDistance < 10) {
      this.hiddenSince.set(id, this.time.now);
      return;
    }
    this.recyclingEnemyId = id;
    this.recycleCount[id] += 1;
    this.enemies[id].disableBody(true, true);
    this.enemies[id].setData('spawnReason', 'recycle');
    this.hideEnemyVisuals(id);
    delete this.paths[id];
    delete this.visibilityTiles[id];
    this.hiddenSince.delete(id);
    this.scheduleEnemySpawn(id, 'recycle', recycleDelayFor(id, this.recycleCount[id], this.map.seed));
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

  private syncEnemyHud(id: EnemyInstanceId, visibility: EnemyVisibility): void {
    const enemy = this.enemies[id];
    const silhouette = this.silhouettes[id];
    const hud = enemyHp[id];
    hud.dataset.stableId = String(enemy.getData('stableId') ?? id);
    hud.dataset.spawnPhase = String(enemy.getData('spawnPhase') ?? '');
    hud.dataset.primaryDirection = String(enemy.getData('primaryDirection') ?? '');
    hud.dataset.assignedDirection = String(enemy.getData('assignedDirection') ?? '');
    hud.dataset.spawnTile = String(enemy.getData('spawnTile') ?? '');
    hud.dataset.spawnReason = String(enemy.getData('spawnReason') ?? '');
    hud.dataset.active = String(enemy.active);
    hud.dataset.recycleCount = String(this.recycleCount[id]);
    hud.dataset.visibility = visibility;
    hud.dataset.spriteTexture = enemy.texture.key;
    hud.dataset.spriteAlpha = String(enemy.alpha);
    hud.dataset.spriteVisible = String(enemy.visible);
    hud.dataset.silhouetteTexture = silhouette.texture.key;
    hud.dataset.silhouetteAlpha = String(silhouette.alpha);
    hud.dataset.silhouetteVisible = String(silhouette.visible);
  }

  private changeWeapon(weapon: WeaponId): void {
    if (this.state.defeated || this.state.victory || this.state.weapon === weapon)
      return;
    const interrupted = this.state.reloading !== null;
    if (interrupted)
      this.stopReload();
    this.state = selectWeapon(this.state, weapon);
    feedback.textContent = interrupted ? `リロード中断: ${WEAPONS[weapon].label}` : `武器: ${WEAPONS[weapon].label}`;
    this.refreshHud();
  }

  private reload(): void {
    if (this.state.defeated || this.state.victory)
      return;
    const weapon = this.state.weapon;
    const next = startReload(this.state);
    if (next === this.state) {
      feedback.textContent = this.state.reloading !== null
        ? 'リロード中です'
        : this.state.reserve[weapon] <= 0
          ? '予備弾薬がありません。弾薬箱を探してください'
          : '弾倉は満タンです';
      return;
    }
    this.state = next;
    const generation = this.generation;
    feedback.textContent = `リロード中: ${WEAPONS[weapon].label}`;
    this.reloadTimer = this.time.delayedCall(WEAPONS[weapon].reloadMs, () => {
      if (generation !== this.generation || this.state.defeated || this.state.victory)
        return;
      this.state = completeReload(this.state, weapon);
      this.reloadTimer = undefined;
      feedback.textContent = `リロード完了: ${WEAPONS[weapon].label}`;
      this.refreshHud();
    });
    this.refreshHud();
  }

  private stopReload(): void {
    this.reloadTimer?.remove(false);
    this.reloadTimer = undefined;
    this.state = cancelReload(this.state);
  }

  private tryFire(pointer: Phaser.Input.Pointer): void {
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
        feedback.textContent = 'リロード中です';
      else if (this.state.ammo[this.state.weapon] === 0)
        feedback.textContent = '弾切れ: Rでリロード';
      return;
    }
    this.shakeCamera(FIRE_SHAKE);
    const base = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
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
    feedback.textContent = `${result.resisted ? '耐性' : '命中'}: ${WEAPONS[data.weapon].label} → ${ENEMY_LABELS[id]}`;
    enemy.setTint(16777215);
    const generation = this.generation;
    this.flashes.get(id)?.remove(false);
    this.flashes.set(id, this.time.delayedCall(90, () => {
      if (generation === this.generation)
        enemy.clearTint();
      this.flashes.delete(id);
    }));
    if (data.knockback > 0) {
      this.knockbackVelocity[id] = {
        x: data.directionX * data.knockback,
        y: data.directionY * data.knockback,
      };
      this.knockbackUntil[id] = this.enemyHitStopUntil[id] + 180;
    }
    this.refreshHud();
    if (!defeated)
      return;
    this.scheduleDefeatedEnemy(id);
  }

  private scheduleDefeatedEnemy(id: EnemyInstanceId): void {
    const enemy = this.enemies[id];
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

  private hitPlayer(id: EnemyInstanceId): void {
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
    if (defeated)
      this.shakeCamera(DEFEAT_SHAKE);
    else if (weapon === 'shotgun')
      this.shakeCamera(SHOTGUN_SHAKE);
  }

  private startPlayerImpact(kind: EnemyKind): void {
    this.playerHitStopUntil = Math.max(this.playerHitStopUntil, this.time.now + PLAYER_HIT_STOP_MS[kind]);
    this.player.setVelocity(0, 0);
    this.shakeCamera(PLAYER_HIT_SHAKE[kind]);
  }

  private shakeCamera(effect: { duration: number; intensity: number }): void {
    const force = effect.intensity > this.shakeIntensity || this.time.now < this.shakeCooldownUntil;
    if (force && effect.intensity <= this.shakeIntensity)
      return;
    if (!force)
      this.shakeIntensity = 0;
    this.shakeCooldownUntil = this.time.now + CAMERA_SHAKE_COOLDOWN_MS;
    this.shakeIntensity = effect.intensity;
    this.cameras.main.shake(effect.duration, effect.intensity, force);
  }

  private enterTerminal(result: 'defeat' | 'victory'): void {
    this.stopRunTimers();
    this.state = cancelReload(this.state);
    this.player.setVelocity(0, 0);
    ENEMY_IDS.forEach((enemyId) => {
      this.enemies[enemyId].setVelocity(0, 0);
      this.hideEnemyVisuals(enemyId);
    });
    this.disableAllBullets();
    this.physics.pause();
    resultPanel.hidden = false;
    resultPanel.dataset.state = result;
    defeat.hidden = result !== 'defeat';
    victory.hidden = result !== 'victory';
    retry.focus();
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
        feedback.textContent = '弾薬箱の再配置先がありません';
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
    feedback.textContent = '弾薬箱から補給しました';
    this.refreshHud();
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
    const tile = this.tile(this.player);
    playerTileHud.value = `${tile.x},${tile.y}`;
  }

  private updateReloadProgressHud(): void {
    const isReloading = this.state.reloading !== null && this.reloadTimer !== undefined;
    reloadProgressLabel.hidden = !isReloading;
    reloadProgressHud.hidden = !isReloading;
    if (!isReloading) {
      reloadProgressHud.value = 0;
      reloadProgressHud.removeAttribute('aria-valuetext');
      return;
    }
    const progress = Phaser.Math.Clamp(this.reloadTimer!.getProgress(), 0, 1);
    reloadProgressHud.value = progress;
    reloadProgressHud.setAttribute('aria-valuetext', String(Math.round(progress * 100)) + '%');
  }

  private refreshHud(): void {
    playerHp.value = String(this.state.playerHp);
    playerHpBar.value = this.state.playerHp;
    ENEMY_IDS.forEach((id) => {
      enemyHp[id].value = String(this.state.enemies[id].hp);
    });
    weaponHud.value = WEAPONS[this.state.weapon].label;
    const weapon = WEAPONS[this.state.weapon];
    ammoPanelWeaponHud.value = weapon.label;
    ammoHud.value = this.state.ammo[this.state.weapon] + '/' + weapon.magazineSize;
    reserveHud.value = '予備 ' + this.state.reserve[this.state.weapon] + '/' + weapon.reserveMax;
    ammoHud.dataset.magazine = String(this.state.ammo[this.state.weapon]);
    ammoHud.dataset.magazineCapacity = String(weapon.magazineSize);
    reserveHud.dataset.reserve = String(this.state.reserve[this.state.weapon]);
    reserveHud.dataset.reserveCapacity = String(weapon.reserveMax);
    ammoBoxCountHud.value = String(this.ammoBoxes.countActive(true));
    ammoBoxCountHud.dataset.activeTiles = this.activeAmmoBoxKeys().join('|');
    ammoBoxCountHud.dataset.activeBoxes = this.activeAmmoBoxEntries().join('|');
    ammoBoxCountHud.dataset.offscreenBoxes = this.offscreenAmmoBoxIds().join('|');
    const pendingBoxIds = [...this.ammoBoxRespawns.keys()];
    ammoBoxCountHud.dataset.respawnBoxes = pendingBoxIds.join('|');
    ammoBoxCountHud.dataset.respawnTiles = pendingBoxIds.map((boxId) => {
      const state = this.ammoBoxStates.get(boxId);
      return state ? tileKey(state.originTile) : '';
    }).filter(key => key.length > 0).join('|');
    reloadHud.value = this.state.reloading === null ? '待機' : `リロード中: ${WEAPONS[this.state.reloading].label}`;
    this.updateReloadProgressHud();
    this.updateSurvivalHud();
    this.updateSpawnPhaseHud();
    mapSeedHud.value = String(this.map.seed);
    this.updateTileHud();
  }

  private createTextures(): void {
    this.texture('player', 50, 38, (context) => {
      context.fillStyle = '#55d6ff';
      context.beginPath();
      context.moveTo(48, 19);
      context.lineTo(30, 3);
      context.lineTo(8, 7);
      context.lineTo(3, 19);
      context.lineTo(8, 31);
      context.lineTo(30, 35);
      context.closePath();
      context.fill();
      context.fillStyle = '#c7f7ff';
      context.fillRect(28, 14, 13, 10);
    });
    this.texture('basic', 46, 46, (context) => {
      context.fillStyle = '#431f36';
      context.fillRect(5, 32, 9, 11);
      context.fillRect(32, 32, 9, 11);
      context.fillStyle = '#9f3656';
      context.beginPath();
      context.moveTo(23, 2);
      context.lineTo(43, 16);
      context.lineTo(36, 37);
      context.lineTo(10, 37);
      context.lineTo(3, 16);
      context.closePath();
      context.fill();
      context.fillStyle = '#ff7b7b';
      context.beginPath();
      context.arc(23, 21, 7, 0, Math.PI * 2);
      context.fill();
    });
    this.texture('drone', 36, 28, (context) => {
      context.fillStyle = '#6d4cff';
      context.beginPath();
      context.moveTo(18, 1);
      context.lineTo(35, 14);
      context.lineTo(18, 27);
      context.lineTo(1, 14);
      context.closePath();
      context.fill();
      context.fillStyle = '#d7c7ff';
      context.fillRect(13, 10, 10, 8);
    });
    this.texture('enemy-silhouette', 36, 36, (context) => {
      context.fillStyle = '#9aa4b2';
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
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: WIDTH, height: HEIGHT, backgroundColor: '#101827', physics: { default: 'arcade', arcade: { debug: false } }, scene: Arena });
retry.addEventListener('click', () => resetArena?.());
window.addEventListener('keydown', (event) => {
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'r', '1', '2'].includes(event.key.toLowerCase()))
    event.preventDefault();
});
