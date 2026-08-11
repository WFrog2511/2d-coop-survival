export const PLAYER_DASH_DISTANCE_PX = 80;

export const GUNSLINGER_DASH_DISTANCE_PX = 120;

export const PLAYER_DASH_COOLDOWN_MS = 667;

export const GUNSLINGER_DASH_COOLDOWN_MS = 400;

export const PLAYER_DASH_DURATION_MS = 160;

export const PLAYER_DASH_SPEED_PX_PER_SECOND = PLAYER_DASH_DISTANCE_PX / (PLAYER_DASH_DURATION_MS / 1_000);

export const GUNSLINGER_BOOT_KNIFE_DAMAGE = 2;

export const GUNSLINGER_COMBO_PER_EVENT = 1;

export const GUNSLINGER_SPEED_MULTIPLIER = 1.2;

export const GUNSLINGER_SPEED_BUFF_DURATION_MS = 3_000;

export const GUNSLINGER_COMBO_TIMEOUT_MS = 3_000;

export type DashPoint = { x: number; y: number };

export type DashDirection = { x: number; y: number };

export function dashDirectionFor(origin: DashPoint, target: DashPoint): DashDirection | undefined {
  const x = target.x - origin.x;
  const y = target.y - origin.y;
  const length = Math.hypot(x, y);
  return Number.isFinite(length) && length >= 0.001
    ? { x: x / length, y: y / length }
    : undefined;
}

export function canDashAt(now: number, cooldownUntil: number): boolean {
  return now >= cooldownUntil;
}

export function gunslingerComboAfterEvent(combo: number): number {
  return combo + GUNSLINGER_COMBO_PER_EVENT;
}

export function gunslingerSpeedBuffUntil(now: number): number {
  return now + GUNSLINGER_SPEED_BUFF_DURATION_MS;
}

export function gunslingerSpeedMultiplierAt(now: number, speedBuffUntil: number): number {
  return now < speedBuffUntil ? GUNSLINGER_SPEED_MULTIPLIER : 1;
}

export const PLAYER_DASH_SOUND = {
  duration: 90,
  startFrequency: 220,
  endFrequency: 80,
  volume: 0.06,
  waveform: 'sawtooth' as const,
  noiseVolume: 0.025,
  noiseFrequency: 2200,
};

export const PLAYER_ROLES = [
  { id: 'gunner', label: 'ガンナー', color: '青', accent: '#55d6ff', tint: 0x55d6ff },
  { id: 'sniper', label: 'スナイパー', color: '紫', accent: '#a88cff', tint: 0xa88cff },
  { id: 'gunslinger', label: 'ガンスリンガー', color: '赤', accent: '#ff7b7b', tint: 0xff7b7b },
  { id: 'bulwark', label: 'ブルワーク', color: 'オレンジ', accent: '#ffb45f', tint: 0xffb45f },
  { id: 'quartermaster', label: 'クォーターマスター', color: '緑', accent: '#7dffb2', tint: 0x7dffb2 },
] as const;

export type PlayerRole = (typeof PLAYER_ROLES)[number];

export type PlayerRoleId = PlayerRole['id'];

export function dashCooldownUntil(now: number, roleId: PlayerRoleId): number {
  return now + (roleId === 'gunslinger' ? GUNSLINGER_DASH_COOLDOWN_MS : PLAYER_DASH_COOLDOWN_MS);
}

export function dashDistanceFor(roleId: PlayerRoleId): number {
  return roleId === 'gunslinger' ? GUNSLINGER_DASH_DISTANCE_PX : PLAYER_DASH_DISTANCE_PX;
}

export function dashSpeedFor(roleId: PlayerRoleId): number {
  return dashDistanceFor(roleId) / (PLAYER_DASH_DURATION_MS / 1_000);
}

export function canFireWhileDashing(roleId: PlayerRoleId): boolean {
  return roleId === 'gunslinger';
}
