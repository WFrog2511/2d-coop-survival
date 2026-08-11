import { describe, expect, test } from 'vitest';
import { GUNSLINGER_BOOT_KNIFE_DAMAGE, GUNSLINGER_COMBO_PER_EVENT, GUNSLINGER_SPEED_BUFF_DURATION_MS, GUNSLINGER_SPEED_MULTIPLIER, PLAYER_ROLES, canDashAt, dashCooldownUntil, dashDirectionFor, gunslingerComboAfterEvent, gunslingerSpeedBuffUntil, gunslingerSpeedMultiplierAt } from '../src/player-data';

describe('プレイヤー行動データ', () => {
  test('照準方向を正規化し、同位置の照準は回避方向を作らない', () => {
    expect(dashDirectionFor({ x: 10, y: 20 }, { x: 13, y: 24 })).toEqual({ x: 0.6, y: 0.8 });
    expect(dashDirectionFor({ x: 10, y: 20 }, { x: 10, y: 20 })).toBeUndefined();
  });

  test('cooldown境界で再使用可否を決める', () => {
    const cooldownUntil = dashCooldownUntil(1_000);

    expect(cooldownUntil).toBe(2_000);
    expect(canDashAt(1_999, cooldownUntil)).toBe(false);
    expect(canDashAt(2_000, cooldownUntil)).toBe(true);
  });

  test('ガンスリンガーのコンボ加算と速度buff境界を調整定数から解決する', () => {
    expect(GUNSLINGER_BOOT_KNIFE_DAMAGE).toBe(2);
    expect(GUNSLINGER_COMBO_PER_EVENT).toBe(1);
    expect(GUNSLINGER_SPEED_MULTIPLIER).toBe(1.2);
    expect(GUNSLINGER_SPEED_BUFF_DURATION_MS).toBe(3_000);
    expect(gunslingerComboAfterEvent(0)).toBe(1);
    expect(gunslingerComboAfterEvent(4)).toBe(5);
    const buffUntil = gunslingerSpeedBuffUntil(1_000);
    expect(buffUntil).toBe(4_000);
    expect(gunslingerSpeedMultiplierAt(1_000, buffUntil)).toBe(1.2);
    expect(gunslingerSpeedMultiplierAt(3_999, buffUntil)).toBe(1.2);
    expect(gunslingerSpeedMultiplierAt(4_000, buffUntil)).toBe(1);
  });

  test('5役職は承認済みの表示色とPhaser用tintを使う', () => {
    expect(PLAYER_ROLES.map(role => ({ id: role.id, color: role.color, tint: role.tint }))).toEqual([
      { id: 'gunner', color: '青', tint: 0x55d6ff },
      { id: 'sniper', color: '紫', tint: 0xa88cff },
      { id: 'gunslinger', color: '赤', tint: 0xff7b7b },
      { id: 'bulwark', color: 'オレンジ', tint: 0xffb45f },
      { id: 'quartermaster', color: '緑', tint: 0x7dffb2 },
    ]);
  });
});
