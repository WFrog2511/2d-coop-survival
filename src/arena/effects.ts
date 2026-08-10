import Phaser from 'phaser';
import {
  CAMERA_SHAKE_COOLDOWN_MS,
  ENEMY_DEFEAT_SHAKE,
  ENEMY_DEFEAT_SOUND,
  ENEMY_HIT_EFFECT,
  FIRE_SOUND,
  MUZZLE_FLASH,
  PLAYER_HIT_SHAKE,
  PLAYER_HIT_VIGNETTE,
  SHOTGUN_SHAKE,
  WEAPON_FIRE_SHAKE,
  type CameraShakeProfile,
  type SoundEffectProfile,
} from '../game-data';
import { PLAYER_DASH_SOUND } from '../player-data';
import type { EnemyKind, WeaponId } from '../rules';

export class ArenaEffects {
  private shakeCooldownUntil = 0;
  private shakeIntensity = 0;
  private flashes = new Map<Phaser.Physics.Arcade.Sprite, Phaser.Time.TimerEvent>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly playerHitVignette: HTMLElement,
    private readonly playerRoleTint: number,
  ) {}

  public reset(): void {
    this.stop();
    this.shakeCooldownUntil = 0;
    this.shakeIntensity = 0;
    this.scene.cameras.main.resetFX();
    this.playerHitVignette.classList.remove('is-active');
  }

  public stop(): void {
    this.flashes.forEach(timer => timer.remove(false));
    this.flashes.clear();
  }

  public playWeaponFire(
    player: Phaser.Physics.Arcade.Sprite,
    weapon: WeaponId,
    angle: number,
  ): void {
    this.shakeCamera(WEAPON_FIRE_SHAKE[weapon]);
    this.playSoundEffect(FIRE_SOUND[weapon]);
    this.playMuzzleFlash(player, weapon, angle);
  }

  public playEnemyImpact(
    enemy: Phaser.Physics.Arcade.Sprite,
    kind: EnemyKind,
    weapon: WeaponId,
    defeated: boolean,
  ): void {
    this.playEnemyHitEffect(enemy, kind);
    if (defeated) {
      this.shakeCamera(ENEMY_DEFEAT_SHAKE[kind]);
      this.playSoundEffect(ENEMY_DEFEAT_SOUND[kind]);
    } else if (weapon === 'shotgun') {
      this.shakeCamera(SHOTGUN_SHAKE);
    }
  }

  public flashEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    enemy.setTint(16777215);
    this.flashes.get(enemy)?.remove(false);
    this.flashes.set(enemy, this.scene.time.delayedCall(90, () => {
      enemy.clearTint();
      this.flashes.delete(enemy);
    }));
  }

  public playPlayerImpact(kind: EnemyKind): void {
    this.shakeCamera(PLAYER_HIT_SHAKE[kind]);
    this.playPlayerHitVignette(kind);
  }

  public playPlayerDash(): void {
    this.playSoundEffect(PLAYER_DASH_SOUND);
  }

  private playSoundEffect(effect: SoundEffectProfile): void {
    if (!(this.scene.sound instanceof Phaser.Sound.WebAudioSoundManager))
      return;
    try {
      const manager = this.scene.sound;
      const context = manager.context;
      if (context.state === 'suspended')
        context.resume().catch(() => undefined);
      const now = context.currentTime;
      const endAt = now + effect.duration / 1000;
      const gain = context.createGain();
      gain.gain.setValueAtTime(effect.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      gain.connect(manager.destination);
      const oscillator = context.createOscillator();
      oscillator.type = effect.waveform;
      oscillator.frequency.setValueAtTime(effect.startFrequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(effect.endFrequency, endAt);
      oscillator.connect(gain);
      oscillator.start(now);
      oscillator.stop(endAt);
      if (effect.noiseVolume === 0)
        return;
      const noise = context.createBufferSource();
      const noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * effect.duration / 1000), context.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1)
        samples[index] = Math.random() * 2 - 1;
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(effect.noiseFrequency, now);
      const noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(effect.noiseVolume, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      noise.buffer = noiseBuffer;
      noise.connect(noiseFilter).connect(noiseGain).connect(manager.destination);
      noise.start(now);
      noise.stop(endAt);
    } catch {
      return;
    }
  }

  private playMuzzleFlash(
    player: Phaser.Physics.Arcade.Sprite,
    weapon: WeaponId,
    angle: number,
  ): void {
    const flash = MUZZLE_FLASH[weapon];
    const distance = player.displayWidth / 2 + flash.outerRadius;
    const muzzle = this.scene.add.star(
      player.x + Math.cos(angle) * distance,
      player.y + Math.sin(angle) * distance,
      flash.points,
      flash.innerRadius,
      flash.outerRadius,
      flash.color,
      0.9,
    ).setRotation(angle + Math.PI / 2).setDepth(4);
    this.scene.tweens.add({
      targets: muzzle,
      scale: flash.scale,
      alpha: 0,
      duration: flash.duration,
      ease: 'Quad.Out',
      onComplete: () => muzzle.destroy(),
    });
  }

  private playEnemyHitEffect(enemy: Phaser.Physics.Arcade.Sprite, kind: EnemyKind): void {
    const effect = ENEMY_HIT_EFFECT[kind];
    const hit = effect.shape === 'circle'
      ? this.scene.add.circle(enemy.x, enemy.y, effect.radius, this.playerRoleTint, 0.25)
      : this.scene.add.star(enemy.x, enemy.y, effect.points, effect.innerRadius, effect.outerRadius, this.playerRoleTint, 0.25);
    hit
      .setStrokeStyle(2, this.playerRoleTint, 0.9)
      .setDepth(4);
    this.scene.tweens.add({
      targets: hit,
      scaleX: effect.scale,
      scaleY: effect.scale,
      alpha: 0,
      duration: effect.duration,
      ease: 'Quad.Out',
      onComplete: () => hit.destroy(),
    });
  }

  private playPlayerHitVignette(kind: EnemyKind): void {
    const vignette = PLAYER_HIT_VIGNETTE[kind];
    this.playerHitVignette.style.setProperty('--player-hit-vignette-duration', `${vignette.duration}ms`);
    this.playerHitVignette.style.setProperty('--player-hit-vignette-opacity', String(vignette.opacity));
    this.playerHitVignette.classList.remove('is-active');
    this.playerHitVignette.getBoundingClientRect();
    this.playerHitVignette.classList.add('is-active');
  }

  private shakeCamera(effect: CameraShakeProfile): void {
    const force = effect.intensity > this.shakeIntensity || this.scene.time.now < this.shakeCooldownUntil;
    if (force && effect.intensity <= this.shakeIntensity)
      return;
    if (!force)
      this.shakeIntensity = 0;
    this.shakeCooldownUntil = this.scene.time.now + CAMERA_SHAKE_COOLDOWN_MS;
    this.shakeIntensity = effect.intensity;
    this.scene.cameras.main.shake(effect.duration, effect.intensity, force);
  }
}
