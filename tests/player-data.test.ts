import { describe, expect, test } from 'vitest';
import { PLAYER_ROLES, canDashAt, dashCooldownUntil, dashDirectionFor } from '../src/player-data';

describe('プレイヤー行動データ', () => {
  test('照準方向を正規化し、同位置の照準は回避方向を作らない', () => {
    expect(dashDirectionFor({ x: 10, y: 20 }, { x: 13, y: 24 })).toEqual({ x: 0.6, y: 0.8 });
    expect(dashDirectionFor({ x: 10, y: 20 }, { x: 10, y: 20 })).toBeUndefined();
  });

  test('cooldown境界で再使用可否を決める', () => {
    const cooldownUntil = dashCooldownUntil(1_000);

    expect(cooldownUntil).toBe(3_000);
    expect(canDashAt(2_999, cooldownUntil)).toBe(false);
    expect(canDashAt(3_000, cooldownUntil)).toBe(true);
  });

  test('5役職は承認済みの表示色を使う', () => {
    expect(PLAYER_ROLES.map(role => ({ id: role.id, color: role.color }))).toEqual([
      { id: 'gunner', color: '青' },
      { id: 'sniper', color: '紫' },
      { id: 'gunslinger', color: '赤' },
      { id: 'bulwark', color: 'オレンジ' },
      { id: 'quartermaster', color: '緑' },
    ]);
  });
});
