import { describe, expect, it } from 'vitest';
import {
  INITIAL_STATE,
  WEAPONS,
  damageEnemy,
  damagePlayer,
  isEnemyDefeated,
  respawnEnemy,
  retryCombat,
  selectWeapon,
} from '../src/rules';

describe('戦闘ルール', () => {
  it('武器をショットガンへ切り替える', () => {
    expect(selectWeapon(INITIAL_STATE, 'shotgun').weapon).toBe('shotgun');
  });

  it('ライフルとショットガンの戦術差分を定義する', () => {
    expect(WEAPONS.rifle).toMatchObject({ pellets: 1, knockback: 0 });
    expect(WEAPONS.shotgun).toMatchObject({ pellets: 5 });
    expect(WEAPONS.shotgun.spread).toBeGreaterThan(0);
    expect(WEAPONS.shotgun.knockback).toBeGreaterThan(0);
    expect(WEAPONS.shotgun.range).toBeLessThan(WEAPONS.rifle.range);
  });

  it('プレイヤーへの部分ダメージでは敗北せずHPだけ減る', () => {
    expect(damagePlayer(INITIAL_STATE, 20)).toMatchObject({
      playerHp: 80,
      defeated: false,
    });
  });

  it('個体別ダメージは対象だけを減らす', () => {
    const state = damageEnemy(INITIAL_STATE, 'drone', 1);
    expect(state.enemies.drone).toMatchObject({ hp: 1, defeated: false });
    expect(state.enemies.basic.hp).toBe(3);
  });

  it('敵HPは0へclampして撃破する', () => {
    const state = damageEnemy(INITIAL_STATE, 'basic', 9);
    expect(state.enemies.basic).toMatchObject({ hp: 0, defeated: true });
    expect(isEnemyDefeated(state, 'basic')).toBe(true);
  });

  it('敵の再出現は対象だけを最大HPへ戻す', () => {
    const state = respawnEnemy(damageEnemy(INITIAL_STATE, 'drone', 9), 'drone');
    expect(state.enemies.drone).toMatchObject({ hp: 2, defeated: false });
    expect(state.enemies.basic.hp).toBe(3);
  });

  it('プレイヤーは0で敗北し、再挑戦は独立した初期状態を返す', () => {
    expect(damagePlayer(INITIAL_STATE, 120)).toMatchObject({ playerHp: 0, defeated: true });
    expect(retryCombat()).toEqual(INITIAL_STATE);
    expect(retryCombat().enemies).not.toBe(INITIAL_STATE.enemies);
  });
});
