export type CombatState = {
  playerHp: number;
  enemyHp: number;
  defeated: boolean;
};

export const INITIAL_STATE: CombatState = {
  playerHp: 100,
  enemyHp: 3,
  defeated: false,
};

export function damagePlayer(state: CombatState, amount: number): CombatState {
  const playerHp = Math.max(0, state.playerHp - amount);
  return {
    ...state,
    playerHp,
    defeated: playerHp === 0,
  };
}

export function damageEnemy(state: CombatState, amount: number): CombatState {
  return {
    ...state,
    enemyHp: Math.max(0, state.enemyHp - amount),
  };
}

export function isEnemyDefeated(state: CombatState): boolean {
  return state.enemyHp === 0;
}

export function retryCombat(): CombatState {
  return { ...INITIAL_STATE };
}
