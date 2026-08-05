import Phaser from 'phaser';
import { ARENA_HEIGHT_TILES, ARENA_WIDTH_TILES, TILE_SIZE, enemyVisibility, findPath, hasLineOfSight, type EnemyVisibility, generateArenaMap, generateNextArenaMap, nextSeed, respawnDelayFor, selectSpawnTile, type ArenaMap, type TilePosition } from './arena-map';
import { ENEMY_INSTANCE_IDS, WEAPONS, cancelReload, completeReload, damageEnemy, damagePlayer, droneLateralSpeedAt, fireWeapon, isEnemyDefeated, resolveDamage, respawnEnemy, retryCombat, selectWeapon, startReload, type CombatState, type DamageType, type EnemyInstanceId, type EnemyKind, type WeaponId } from './rules';
const WIDTH = 800;
const HEIGHT = 500;
const WORLD_WIDTH = ARENA_WIDTH_TILES * TILE_SIZE;
const WORLD_HEIGHT = ARENA_HEIGHT_TILES * TILE_SIZE;
const BULLET_POOL_SIZE = 48;
const ENEMY_IDS = ENEMY_INSTANCE_IDS;
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
type Controls = Phaser.Types.Input.Keyboard.CursorKeys & {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
};
const ENEMIES: Record<EnemyInstanceId, EnemyConfig> = {
  'basic-1': { kind: 'basic', speed: 68, damage: 8, cooldown: 1500 },
  'basic-2': { kind: 'basic', speed: 68, damage: 8, cooldown: 1500 },
  'basic-3': { kind: 'basic', speed: 68, damage: 8, cooldown: 1500 },
  'drone-1': { kind: 'drone', speed: 150, damage: 6, cooldown: 1200 },
};
const ENEMY_LABELS: Record<EnemyInstanceId, string> = {
  'basic-1': '基本敵 #1',
  'basic-2': '基本敵 #2',
  'basic-3': '基本敵 #3',
  'drone-1': '高速ドローン',
};
function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value)
    throw new Error(`必要なHUD要素が見つかりません: ${selector}`);
  return value;
}
function enemyNumbers(): Record<EnemyInstanceId, number> {
  return { 'basic-1': 0, 'basic-2': 0, 'basic-3': 0, 'drone-1': 0 };
}

function sameTile(left: TilePosition, right: TilePosition): boolean {
  return left.x === right.x && left.y === right.y;
}
const playerHp = element<HTMLOutputElement>('[data-testid="hp"]');
const weaponHud = element<HTMLOutputElement>('[data-testid="weapon"]');
const ammoHud = element<HTMLOutputElement>('[data-testid="ammo"]');
const reloadHud = element<HTMLOutputElement>('[data-testid="reload"]');
const mapSeedHud = element<HTMLOutputElement>('[data-testid="map-seed"]');
const playerTileHud = element<HTMLOutputElement>('[data-testid="player-tile"]');
const fps = element<HTMLOutputElement>('[data-testid="fps"]');
const feedback = element<HTMLElement>('[data-testid="feedback"]');
const defeat = element<HTMLElement>('[data-testid="defeat"]');
const retry = element<HTMLButtonElement>('[data-testid="retry"]');
const enemyHp: Record<EnemyInstanceId, HTMLOutputElement> = { 'basic-1': element('[data-testid="basic-1-hp"]'), 'basic-2': element('[data-testid="basic-2-hp"]'), 'basic-3': element('[data-testid="basic-3-hp"]'), 'drone-1': element('[data-testid="drone-hp"]') };
let resetArena: (() => void) | undefined;
class Arena extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private enemies!: Record<EnemyInstanceId, Phaser.Physics.Arcade.Sprite>;
  private silhouettes!: Record<EnemyInstanceId, Phaser.GameObjects.Image>;
  private bullets!: Phaser.Physics.Arcade.Group;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
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
  private knockbackUntil = enemyNumbers();
  private respawnCount = enemyNumbers();
  private paths = {} as Record<EnemyInstanceId, PathState>;
  private respawns = new Map<EnemyInstanceId, Phaser.Time.TimerEvent>();
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
    this.player = this.physics.add
      .sprite(0, 0, 'player')
      .setCollideWorldBounds(true)
      .setBodySize(28, 28)
      .setDepth(3);
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
    fps.value = String(Math.round(this.game.loop.actualFps));
    if (this.state.defeated)
      return;
    const x = Number(this.keys.d.isDown || this.keys.right.isDown) - Number(this.keys.a.isDown || this.keys.left.isDown);
    const y = Number(this.keys.s.isDown || this.keys.down.isDown) - Number(this.keys.w.isDown || this.keys.up.isDown);
    const length = Math.hypot(x, y) || 1;
    this.player.setVelocity((x / length) * 210, (y / length) * 210);
    this.updateTileHud();
    this.updateVisibilityMask();
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

  private reset(initial = false): void {
    this.generation += 1;
    this.respawns.forEach(timer => timer.remove(false));
    this.flashes.forEach(timer => timer.remove(false));
    this.reloadTimer?.remove(false);
    this.respawns.clear();
    this.flashes.clear();
    this.reloadTimer = undefined;
    this.physics.resume();
    this.state = retryCombat();
    this.contactAt = enemyNumbers();
    this.knockbackUntil = enemyNumbers();
    this.respawnCount = enemyNumbers();
    this.paths = {} as Record<EnemyInstanceId, PathState>;
    this.visibilityTiles = {};
    this.visibilityMaskPlayerTile = undefined;
    this.visibilityMask.clear();
    this.disableAllBullets();
    ENEMY_IDS.forEach(id => this.hideEnemyVisuals(id));
    ENEMY_IDS.forEach(id => this.enemies[id].disableBody(true, true));
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
    ENEMY_IDS.forEach((id) => {
      if (!this.spawnEnemy(id))
        throw new Error('マップ上に敵の出現位置を確保できません。');
    });
    this.updateEnemyVisibility(true);
    feedback.textContent = '-';
    defeat.hidden = true;
    this.refreshHud();
  }

  private buildMap(): void {
    this.ground?.destroy();
    this.wallArt?.destroy();
    this.walls.clear(true, true);
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
    if (!enemy.active || this.time.now < this.knockbackUntil[id])
      return;
    const playerTile = this.tile(this.player);
    const enemyTile = this.tile(enemy);
    const cached = this.paths[id];
    if (
      !cached
      || this.time.now >= cached.nextAt
      || !sameTile(cached.playerTile, playerTile)
      || !sameTile(cached.enemyTile, enemyTile)
    ) {
      this.paths[id] = {
        path: findPath(this.map, enemyTile, playerTile),
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
    const config = ENEMIES[id];
    const side = config.kind === 'drone' ? droneLateralSpeedAt(this.time.now) : 0;
    enemy.setVelocity((dx / length) * config.speed - (dy / length) * side, (dy / length) * config.speed + (dx / length) * side);
  }

  private spawnEnemy(id: EnemyInstanceId): boolean {
    const occupied = [
      this.tile(this.player),
      ...ENEMY_IDS
        .filter(other => other !== id && this.enemies[other].active)
        .map(other => this.tile(this.enemies[other])),
    ];
    const tile = selectSpawnTile(
      this.map,
      { player: this.tile(this.player), viewport: this.viewport(), occupied },
      nextSeed(this.map.seed + this.respawnCount[id] + ENEMY_IDS.indexOf(id)),
    );
    if (!tile) {
      this.enemies[id].disableBody(true, true);
      this.hideEnemyVisuals(id);
      return false;
    }
    const point = this.world(tile);
    this.enemies[id]
      .enableBody(true, point.x, point.y, true, true)
      .setVelocity(0, 0)
      .clearTint();
    this.paths[id] = {
      path: [],
      nextAt: 0,
      playerTile: this.tile(this.player),
      enemyTile: tile,
    };
    this.updateVisibilityMask(true);
    this.updateEnemyVisibility(true);
    return true;
  }

  private updateEnemyVisibility(force = false): void {
    const playerTile = this.tile(this.player);
    ENEMY_IDS.forEach((id) => {
      const enemy = this.enemies[id];
      const silhouette = this.silhouettes[id];
      if (!enemy.active) {
        this.hideEnemyVisuals(id);
        delete this.visibilityTiles[id];
        return;
      }
      silhouette.setPosition(enemy.x, enemy.y);
      const enemyTile = this.tile(enemy);
      const previous = this.visibilityTiles[id];
      if (!force && previous && sameTile(previous.player, playerTile) && sameTile(previous.enemy, enemyTile)) {
        this.syncEnemyHud(id, enemyHp[id].dataset.visibility as EnemyVisibility);
        return;
      }
      const visibility = enemyVisibility(this.map, playerTile, enemyTile);
      this.applyEnemyVisibility(id, visibility);
      this.visibilityTiles[id] = { player: playerTile, enemy: enemyTile };
    });
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
    hud.dataset.visibility = visibility;
    hud.dataset.spriteTexture = enemy.texture.key;
    hud.dataset.spriteAlpha = String(enemy.alpha);
    hud.dataset.spriteVisible = String(enemy.visible);
    hud.dataset.silhouetteTexture = silhouette.texture.key;
    hud.dataset.silhouetteAlpha = String(silhouette.alpha);
    hud.dataset.silhouetteVisible = String(silhouette.visible);
  }

  private changeWeapon(weapon: WeaponId): void {
    if (this.state.defeated || this.state.weapon === weapon)
      return;
    const interrupted = this.state.reloading !== null;
    if (interrupted)
      this.stopReload();
    this.state = selectWeapon(this.state, weapon);
    feedback.textContent = interrupted ? `リロード中断: ${WEAPONS[weapon].label}` : `武器: ${WEAPONS[weapon].label}`;
    this.refreshHud();
  }

  private reload(): void {
    if (this.state.defeated)
      return;
    const weapon = this.state.weapon;
    const next = startReload(this.state);
    if (next === this.state) {
      feedback.textContent = this.state.reloading === null ? '弾倉は満タンです' : 'リロード中です';
      return;
    }
    this.state = next;
    const generation = this.generation;
    feedback.textContent = `リロード中: ${WEAPONS[weapon].label}`;
    this.reloadTimer = this.time.delayedCall(WEAPONS[weapon].reloadMs, () => {
      if (generation !== this.generation || this.state.defeated)
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
    const weapon = WEAPONS[this.state.weapon];
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
    if (!data || enemy !== this.enemies[id] || !enemy.active || this.state.defeated)
      return;
    this.disableBullet(bullet);
    const result = resolveDamage(this.state.enemies[id].kind, data.damageType, data.damage);
    this.state = damageEnemy(this.state, id, result.amount);
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
      enemy.setVelocity(data.directionX * data.knockback, data.directionY * data.knockback);
      this.knockbackUntil[id] = this.time.now + 180;
    }
    this.refreshHud();
    if (!isEnemyDefeated(this.state, id))
      return;
    enemy.disableBody(true, true);
    this.hideEnemyVisuals(id);
    this.respawnCount[id] += 1;
    const delay = respawnDelayFor(ENEMIES[id].kind, id, this.respawnCount[id], this.map.seed);
    this.respawns.set(id, this.time.delayedCall(delay, () => {
      this.respawns.delete(id);
      if (generation !== this.generation || this.state.defeated)
        return;
      if (!this.spawnEnemy(id)) {
        feedback.textContent = `${ENEMY_LABELS[id]}の再出現位置がありません`;
        return;
      }
      this.state = respawnEnemy(this.state, id);
      this.refreshHud();
    }));
  }

  private hitPlayer(id: EnemyInstanceId): void {
    if (this.state.defeated || this.time.now - this.contactAt[id] < ENEMIES[id].cooldown)
      return;
    this.contactAt[id] = this.time.now;
    this.state = damagePlayer(this.state, ENEMIES[id].damage);
    if (!this.state.defeated) {
      this.refreshHud();
      return;
    }
    this.stopReload();
    this.player.setVelocity(0, 0);
    ENEMY_IDS.forEach((enemyId) => {
      this.enemies[enemyId].setVelocity(0, 0);
      this.hideEnemyVisuals(enemyId);
    });
    this.disableAllBullets();
    this.physics.pause();
    defeat.hidden = false;
    retry.focus();
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
    const view = this.cameras.main.worldView;
    return {
      left: Math.max(0, Math.floor(view.left / TILE_SIZE)),
      top: Math.max(0, Math.floor(view.top / TILE_SIZE)),
      right: Math.min(ARENA_WIDTH_TILES - 1, Math.floor(view.right / TILE_SIZE)),
      bottom: Math.min(ARENA_HEIGHT_TILES - 1, Math.floor(view.bottom / TILE_SIZE)),
    };
  }

  private updateTileHud(): void {
    const tile = this.tile(this.player);
    playerTileHud.value = `${tile.x},${tile.y}`;
  }

  private refreshHud(): void {
    playerHp.value = String(this.state.playerHp);
    ENEMY_IDS.forEach((id) => {
      enemyHp[id].value = String(this.state.enemies[id].hp);
    });
    weaponHud.value = WEAPONS[this.state.weapon].label;
    ammoHud.value = `${this.state.ammo[this.state.weapon]}/${WEAPONS[this.state.weapon].magazineSize}`;
    reloadHud.value = this.state.reloading === null ? '待機' : `リロード中: ${WEAPONS[this.state.reloading].label}`;
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
