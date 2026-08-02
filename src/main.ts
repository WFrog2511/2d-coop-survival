import Phaser from 'phaser';
import {
  ENEMY_INSTANCE_IDS,
  WEAPONS,
  cancelReload,
  completeReload,
  damageEnemy,
  damagePlayer,
  fireWeapon,
  isEnemyDefeated,
  respawnEnemy,
  retryCombat,
  selectWeapon,
  startReload,
  type CombatState,
  type EnemyInstanceId,
  type EnemyKind,
  type WeaponId,
} from './rules';

const WIDTH = 800;
const HEIGHT = 500;
const BULLET_POOL_SIZE = 48;
const PLAYER_POSITION = { x: 400, y: 250 };
const ENEMY_IDS = ENEMY_INSTANCE_IDS;

type EnemyConfig = {
  kind: EnemyKind;
  x: number;
  y: number;
  speed: number;
  damage: number;
  cooldown: number;
  respawn: number;
};

const ENEMIES: Record<EnemyInstanceId, EnemyConfig> = {
  'basic-1': { kind: 'basic', x: 90, y: 90, speed: 68, damage: 8, cooldown: 1500, respawn: 1600 },
  'basic-2': { kind: 'basic', x: 90, y: 410, speed: 68, damage: 8, cooldown: 1500, respawn: 1600 },
  'basic-3': { kind: 'basic', x: 690, y: 420, speed: 68, damage: 8, cooldown: 1500, respawn: 1600 },
  'drone-1': { kind: 'drone', x: 710, y: 80, speed: 120, damage: 6, cooldown: 1200, respawn: 1200 },
};

const ENEMY_LABELS: Record<EnemyInstanceId, string> = {
  'basic-1': '基本敵 #1',
  'basic-2': '基本敵 #2',
  'basic-3': '基本敵 #3',
  'drone-1': '高速ドローン',
};

type Controls = Phaser.Types.Input.Keyboard.CursorKeys & {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
};

type BulletMeta = {
  weapon: WeaponId;
  damage: number;
  range: number;
  knockback: number;
  startX: number;
  startY: number;
  directionX: number;
  directionY: number;
};

function element<ElementType extends Element>(selector: string): ElementType {
  const found = document.querySelector<ElementType>(selector);
  if (!found) throw new Error(`必要なHUD要素が見つかりません: ${selector}`);
  return found;
}

function enemyNumbers(): Record<EnemyInstanceId, number> {
  return { 'basic-1': 0, 'basic-2': 0, 'basic-3': 0, 'drone-1': 0 };
}

const playerHp = element<HTMLOutputElement>('[data-testid="hp"]');
const enemyHp: Record<EnemyInstanceId, HTMLOutputElement> = {
  'basic-1': element<HTMLOutputElement>('[data-testid="basic-1-hp"]'),
  'basic-2': element<HTMLOutputElement>('[data-testid="basic-2-hp"]'),
  'basic-3': element<HTMLOutputElement>('[data-testid="basic-3-hp"]'),
  'drone-1': element<HTMLOutputElement>('[data-testid="drone-hp"]'),
};
const weaponHud = element<HTMLOutputElement>('[data-testid="weapon"]');
const ammoHud = element<HTMLOutputElement>('[data-testid="ammo"]');
const reloadHud = element<HTMLOutputElement>('[data-testid="reload"]');
const fps = element<HTMLOutputElement>('[data-testid="fps"]');
const feedback = element<HTMLElement>('[data-testid="feedback"]');
const defeat = element<HTMLElement>('[data-testid="defeat"]');
const retry = element<HTMLButtonElement>('[data-testid="retry"]');
let resetArena: (() => void) | undefined;

class Arena extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private enemies!: Record<EnemyInstanceId, Phaser.Physics.Arcade.Sprite>;
  private bullets!: Phaser.Physics.Arcade.Group;
  private keys!: Controls;
  private state: CombatState = retryCombat();
  private bulletMeta = new Map<Phaser.Physics.Arcade.Sprite, BulletMeta>();
  private contactAt = enemyNumbers();
  private knockbackUntil = enemyNumbers();
  private respawns = new Map<EnemyInstanceId, Phaser.Time.TimerEvent>();
  private feedbackTimers = new Map<EnemyInstanceId, Phaser.Time.TimerEvent>();
  private reloadTimer: Phaser.Time.TimerEvent | undefined;

  constructor() {
    super('arena');
  }

  create(): void {
    resetArena = () => this.reset();
    this.add
      .rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x16243b)
      .setStrokeStyle(4, 0x7ee7ff);
    this.createTextures();
    this.physics.world.setBounds(18, 18, WIDTH - 36, HEIGHT - 36);
    this.player = this.physics.add
      .sprite(PLAYER_POSITION.x, PLAYER_POSITION.y, 'player')
      .setCollideWorldBounds(true);
    this.enemies = {} as Record<EnemyInstanceId, Phaser.Physics.Arcade.Sprite>;
    ENEMY_IDS.forEach((enemyId) => {
      this.enemies[enemyId] = this.createEnemy(enemyId);
    });
    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Sprite,
      maxSize: BULLET_POOL_SIZE,
    });
    this.keys = this.input.keyboard!.addKeys({
      w: 'W',
      a: 'A',
      s: 'S',
      d: 'D',
      r: 'R',
      up: 'UP',
      down: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
    }) as Controls;
    this.input.keyboard?.on('keydown-ONE', () => this.changeWeapon('rifle'));
    this.input.keyboard?.on('keydown-TWO', () => this.changeWeapon('shotgun'));
    this.input.keyboard?.on('keydown-R', () => this.reload());
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!WEAPONS[this.state.weapon].automatic) this.tryFire(pointer);
    });
    ENEMY_IDS.forEach((enemyId) => {
      this.physics.add.overlap(
        this.bullets,
        this.enemies[enemyId],
        (first, second) => this.hitEnemy(first, second, enemyId),
      );
      this.physics.add.overlap(
        this.player,
        this.enemies[enemyId],
        () => this.hitPlayer(enemyId),
      );
    });
    this.input.keyboard?.addCapture([
      'W',
      'A',
      'S',
      'D',
      'R',
      'UP',
      'DOWN',
      'LEFT',
      'RIGHT',
      'ONE',
      'TWO',
    ]);
    this.refreshHud();
  }

  update(): void {
    fps.value = String(Math.round(this.game.loop.actualFps));
    if (this.state.defeated) return;
    this.movePlayer();
    ENEMY_IDS.forEach(enemyId => this.moveEnemy(enemyId));
    this.player.rotation = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      this.input.activePointer.worldX,
      this.input.activePointer.worldY,
    );
    if (WEAPONS[this.state.weapon].automatic && this.input.activePointer.isDown) {
      this.tryFire(this.input.activePointer);
    }
    this.disableExpiredBullets();
  }

  reset(): void {
    this.respawns.forEach(timer => timer.remove(false));
    this.feedbackTimers.forEach(timer => timer.remove(false));
    this.reloadTimer?.remove(false);
    this.respawns.clear();
    this.feedbackTimers.clear();
    this.reloadTimer = undefined;
    this.physics.resume();
    this.state = retryCombat();
    this.contactAt = enemyNumbers();
    this.knockbackUntil = enemyNumbers();
    this.disableAllBullets();
    this.player.enableBody(true, PLAYER_POSITION.x, PLAYER_POSITION.y, true, true).setVelocity(0, 0);
    ENEMY_IDS.forEach((enemyId) => {
      const config = ENEMIES[enemyId];
      this.enemies[enemyId]
        .enableBody(true, config.x, config.y, true, true)
        .setVelocity(0, 0)
        .clearTint();
    });
    feedback.textContent = '-';
    defeat.hidden = true;
    this.refreshHud();
  }

  private createEnemy(enemyId: EnemyInstanceId): Phaser.Physics.Arcade.Sprite {
    const config = ENEMIES[enemyId];
    const texture = config.kind === 'basic' ? 'basic' : 'drone';
    return this.physics.add.sprite(config.x, config.y, texture).setCollideWorldBounds(true);
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

  private texture(
    key: string,
    width: number,
    height: number,
    draw: (context: CanvasRenderingContext2D) => void,
  ): void {
    const texture = this.textures.createCanvas(key, width, height);
    if (!texture) return;
    draw(texture.context);
    texture.refresh();
  }

  private changeWeapon(weapon: WeaponId): void {
    if (this.state.defeated || this.state.weapon === weapon) return;
    const interrupted = this.state.reloading !== null;
    if (interrupted) this.stopReload();
    this.state = selectWeapon(this.state, weapon);
    feedback.textContent = interrupted
      ? `リロード中断: ${WEAPONS[weapon].label}`
      : `武器: ${WEAPONS[weapon].label}`;
    this.refreshHud();
  }

  private reload(): void {
    if (this.state.defeated) return;
    const weapon = this.state.weapon;
    const reloading = startReload(this.state);
    if (reloading === this.state) {
      feedback.textContent = this.state.reloading === null ? '弾倉は満タンです' : 'リロード中です';
      return;
    }
    this.state = reloading;
    feedback.textContent = `リロード中: ${WEAPONS[weapon].label}`;
    this.reloadTimer = this.time.delayedCall(WEAPONS[weapon].reloadMs, () => {
      if (this.state.defeated) return;
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

  private movePlayer(): void {
    const x = Number(this.keys.d.isDown || this.keys.right.isDown) - Number(this.keys.a.isDown || this.keys.left.isDown);
    const y = Number(this.keys.s.isDown || this.keys.down.isDown) - Number(this.keys.w.isDown || this.keys.up.isDown);
    const length = Math.hypot(x, y) || 1;
    this.player.setVelocity((x / length) * 210, (y / length) * 210);
  }

  private moveEnemy(enemyId: EnemyInstanceId): void {
    const enemy = this.enemies[enemyId];
    if (!enemy.active || this.time.now < this.knockbackUntil[enemyId]) return;
    const x = this.player.x - enemy.x;
    const y = this.player.y - enemy.y;
    const length = Math.hypot(x, y) || 1;
    const config = ENEMIES[enemyId];
    const directionX = x / length;
    const directionY = y / length;
    const sideSpeed = config.kind === 'drone' ? Math.sin(this.time.now / 180) * 70 : 0;
    enemy.setVelocity(
      directionX * config.speed - directionY * sideSpeed,
      directionY * config.speed + directionX * sideSpeed,
    );
  }

  private tryFire(pointer: Phaser.Input.Pointer): void {
    const weapon = WEAPONS[this.state.weapon];
    if (BULLET_POOL_SIZE - this.bullets.countActive(true) < weapon.pellets) return;
    const result = fireWeapon(this.state, this.time.now);
    this.state = result.state;
    if (!result.fired) {
      if (this.state.reloading !== null) feedback.textContent = 'リロード中です';
      else if (this.state.ammo[this.state.weapon] === 0) feedback.textContent = '弾切れ: Rでリロード';
      return;
    }
    const baseAngle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY,
    );
    for (let index = 0; index < weapon.pellets; index += 1) {
      const bullet = this.bullets.get(
        this.player.x,
        this.player.y,
        `bullet-${this.state.weapon}`,
      ) as Phaser.Physics.Arcade.Sprite | null;
      if (!bullet) continue;
      const ratio = weapon.pellets === 1 ? 0 : index / (weapon.pellets - 1) - 0.5;
      const angle = baseAngle + ratio * weapon.spread * 2;
      bullet.enableBody(true, this.player.x, this.player.y, true, true);
      bullet.setTexture(`bullet-${this.state.weapon}`);
      bullet.setVelocity(Math.cos(angle) * weapon.speed, Math.sin(angle) * weapon.speed);
      this.bulletMeta.set(bullet, {
        weapon: this.state.weapon,
        damage: weapon.damage,
        range: weapon.range,
        knockback: weapon.knockback,
        startX: this.player.x,
        startY: this.player.y,
        directionX: Math.cos(angle),
        directionY: Math.sin(angle),
      });
    }
    this.refreshHud();
  }

  private hitEnemy(
    firstObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    secondObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    enemyId: EnemyInstanceId,
  ): void {
    const first = firstObject as Phaser.Physics.Arcade.Sprite;
    const second = secondObject as Phaser.Physics.Arcade.Sprite;
    const bullet = this.bulletMeta.has(first) ? first : second;
    const enemy = bullet === first ? second : first;
    const meta = this.bulletMeta.get(bullet);
    if (!meta || enemy !== this.enemies[enemyId] || !enemy.active || this.state.defeated) return;
    this.disableBullet(bullet);
    this.state = damageEnemy(this.state, enemyId, meta.damage);
    this.showHit(enemy, enemyId, meta);
    this.refreshHud();
    if (!isEnemyDefeated(this.state, enemyId)) return;
    enemy.disableBody(true, true);
    const timer = this.time.delayedCall(ENEMIES[enemyId].respawn, () => {
      if (this.state.defeated) return;
      this.state = respawnEnemy(this.state, enemyId);
      const config = ENEMIES[enemyId];
      this.enemies[enemyId]
        .enableBody(true, config.x, config.y, true, true)
        .setVelocity(0, 0);
      this.respawns.delete(enemyId);
      this.refreshHud();
    });
    this.respawns.set(enemyId, timer);
  }

  private showHit(
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyId: EnemyInstanceId,
    meta: BulletMeta,
  ): void {
    feedback.textContent = `命中: ${WEAPONS[meta.weapon].label} → ${ENEMY_LABELS[enemyId]}`;
    this.feedbackTimers.get(enemyId)?.remove(false);
    enemy.setTint(0xffffff);
    const timer = this.time.delayedCall(90, () => {
      enemy.clearTint();
      this.feedbackTimers.delete(enemyId);
    });
    this.feedbackTimers.set(enemyId, timer);
    if (meta.knockback === 0) return;
    enemy.setVelocity(meta.directionX * meta.knockback, meta.directionY * meta.knockback);
    this.knockbackUntil[enemyId] = this.time.now + 180;
  }

  private hitPlayer(enemyId: EnemyInstanceId): void {
    if (
      this.state.defeated
      || this.time.now - this.contactAt[enemyId] < ENEMIES[enemyId].cooldown
    ) {
      return;
    }
    this.contactAt[enemyId] = this.time.now;
    this.state = damagePlayer(this.state, ENEMIES[enemyId].damage);
    if (!this.state.defeated) {
      this.refreshHud();
      return;
    }
    this.stopReload();
    this.refreshHud();
    this.player.setVelocity(0, 0);
    ENEMY_IDS.forEach(id => this.enemies[id].setVelocity(0, 0));
    this.disableAllBullets();
    this.physics.pause();
    defeat.hidden = false;
    retry.focus();
  }

  private disableExpiredBullets(): void {
    const bounds = this.physics.world.bounds;
    this.bullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      const meta = this.bulletMeta.get(bullet);
      const exceededRange = meta
        && Phaser.Math.Distance.Between(meta.startX, meta.startY, bullet.x, bullet.y) > meta.range;
      if (
        bullet.active
        && (!Phaser.Geom.Rectangle.Contains(bounds, bullet.x, bullet.y) || exceededRange)
      ) {
        this.disableBullet(bullet);
      }
    });
  }

  private disableBullet(bullet: Phaser.Physics.Arcade.Sprite): void {
    this.bulletMeta.delete(bullet);
    bullet.setVelocity(0, 0).disableBody(true, true);
  }

  private disableAllBullets(): void {
    this.bullets.getChildren().forEach(child => this.disableBullet(child as Phaser.Physics.Arcade.Sprite));
  }

  private refreshHud(): void {
    playerHp.value = String(this.state.playerHp);
    ENEMY_IDS.forEach((enemyId) => {
      enemyHp[enemyId].value = String(this.state.enemies[enemyId].hp);
    });
    weaponHud.value = WEAPONS[this.state.weapon].label;
    ammoHud.value = `${this.state.ammo[this.state.weapon]}/${WEAPONS[this.state.weapon].magazineSize}`;
    reloadHud.value = this.state.reloading === null ? '待機' : `リロード中: ${WEAPONS[this.state.reloading].label}`;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#101827',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: Arena,
});
retry.addEventListener('click', () => resetArena?.());
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'r', '1', '2'].includes(key)) {
    event.preventDefault();
  }
});
