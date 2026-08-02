import Phaser from 'phaser';
import {
  damageEnemy,
  damagePlayer,
  isEnemyDefeated,
  retryCombat,
  type CombatState,
} from './rules';

const ARENA_WIDTH = 800;
const ARENA_HEIGHT = 500;
const PLAYER_X = 400;
const PLAYER_Y = 250;
const ENEMY_X = 90;
const ENEMY_Y = 90;
const PLAYER_SPEED = 210;
const ENEMY_SPEED = 115;
const BULLET_SPEED = 520;
const CONTACT_DAMAGE = 20;
const CONTACT_COOLDOWN_MS = 900;
const ENEMY_RESPAWN_MS = 700;

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`必要なHUD要素が見つかりません: ${selector}`);
  }

  return element;
}

const playerHp = requireElement<HTMLOutputElement>('[data-testid="hp"]');
const enemyHp = requireElement<HTMLOutputElement>('[data-testid="enemy-hp"]');
const fps = requireElement<HTMLOutputElement>('[data-testid="fps"]');
const defeat = requireElement<HTMLElement>('[data-testid="defeat"]');
const retry = requireElement<HTMLButtonElement>('[data-testid="retry"]');

type Controls = {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
};

let resetArena: (() => void) | undefined;

class Arena extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private enemy!: Phaser.Physics.Arcade.Sprite;
  private bullets!: Phaser.Physics.Arcade.Group;
  private keys!: Controls;

  private state: CombatState = retryCombat();
  private lastContactAt = 0;
  private enemyRespawn?: Phaser.Time.TimerEvent;

  constructor() {
    super('arena');
  }

  create(): void {
    resetArena = () => this.reset();
    this.add
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, 0x16243b)
      .setStrokeStyle(4, 0x7ee7ff);
    this.createTextures();
    this.physics.world.setBounds(18, 18, ARENA_WIDTH - 36, ARENA_HEIGHT - 36);

    this.player = this.physics.add
      .sprite(PLAYER_X, PLAYER_Y, 'player')
      .setCollideWorldBounds(true);
    this.enemy = this.physics.add
      .sprite(ENEMY_X, ENEMY_Y, 'enemy')
      .setCollideWorldBounds(true);
    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Sprite,
      maxSize: 24,
    });
    this.keys = this.input.keyboard!.addKeys({
      w: 'W',
      a: 'A',
      s: 'S',
      d: 'D',
      up: 'UP',
      down: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
    }) as Controls;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.fire(pointer);
    });
    this.physics.add.overlap(this.bullets, this.enemy, this.onBulletEnemyHit, undefined, this);
    this.physics.add.overlap(this.player, this.enemy, this.onPlayerEnemyContact, undefined, this);
    this.input.keyboard?.addCapture([
      'W',
      'A',
      'S',
      'D',
      'UP',
      'DOWN',
      'LEFT',
      'RIGHT',
    ]);
    this.events.on('shutdown', () => {
      this.input.keyboard?.removeCapture([
        'W',
        'A',
        'S',
        'D',
        'UP',
        'DOWN',
        'LEFT',
        'RIGHT',
      ]);
    });
    this.refreshHud();
  }

  update(): void {
    fps.value = String(Math.round(this.game.loop.actualFps));
    if (this.state.defeated) {
      return;
    }

    this.movePlayer();
    this.moveEnemy();
    this.player.rotation = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      this.input.activePointer.worldX,
      this.input.activePointer.worldY,
    );
    this.disableOutOfBoundsBullets();
  }

  reset(): void {
    this.enemyRespawn?.remove(false);
    this.enemyRespawn = undefined;
    this.physics.resume();
    this.state = retryCombat();
    this.lastContactAt = 0;
    this.disableAllBullets();
    this.player.enableBody(true, PLAYER_X, PLAYER_Y, true, true).setVelocity(0, 0);
    this.enemy.enableBody(true, ENEMY_X, ENEMY_Y, true, true).setVelocity(0, 0);
    defeat.hidden = true;
    this.refreshHud();
  }

  private createTextures(): void {
    this.createPlayerTexture();
    this.createEnemyTexture();
    this.createBulletTexture();
  }

  private createPlayerTexture(): void {
    const texture = this.textures.createCanvas('player', 50, 38);
    if (!texture) {
      return;
    }

    const { context } = texture;
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
    texture.refresh();
  }

  private createEnemyTexture(): void {
    const texture = this.textures.createCanvas('enemy', 46, 46);
    if (!texture) {
      return;
    }

    const { context } = texture;
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
    texture.refresh();
  }

  private createBulletTexture(): void {
    const texture = this.textures.createCanvas('bullet', 12, 12);
    if (!texture) {
      return;
    }

    const { context } = texture;
    context.fillStyle = '#ffef76';
    context.beginPath();
    context.arc(6, 6, 5, 0, Math.PI * 2);
    context.fill();
    texture.refresh();
  }

  private movePlayer(): void {
    const x
      = Number(this.keys.d.isDown || this.keys.right.isDown)
        - Number(this.keys.a.isDown || this.keys.left.isDown);
    const y
      = Number(this.keys.s.isDown || this.keys.down.isDown)
        - Number(this.keys.w.isDown || this.keys.up.isDown);
    const length = Math.hypot(x, y) || 1;
    this.player.setVelocity((x / length) * PLAYER_SPEED, (y / length) * PLAYER_SPEED);
  }

  private moveEnemy(): void {
    if (!this.enemy.active) {
      return;
    }

    const x = this.player.x - this.enemy.x;
    const y = this.player.y - this.enemy.y;
    const length = Math.hypot(x, y) || 1;
    this.enemy.setVelocity((x / length) * ENEMY_SPEED, (y / length) * ENEMY_SPEED);
  }

  private fire(pointer: Phaser.Input.Pointer): void {
    if (this.state.defeated) {
      return;
    }

    const bullet = this.bullets.get(this.player.x, this.player.y, 'bullet') as
      | Phaser.Physics.Arcade.Sprite
      | null;
    if (!bullet) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY,
    );
    bullet.enableBody(true, this.player.x, this.player.y, true, true);
    bullet.setVelocity(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED);
  }

  private onBulletEnemyHit = (
    bulletObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    enemyObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  ): void => {
    const first = bulletObject as Phaser.Physics.Arcade.Sprite;
    const second = enemyObject as Phaser.Physics.Arcade.Sprite;
    const bullet = first.texture.key === 'bullet' ? first : second;
    const enemy = bullet === first ? second : first;
    if (
      this.state.defeated
      || bullet.texture.key !== 'bullet'
      || enemy !== this.enemy
      || !bullet.active
      || !enemy.active
    ) {
      return;
    }

    bullet.disableBody(true, true);
    this.state = damageEnemy(this.state, 1);
    this.refreshHud();
    if (!isEnemyDefeated(this.state)) {
      return;
    }

    enemy.disableBody(true, true);
    this.enemyRespawn = this.time.delayedCall(ENEMY_RESPAWN_MS, () => {
      if (this.state.defeated) {
        return;
      }

      this.state = {
        ...this.state,
        enemyHp: retryCombat().enemyHp,
      };
      this.enemy.enableBody(true, ENEMY_X, ENEMY_Y, true, true).setVelocity(0, 0);
      this.refreshHud();
    });
  };

  private onPlayerEnemyContact = (): void => {
    if (this.state.defeated || this.time.now - this.lastContactAt < CONTACT_COOLDOWN_MS) {
      return;
    }

    this.lastContactAt = this.time.now;
    this.state = damagePlayer(this.state, CONTACT_DAMAGE);
    this.refreshHud();
    if (!this.state.defeated) {
      return;
    }

    this.player.setVelocity(0, 0);
    this.enemy.setVelocity(0, 0);
    this.disableAllBullets();
    this.physics.pause();
    defeat.hidden = false;
    retry.focus();
  };

  private disableOutOfBoundsBullets(): void {
    const bounds = this.physics.world.bounds;
    this.bullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (bullet.active && !Phaser.Geom.Rectangle.Contains(bounds, bullet.x, bullet.y)) {
        bullet.disableBody(true, true);
      }
    });
  }

  private disableAllBullets(): void {
    this.bullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      bullet.setVelocity(0, 0).disableBody(true, true);
    });
  }

  private refreshHud(): void {
    playerHp.value = String(this.state.playerHp);
    enemyHp.value = String(this.state.enemyHp);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  backgroundColor: '#101827',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: Arena,
});

retry.addEventListener('click', () => {
  resetArena?.();
});

window.addEventListener('keydown', (event) => {
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd'];
  if (keys.includes(event.key) || keys.includes(event.key.toLowerCase())) {
    event.preventDefault();
  }
});

void game;
