import { describe, expect, it } from 'vitest';
import {
  INITIAL_STATE,
  damageEnemy,
  damagePlayer,
  isEnemyDefeated,
  retryCombat,
} from '../src/rules';

describe('戦闘ルール', () => {
  it('部分ダメージでは敗北しない', () => {
    expect(damagePlayer(INITIAL_STATE, 20)).toEqual({
      playerHp: 80,
      enemyHp: 3,
      defeated: false,
    });
  });

  it('過剰ダメージは0へclampして敗北する', () => {
    expect(damagePlayer(INITIAL_STATE, 120)).toEqual({
      playerHp: 0,
      enemyHp: 3,
      defeated: true,
    });
  });

  it('敵への過剰ダメージは0へclampして撃破になる', () => {
    const state = damageEnemy(INITIAL_STATE, 9);

    expect(state.enemyHp).toBe(0);
    expect(isEnemyDefeated(state)).toBe(true);
  });

  it('再挑戦は初期状態を新しい値として返す', () => {
    const retry = retryCombat();

    expect(retry).toEqual(INITIAL_STATE);
    expect(retry).not.toBe(INITIAL_STATE);
  });
});
