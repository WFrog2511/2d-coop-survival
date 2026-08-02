export type WeaponId = 'rifle' | 'shotgun';
export type EnemyId = 'basic' | 'drone';

export type WeaponDefinition = {
  label: string;
  pellets: number;
  damage: number;
  speed: number;
  range: number;
  spread: number;
  knockback: number;
};

export type EnemyState = {
  hp: number;
  maxHp: number;
  defeated: boolean;
};

export type CombatState = {
  playerHp: number;
  defeated: boolean;
  weapon: WeaponId;
  enemies: Record<EnemyId, EnemyState>;
};

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  rifle: { label: 'アサルトライフル', pellets: 1, damage: 1, speed: 600, range: 520, spread: 0, knockback: 0 },
  shotgun: { label: 'ショットガン', pellets: 5, damage: 1, speed: 420, range: 220, spread: 0.2, knockback: 240 },
};

export const INITIAL_STATE: CombatState = {
  playerHp: 100,
  defeated: false,
  weapon: 'rifle',
  enemies: {
    basic: { hp: 3, maxHp: 3, defeated: false },
    drone: { hp: 2, maxHp: 2, defeated: false },
  },
};

function cloneEnemies(enemies: Record<EnemyId, EnemyState>): Record<EnemyId, EnemyState> {
  return { basic: { ...enemies.basic }, drone: { ...enemies.drone } };
}

export function damagePlayer(state: CombatState, amount: number): CombatState {
  const playerHp = Math.max(0, state.playerHp - amount);
  return { ...state, playerHp, defeated: playerHp === 0 };
}

export function selectWeapon(state: CombatState, weapon: WeaponId): CombatState {
  return { ...state, weapon };
}

export function damageEnemy(state: CombatState, enemyId: EnemyId, amount: number): CombatState {
  const enemy = state.enemies[enemyId];
  const hp = Math.max(0, enemy.hp - amount);
  return {
    ...state,
    enemies: { ...cloneEnemies(state.enemies), [enemyId]: { ...enemy, hp, defeated: hp === 0 } },
  };
}

export function isEnemyDefeated(state: CombatState, enemyId: EnemyId): boolean {
  return state.enemies[enemyId].defeated;
}

export function respawnEnemy(state: CombatState, enemyId: EnemyId): CombatState {
  const enemy = state.enemies[enemyId];
  return {
    ...state,
    enemies: { ...cloneEnemies(state.enemies), [enemyId]: { ...enemy, hp: enemy.maxHp, defeated: false } },
  };
}

export function retryCombat(): CombatState {
  return { ...INITIAL_STATE, enemies: cloneEnemies(INITIAL_STATE.enemies) };
}
