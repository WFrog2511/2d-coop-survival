import {
  ENEMY_INSTANCE_IDS,
  type EnemyInstanceId,
  type EnemyKind,
  type WeaponId,
} from './rules';

export type EnemyConfig = {
  kind: EnemyKind;
  speed: number;
  damage: number;
  cooldown: number;
};

export type CameraShakeProfile = { duration: number; intensity: number };

export type PlayerHitVignetteProfile = { duration: number; opacity: number };

export type SoundEffectProfile = {
  duration: number;
  startFrequency: number;
  endFrequency: number;
  volume: number;
  waveform: OscillatorType;
  noiseVolume: number;
  noiseFrequency: number;
};

export type MuzzleFlashProfile = {
  duration: number;
  points: number;
  innerRadius: number;
  outerRadius: number;
  scale: number;
  color: number;
};

export type EnemyHitEffectProfile
  = { shape: 'circle'; duration: number; radius: number; scale: number }
    | { shape: 'star'; duration: number; points: number; innerRadius: number; outerRadius: number; scale: number };

export type StaggeredEnemy = { id: EnemyInstanceId; delay: number };

export const ENEMY_IDS = ENEMY_INSTANCE_IDS;

export const ENEMIES: Record<EnemyInstanceId, EnemyConfig> = Object.fromEntries(
  ENEMY_IDS.map(id => [
    id,
    id.startsWith('basic-')
      ? { kind: 'basic', speed: 68, damage: 8, cooldown: 1500 }
      : { kind: 'drone', speed: 150, damage: 6, cooldown: 1200 },
  ]),
) as Record<EnemyInstanceId, EnemyConfig>;

export const ENEMY_LABELS: Record<EnemyInstanceId, string> = Object.fromEntries(
  ENEMY_IDS.map((id) => {
    const number = id.split('-')[1];
    return [id, id.startsWith('basic-') ? `基本敵 #${number}` : `高速ドローン #${number}`];
  }),
) as Record<EnemyInstanceId, string>;

export const DIRECTION_LABELS = {
  up: '上',
  right: '右',
  down: '下',
  left: '左',
} as const;

export const INITIAL_ENEMY_IDS: readonly EnemyInstanceId[] = [
  'basic-1',
  'basic-2',
  'basic-3',
  'basic-4',
  'basic-5',
  'basic-6',
  'drone-1',
  'drone-2',
];

export const STAGGERED_ENEMIES: readonly StaggeredEnemy[] = [
  { id: 'basic-7', delay: 3000 },
  { id: 'basic-8', delay: 6000 },
  { id: 'basic-9', delay: 9000 },
  { id: 'drone-3', delay: 12000 },
];

export const ENEMY_SPAWN_ORDER: readonly EnemyInstanceId[] = [
  ...INITIAL_ENEMY_IDS,
  ...STAGGERED_ENEMIES.map(({ id }) => id),
];

export const ENEMY_HIT_STOP_MS: Record<WeaponId, number> = { rifle: 12, shotgun: 35 };

export const ENEMY_DEFEAT_HIT_STOP_MS: Record<WeaponId, number> = { rifle: 24, shotgun: 42 };

export const PLAYER_HIT_STOP_MS: Record<EnemyKind, number> = { basic: 30, drone: 45 };

export const SCRAP_DROP_AMOUNTS: Record<EnemyKind, number> = { basic: 1, drone: 1 };

export const CAMERA_SHAKE_COOLDOWN_MS = 70;

export const SHOTGUN_SHAKE: CameraShakeProfile = { duration: 70, intensity: 0.0016 };

export const WEAPON_FIRE_SHAKE: Record<WeaponId, CameraShakeProfile> = {
  rifle: { duration: 95, intensity: 0.0024 },
  shotgun: { duration: 95, intensity: 0.0050 },
};

export const FIRE_SOUND: Record<WeaponId, SoundEffectProfile> = {
  rifle: { duration: 65, startFrequency: 360, endFrequency: 120, volume: 0.08, waveform: 'sawtooth', noiseVolume: 0.035, noiseFrequency: 3000 },
  shotgun: { duration: 95, startFrequency: 190, endFrequency: 70, volume: 0.13, waveform: 'square', noiseVolume: 0.08, noiseFrequency: 1800 },
};

export const ENEMY_DEFEAT_SOUND: Record<EnemyKind, SoundEffectProfile> = {
  basic: { duration: 180, startFrequency: 300, endFrequency: 90, volume: 0.1, waveform: 'triangle', noiseVolume: 0, noiseFrequency: 1600 },
  drone: { duration: 220, startFrequency: 500, endFrequency: 110, volume: 0.12, waveform: 'sawtooth', noiseVolume: 0.015, noiseFrequency: 2400 },
};

export const MUZZLE_FLASH: Record<WeaponId, MuzzleFlashProfile> = {
  rifle: { duration: 55, points: 8, innerRadius: 5, outerRadius: 16, scale: 1.35, color: 0x9de9ff },
  shotgun: { duration: 85, points: 10, innerRadius: 7, outerRadius: 25, scale: 1.6, color: 0xffdd76 },
};

export const ENEMY_HIT_EFFECT: Record<EnemyKind, EnemyHitEffectProfile> = {
  basic: { shape: 'circle', duration: 85, radius: 12, scale: 1.8 },
  drone: { shape: 'star', duration: 110, points: 6, innerRadius: 8, outerRadius: 17, scale: 2.1 },
};

export const ENEMY_DEFEAT_SHAKE: Record<EnemyKind, CameraShakeProfile> = {
  basic: { duration: 190, intensity: 0.0064 },
  drone: { duration: 190, intensity: 0.0096 },
};

export const PLAYER_HIT_SHAKE: Record<EnemyKind, CameraShakeProfile> = {
  basic: { duration: 55, intensity: 0.0008 },
  drone: { duration: 120, intensity: 0.0032 },
};

export const PLAYER_HIT_VIGNETTE: Record<EnemyKind, PlayerHitVignetteProfile> = {
  basic: { duration: 180, opacity: 0.42 },
  drone: { duration: 240, opacity: 0.58 },
};
