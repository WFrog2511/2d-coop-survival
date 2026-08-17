import Phaser from 'phaser';
import type { EnemyVisibility } from '../arena-map';
import type { EnemyHudView } from './hud';
import type { EnemyInstanceId, EnemyKind } from '../rules';

export type EnemyActorVelocity = { x: number; y: number };

export type EnemyActorRuntimeView = {
  id: EnemyInstanceId;
  active: boolean;
  hitStopUntil: number;
  knockbackUntil: number;
  knockbackVelocity: EnemyActorVelocity;
  visibility: EnemyVisibility;
};

export type EnemyActorSpawnMetadata = {
  spawnPhase: string;
  primaryDirection: string;
  assignedDirection: string;
  spawnTile: string;
  spawnReason: string;
};

const EMPTY_SPAWN_METADATA: EnemyActorSpawnMetadata = {
  spawnPhase: '',
  primaryDirection: '',
  assignedDirection: '',
  spawnTile: '',
  spawnReason: '',
};

export class EnemyActor {
  public readonly sprite: Phaser.Physics.Arcade.Sprite;
  public readonly silhouette: Phaser.GameObjects.Image;
  private hitStopUntil = 0;
  private knockbackUntil = 0;
  private knockbackVelocity: EnemyActorVelocity = { x: 0, y: 0 };
  private spawnMetadata: EnemyActorSpawnMetadata = { ...EMPTY_SPAWN_METADATA };

  constructor(
    scene: Phaser.Scene,
    public readonly id: EnemyInstanceId,
    kind: EnemyKind,
  ) {
    const bodySize = kind === 'basic' ? { width: 28, height: 28 } : { width: 24, height: 20 };
    this.sprite = scene.physics.add
      .sprite(0, 0, kind === 'basic' ? 'basic' : 'drone')
      .setCollideWorldBounds(true)
      .setBodySize(bodySize.width, bodySize.height)
      .setDepth(0);
    this.silhouette = scene.add.image(0, 0, 'enemy-silhouette').setDepth(1).setVisible(false);
    this.deactivate();
  }

  public get active(): boolean {
    return this.sprite.active;
  }

  public get hitStopEndsAt(): number {
    return this.hitStopUntil;
  }

  public get currentSpawnMetadata(): EnemyActorSpawnMetadata {
    return { ...this.spawnMetadata };
  }

  public reset(spawnReason: string): void {
    this.hitStopUntil = 0;
    this.knockbackUntil = 0;
    this.knockbackVelocity = { x: 0, y: 0 };
    this.spawnMetadata = { ...EMPTY_SPAWN_METADATA, spawnReason };
    this.deactivate();
  }

  public activate(x: number, y: number): void {
    this.sprite
      .enableBody(true, x, y, true, true)
      .setVelocity(0, 0)
      .clearTint();
  }

  public deactivate(): void {
    this.stop();
    this.sprite.disableBody(true, true);
    this.hideVisuals();
  }

  public deactivateDefeated(): void {
    this.stop();
    this.sprite.disableBody(true, false);
    this.hideVisuals();
  }

  public setSpawnMetadata(metadata: EnemyActorSpawnMetadata): void {
    this.spawnMetadata = { ...metadata };
  }

  public setSpawnReason(spawnReason: string): void {
    this.spawnMetadata = { ...this.spawnMetadata, spawnReason };
  }

  public startHitStop(now: number, duration: number): void {
    this.hitStopUntil = Math.max(this.hitStopUntil, now + duration);
    this.stop();
  }

  public startKnockback(velocity: EnemyActorVelocity, until: number): void {
    this.knockbackVelocity = { ...velocity };
    this.knockbackUntil = until;
  }

  public applyMovement(now: number, desiredVelocity: () => EnemyActorVelocity): void {
    if (!this.active)
      return;
    if (now < this.hitStopUntil) {
      this.stop();
      return;
    }
    if (now < this.knockbackUntil) {
      this.sprite.setVelocity(this.knockbackVelocity.x, this.knockbackVelocity.y);
      return;
    }
    const velocity = desiredVelocity();
    this.sprite.setVelocity(velocity.x, velocity.y);
  }

  public syncSilhouettePosition(): void {
    this.silhouette.setPosition(this.sprite.x, this.sprite.y);
  }

  public applyVisibility(visibility: EnemyVisibility): void {
    if (visibility === 'normal') {
      this.sprite.setVisible(true).setAlpha(1);
      this.silhouette.setVisible(false);
      return;
    }
    if (visibility === 'boundary') {
      this.sprite.setVisible(false);
      this.silhouette.setPosition(this.sprite.x, this.sprite.y).setAlpha(0.3).setVisible(true);
      return;
    }
    this.hideVisuals();
  }

  public showDefeatedHitStop(now: number): boolean {
    if (now >= this.hitStopUntil)
      return false;
    this.sprite.setVisible(true);
    this.silhouette.setVisible(false);
    return true;
  }

  public hideVisuals(): void {
    this.sprite.setVisible(false);
    this.silhouette.setVisible(false);
  }

  public stop(): void {
    this.sprite.setVelocity(0, 0);
  }

  public runtimeView(): EnemyActorRuntimeView {
    return {
      id: this.id,
      active: this.active,
      hitStopUntil: this.hitStopUntil,
      knockbackUntil: this.knockbackUntil,
      knockbackVelocity: { ...this.knockbackVelocity },
      visibility: this.currentVisibility(),
    };
  }

  public hudView(recycleCount: number): EnemyHudView {
    return {
      stableId: this.id,
      ...this.spawnMetadata,
      active: this.active,
      recycleCount,
      visibility: this.currentVisibility(),
      spriteTexture: this.sprite.texture.key,
      spriteAlpha: this.sprite.alpha,
      spriteVisible: this.sprite.visible,
      silhouetteTexture: this.silhouette.texture.key,
      silhouetteAlpha: this.silhouette.alpha,
      silhouetteVisible: this.silhouette.visible,
    };
  }

  private currentVisibility(): EnemyVisibility {
    if (this.sprite.visible)
      return 'normal';
    return this.silhouette.visible ? 'boundary' : 'hidden';
  }
}
