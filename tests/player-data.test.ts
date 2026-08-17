import { describe, expect, test } from 'vitest';
import {
  PLAYER_ROLES,
  canDashAt,
  canFireWhileDashing,
  dashDirectionFor,
  gunslingerComboAfterEvent,
  gunslingerSpeedBuffUntil,
  gunslingerSpeedMultiplierAt,
  reloadDurationForWorldWeapon,
} from '../src/player-data';

describe('プレイヤー行動データ', () => {
  test('照準方向を正規化し、同位置の照準は回避方向を作らない', () => {
    expect(dashDirectionFor({ x: 10, y: 20 }, { x: 13, y: 24 })).toEqual({ x: 0.6, y: 0.8 });
    expect(dashDirectionFor({ x: 10, y: 20 }, { x: 10, y: 20 })).toBeUndefined();
  });

  test('任意のdeadline境界で回避の再使用可否を決める', () => {
    const deadline = 1_234;

    expect(canDashAt(deadline - 1, deadline)).toBe(false);
    expect(canDashAt(deadline, deadline)).toBe(true);
  });

  test('ガンスリンガーだけ回避中の発砲を許可する', () => {
    const nonGunslingerRoles = PLAYER_ROLES.filter(role => role.id !== 'gunslinger');

    expect(nonGunslingerRoles.map(role => canFireWhileDashing(role.id))).toEqual([false, false, false, false]);
    expect(canFireWhileDashing('gunslinger')).toBe(true);
  });

  test('ガンスリンガーのコンボと速度buffは状態遷移する', () => {
    const comboBeforeEvent = 3;
    expect(gunslingerComboAfterEvent(comboBeforeEvent)).toBeGreaterThan(comboBeforeEvent);

    const buffUntil = gunslingerSpeedBuffUntil(1_000);
    const activeMultiplier = gunslingerSpeedMultiplierAt(1_000, buffUntil);
    const expiredMultiplier = gunslingerSpeedMultiplierAt(buffUntil, buffUntil);
    expect(activeMultiplier).toBeGreaterThan(expiredMultiplier);
  });

  test('クォーターマスターのworld武器reloadは他roleより遅く、無効な時間は正へ正規化する', () => {
    const baseDuration = 1_003;
    const nonQuartermasterDurations = PLAYER_ROLES
      .filter(role => role.id !== 'quartermaster')
      .map(role => reloadDurationForWorldWeapon(baseDuration, role.id));
    const quartermasterDuration = reloadDurationForWorldWeapon(baseDuration, 'quartermaster');
    const invalidDurations = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]
      .map(duration => reloadDurationForWorldWeapon(duration, 'gunner'));

    expect(new Set(nonQuartermasterDurations).size).toBe(1);
    expect(quartermasterDuration).toBeGreaterThan(nonQuartermasterDurations[0] ?? 0);
    expect(invalidDurations.every(duration => Number.isSafeInteger(duration) && duration > 0)).toBe(true);
    expect(new Set(invalidDurations).size).toBe(1);
  });
});
