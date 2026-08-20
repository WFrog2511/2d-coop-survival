import type { SoundEffectProfile } from './game-data';
import type { AcousticPropagationCosts } from './runtime-acoustic-graph';
import type { WeaponModel } from './rules';

/** 一つのplayer行動が発生させる論理音波と実音の試遊用設定。 */
export type SoundActionProfile = Readonly<{
  strength: number;
  costTravelMs: number;
  tileTravelMs: number;
  trailMs: number;
  worldColor: number;
  minimapColor: string;
  worldAlpha: number;
  minimapAlpha: number;
  audio: SoundEffectProfile;
}>;

/** 連射時に同時表示する音波の上限。 */
export const MAX_ACTIVE_SOUND_WAVES = 6;

/** area graphのnodeを渡る論理strength消費を試遊用にまとめる。 */
export const ACOUSTIC_PROPAGATION_COSTS: AcousticPropagationCosts = {
  edgeCrossingCost: 0.8,
  nodeCosts: {
    area: { baseCost: 1.2, perTileCost: 0.10 },
    junction: { baseCost: 0.8, perTileCost: 0.18 },
    corridor: { baseCost: 0.7, perTileCost: 0.34 },
  },
};

/** 通常移動の音を連続発生させないための最小間隔。 */
export const PLAYER_MOVEMENT_SOUND_INTERVAL_MS = 350;

/** 通常移動の小さな論理音波と実音をまとめる。 */
export const PLAYER_MOVEMENT_SOUND: SoundActionProfile = {
  strength: 6,
  costTravelMs: 46,
  tileTravelMs: 58,
  trailMs: 160,
  worldColor: 0x95d9b5,
  minimapColor: '#95d9b5',
  worldAlpha: 0.18,
  minimapAlpha: 0.45,
  audio: { duration: 42, startFrequency: 160, endFrequency: 110, volume: 0.025, waveform: 'triangle', noiseVolume: 0.004, noiseFrequency: 900 },
};

/** 回避の論理音波と既存の実音をまとめる。 */
export const PLAYER_DASH_SOUND: SoundActionProfile = {
  strength: 14,
  costTravelMs: 32,
  tileTravelMs: 32,
  trailMs: 220,
  worldColor: 0x83dcff,
  minimapColor: '#83dcff',
  worldAlpha: 0.26,
  minimapAlpha: 0.62,
  audio: { duration: 90, startFrequency: 220, endFrequency: 80, volume: 0.06, waveform: 'sawtooth', noiseVolume: 0.025, noiseFrequency: 2200 },
};

/** world上の物資を回収した時の論理音波と実音をまとめる。 */
export const PLAYER_PICKUP_SOUND: SoundActionProfile = {
  strength: 8,
  costTravelMs: 44,
  tileTravelMs: 52,
  trailMs: 180,
  worldColor: 0xffe28c,
  minimapColor: '#ffe28c',
  worldAlpha: 0.22,
  minimapAlpha: 0.56,
  audio: { duration: 64, startFrequency: 440, endFrequency: 720, volume: 0.045, waveform: 'sine', noiseVolume: 0, noiseFrequency: 1400 },
};

/** 武器ごとの論理音波と実音を試遊用にまとめる。 */
export const WEAPON_SOUND_WAVES: Record<WeaponModel, SoundActionProfile> = {
  'rifle': {
    strength: 22, costTravelMs: 30, tileTravelMs: 34, trailMs: 250,
    worldColor: 0x70ddff, minimapColor: '#70ddff', worldAlpha: 0.32, minimapAlpha: 0.68,
    audio: { duration: 65, startFrequency: 360, endFrequency: 120, volume: 0.08, waveform: 'sawtooth', noiseVolume: 0.035, noiseFrequency: 3000 },
  },
  'shotgun': {
    strength: 28, costTravelMs: 24, tileTravelMs: 27, trailMs: 320,
    worldColor: 0xffc66d, minimapColor: '#ffc66d', worldAlpha: 0.38, minimapAlpha: 0.74,
    audio: { duration: 95, startFrequency: 190, endFrequency: 70, volume: 0.13, waveform: 'square', noiseVolume: 0.08, noiseFrequency: 1800 },
  },
  'handgun': {
    strength: 16, costTravelMs: 38, tileTravelMs: 42, trailMs: 220,
    worldColor: 0x9de9ff, minimapColor: '#9de9ff', worldAlpha: 0.28, minimapAlpha: 0.62,
    audio: { duration: 65, startFrequency: 360, endFrequency: 120, volume: 0.08, waveform: 'sawtooth', noiseVolume: 0.035, noiseFrequency: 3000 },
  },
  'revolver': {
    strength: 20, costTravelMs: 32, tileTravelMs: 36, trailMs: 260,
    worldColor: 0xffb476, minimapColor: '#ffb476', worldAlpha: 0.34, minimapAlpha: 0.70,
    audio: { duration: 80, startFrequency: 260, endFrequency: 90, volume: 0.1, waveform: 'square', noiseVolume: 0.045, noiseFrequency: 2400 },
  },
  'compact-pistol': {
    strength: 14, costTravelMs: 40, tileTravelMs: 44, trailMs: 210,
    worldColor: 0xc8b5ff, minimapColor: '#c8b5ff', worldAlpha: 0.27, minimapAlpha: 0.60,
    audio: { duration: 55, startFrequency: 420, endFrequency: 130, volume: 0.07, waveform: 'sawtooth', noiseVolume: 0.03, noiseFrequency: 3300 },
  },
  'repeating-crossbow': {
    strength: 13, costTravelMs: 44, tileTravelMs: 48, trailMs: 240,
    worldColor: 0xd8a8ff, minimapColor: '#d8a8ff', worldAlpha: 0.30, minimapAlpha: 0.66,
    audio: { duration: 75, startFrequency: 520, endFrequency: 180, volume: 0.065, waveform: 'triangle', noiseVolume: 0.01, noiseFrequency: 1700 },
  },
  'flamethrower': {
    strength: 11, costTravelMs: 34, tileTravelMs: 38, trailMs: 180,
    worldColor: 0xff9b62, minimapColor: '#ff9b62', worldAlpha: 0.30, minimapAlpha: 0.64,
    audio: { duration: 55, startFrequency: 140, endFrequency: 90, volume: 0.055, waveform: 'sawtooth', noiseVolume: 0.05, noiseFrequency: 900 },
  },
};
