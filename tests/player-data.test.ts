import { describe, expect, test } from 'vitest';
import { PLAYER_ROLES, canDashAt, canFireWhileDashing, dashDirectionFor, gunslingerComboAfterEvent, gunslingerSpeedBuffUntil, gunslingerSpeedMultiplierAt } from '../src/player-data';

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
});
