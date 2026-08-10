import { describe, expect, test } from 'vitest';
import { PLAYER_ROLES, canDashAt, dashCooldownUntil, dashDirectionFor } from '../src/player-data';

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
