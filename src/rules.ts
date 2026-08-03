export type WeaponId = 'rifle' | 'shotgun';
export type EnemyKind = 'basic' | 'drone';
export type DamageType = 'smallCaliber' | 'scatter';
export type EnemyInstanceId = 'basic-1' | 'basic-2' | 'basic-3' | 'drone-1';

export const ENEMY_INSTANCE_IDS: EnemyInstanceId[] = ['basic-1', 'basic-2', 'basic-3', 'drone-1'];

export type WeaponDefinition = {
  label: string;
  damageType: DamageType;
  automatic: boolean;
  fireIntervalMs: number;
  magazineSize: number;
  reloadMs: number;
  pellets: number;
  damage: number;
  speed: number;
  range: number;
  spread: number;
  knockback: number;
};

export type EnemyState = {
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  defeated: boolean;
};

export type CombatState = {
  playerHp: number;
  defeated: boolean;
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  nextFireAt: Record<WeaponId, number>;
  reloading: WeaponId | null;
  enemies: Record<EnemyInstanceId, EnemyState>;
};

export type FireResult = {
  state: CombatState;
  fired: boolean;
};

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  rifle: {
    label: 'アサルトライフル',
    damageType: 'smallCaliber',
    automatic: true,
    fireIntervalMs: 150,
    magazineSize: 20,
    reloadMs: 1200,
    pellets: 1,
    damage: 2,
    speed: 600,
    range: 520,
    spread: 0,
    knockback: 0,
  },
  shotgun: {
    label: 'ショットガン',
    damageType: 'scatter',
    automatic: false,
    fireIntervalMs: 750,
    magazineSize: 4,
    reloadMs: 1600,
    pellets: 5,
    damage: 2,
    speed: 420,
    range: 220,
    spread: 0.2,
    knockback: 240,
  },
};

const DAMAGE_MULTIPLIERS: Record<EnemyKind, Record<DamageType, number>> = {
  basic: { smallCaliber: 1, scatter: 1 },
  drone: { smallCaliber: 0.5, scatter: 1 },
};

export function resolveDamage(
  kind: EnemyKind,
  damageType: DamageType,
  baseDamage: number,
): { amount: number; resisted: boolean } {
  const multiplier = DAMAGE_MULTIPLIERS[kind][damageType];
  return { amount: baseDamage * multiplier, resisted: multiplier < 1 };
}

export function droneLateralSpeedAt(now: number): number {
  return Math.sin(now / 95) * 85 + Math.sin(now / 37) * 35;
}

const INITIAL_ENEMIES: Record<EnemyInstanceId, EnemyState> = {
  'basic-1': { kind: 'basic', hp: 6, maxHp: 6, defeated: false },
  'basic-2': { kind: 'basic', hp: 6, maxHp: 6, defeated: false },
  'basic-3': { kind: 'basic', hp: 6, maxHp: 6, defeated: false },
  'drone-1': { kind: 'drone', hp: 4, maxHp: 4, defeated: false },
};

export const INITIAL_STATE: CombatState = {
  playerHp: 100,
  defeated: false,
  weapon: 'rifle',
  ammo: { rifle: WEAPONS.rifle.magazineSize, shotgun: WEAPONS.shotgun.magazineSize },
  nextFireAt: { rifle: 0, shotgun: 0 },
  reloading: null,
  enemies: INITIAL_ENEMIES,
};

function cloneEnemies(enemies: Record<EnemyInstanceId, EnemyState>): Record<EnemyInstanceId, EnemyState> {
  return {
    'basic-1': { ...enemies['basic-1'] },
    'basic-2': { ...enemies['basic-2'] },
    'basic-3': { ...enemies['basic-3'] },
    'drone-1': { ...enemies['drone-1'] },
  };
}

export function damagePlayer(state: CombatState, amount: number): CombatState {
  const playerHp = Math.max(0, state.playerHp - amount);
  return { ...state, playerHp, defeated: playerHp === 0 };
}

export function selectWeapon(state: CombatState, weapon: WeaponId): CombatState {
  return { ...state, weapon, reloading: weapon === state.weapon ? state.reloading : null };
}

export function canFireAt(state: CombatState, now: number): boolean {
  return !state.defeated
    && state.reloading === null
    && state.ammo[state.weapon] > 0
    && now >= state.nextFireAt[state.weapon];
}

export function fireWeapon(state: CombatState, now: number): FireResult {
  if (!canFireAt(state, now)) return { state, fired: false };
  const weapon = state.weapon;
  return {
    fired: true,
    state: {
      ...state,
      ammo: { ...state.ammo, [weapon]: state.ammo[weapon] - 1 },
      nextFireAt: { ...state.nextFireAt, [weapon]: now + WEAPONS[weapon].fireIntervalMs },
    },
  };
}

export function startReload(state: CombatState): CombatState {
  const weapon = state.weapon;
  if (state.defeated || state.reloading !== null || state.ammo[weapon] >= WEAPONS[weapon].magazineSize) return state;
  return { ...state, reloading: weapon };
}

export function cancelReload(state: CombatState): CombatState {
  return state.reloading === null ? state : { ...state, reloading: null };
}

export function completeReload(state: CombatState, weapon: WeaponId): CombatState {
  if (state.reloading !== weapon) return state;
  return {
    ...state,
    ammo: { ...state.ammo, [weapon]: WEAPONS[weapon].magazineSize },
    reloading: null,
  };
}

export function damageEnemy(state: CombatState, enemyId: EnemyInstanceId, amount: number): CombatState {
  const enemy = state.enemies[enemyId];
  const hp = Math.max(0, enemy.hp - amount);
  return {
    ...state,
    enemies: { ...state.enemies, [enemyId]: { ...enemy, hp, defeated: hp === 0 } },
  };
}

export function isEnemyDefeated(state: CombatState, enemyId: EnemyInstanceId): boolean {
  return state.enemies[enemyId].defeated;
}

export function respawnEnemy(state: CombatState, enemyId: EnemyInstanceId): CombatState {
  const enemy = state.enemies[enemyId];
  return {
    ...state,
    enemies: { ...state.enemies, [enemyId]: { ...enemy, hp: enemy.maxHp, defeated: false } },
  };
}

export function retryCombat(): CombatState {
  return {
    ...INITIAL_STATE,
    ammo: { ...INITIAL_STATE.ammo },
    nextFireAt: { ...INITIAL_STATE.nextFireAt },
    enemies: cloneEnemies(INITIAL_STATE.enemies),
  };
}
