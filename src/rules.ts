/** プレイヤーが選択できる武器の識別子。 */
export type WeaponId = 'rifle' | 'shotgun';

/** 戦闘中の敵の基本種別。 */
export type EnemyKind = 'basic' | 'drone';

/** 武器攻撃を倍率解決へ渡すダメージ種別。 */
export type DamageType = 'smallCaliber' | 'scatter';
export const ENEMY_INSTANCE_IDS = [
  'basic-1',
  'basic-2',
  'basic-3',
  'basic-4',
  'basic-5',
  'basic-6',
  'basic-7',
  'basic-8',
  'basic-9',
  'drone-1',
  'drone-2',
  'drone-3',
] as const;
/** 安定した敵枠を表す個別識別子。 */
export type EnemyInstanceId = (typeof ENEMY_INSTANCE_IDS)[number];
export const SURVIVAL_LIMIT_MS = 180000;
export const AMMO_BOX_RESPAWN_MS = 30000;

/** 発射、装弾、補給を決める武器の静的定義。 */
export type WeaponDefinition = {
  label: string;
  damageType: DamageType;
  automatic: boolean;
  fireIntervalMs: number;
  magazineSize: number;
  reserveInitial: number;
  reserveMax: number;
  ammoBoxRecovery: number;
  reloadMs: number;
  pellets: number;
  damage: number;
  speed: number;
  range: number;
  spread: number;
  knockback: number;
};

/** 一体の敵に保持する戦闘状態。 */
export type EnemyState = {
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  defeated: boolean;
};

/** プレイヤー、武器、敵をまとめた純粋な戦闘状態。 */
export type CombatState = {
  playerHp: number;
  defeated: boolean;
  victory: boolean;
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  reserve: Record<WeaponId, number>;
  nextFireAt: Record<WeaponId, number>;
  reloading: WeaponId | null;
  enemies: Record<EnemyInstanceId, EnemyState>;
};

/** 弾薬箱の取得可否と更新後の状態。 */
export type AmmoBoxResult = {
  state: CombatState;
  collected: boolean;
};

/** 発射可否と更新後の状態。 */
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
    reserveInitial: 40,
    reserveMax: 60,
    ammoBoxRecovery: 20,
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
    reserveInitial: 8,
    reserveMax: 12,
    ammoBoxRecovery: 4,
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
  drone: { smallCaliber: 1, scatter: 1 },
};

/**
 * 敵種別と攻撃種別に対応するダメージを解決する。
 *
 * @param kind ダメージを受ける敵種別。
 * @param damageType 攻撃に使われたダメージ種別。
 * @param baseDamage 倍率適用前の基本ダメージ量。
 * @returns 適用後のダメージ量と耐性判定。
 */
export function resolveDamage(
  kind: EnemyKind,
  damageType: DamageType,
  baseDamage: number,
): { amount: number; resisted: boolean } {
  const multiplier = DAMAGE_MULTIPLIERS[kind][damageType];
  return { amount: baseDamage * multiplier, resisted: multiplier < 1 };
}

/**
 * 指定時刻のドローン横移動速度を返す。
 *
 * @param now ゲーム開始後の現在時刻。
 * @returns 経過時刻から決まる横方向速度。
 */
export function droneLateralSpeedAt(now: number): number {
  return Math.sin(now / 95) * 85 + Math.sin(now / 37) * 35;
}

function createInitialEnemies(): Record<EnemyInstanceId, EnemyState> {
  return Object.fromEntries(ENEMY_INSTANCE_IDS.map((id) => {
    const kind = id.startsWith('basic-') ? 'basic' : 'drone';
    const hp = kind === 'basic' ? 4 : 2;
    return [id, { kind, hp, maxHp: hp, defeated: false }];
  })) as Record<EnemyInstanceId, EnemyState>;
}

const INITIAL_ENEMIES = createInitialEnemies();

export const INITIAL_STATE: CombatState = {
  playerHp: 100,
  defeated: false,
  victory: false,
  weapon: 'rifle',
  ammo: { rifle: WEAPONS.rifle.magazineSize, shotgun: WEAPONS.shotgun.magazineSize },
  reserve: { rifle: WEAPONS.rifle.reserveInitial, shotgun: WEAPONS.shotgun.reserveInitial },
  nextFireAt: { rifle: 0, shotgun: 0 },
  reloading: null,
  enemies: INITIAL_ENEMIES,
};

function cloneEnemies(enemies: Record<EnemyInstanceId, EnemyState>): Record<EnemyInstanceId, EnemyState> {
  return Object.fromEntries(ENEMY_INSTANCE_IDS.map(id => [id, { ...enemies[id] }])) as Record<EnemyInstanceId, EnemyState>;
}

/**
 * 生存制限までの残り時間を範囲内に丸めて返す。
 *
 * @param startedAt 生存計測を開始した時刻。
 * @param now 現在時刻。
 * @returns 0から生存制限までの残りミリ秒。
 */
export function remainingSurvivalMs(startedAt: number, now: number): number {
  return Math.min(SURVIVAL_LIMIT_MS, Math.max(0, startedAt + SURVIVAL_LIMIT_MS - now));
}

/**
 * 現在時刻が生存制限に到達したかを判定する。
 *
 * @param startedAt 生存計測を開始した時刻。
 * @param now 現在時刻。
 * @returns 生存制限に到達していれば真。
 */
export function hasReachedSurvivalLimit(startedAt: number, now: number): boolean {
  return now >= startedAt + SURVIVAL_LIMIT_MS;
}

/**
 * 生存制限到達時の勝利状態を反映する。
 *
 * @param state 現在の戦闘状態。
 * @param startedAt 生存計測を開始した時刻。
 * @param now 現在時刻。
 * @returns 勝利状態を反映した戦闘状態。
 */
export function advanceSurvivalState(state: CombatState, startedAt: number, now: number): CombatState {
  if (state.defeated || state.victory || !hasReachedSurvivalLimit(startedAt, now))
    return state;
  return { ...state, victory: true, reloading: null };
}

/**
 * プレイヤーへダメージを適用する。
 *
 * @param state 現在の戦闘状態。
 * @param amount 減算する体力量。
 * @returns 体力と敗北状態を反映した戦闘状態。
 */
export function damagePlayer(state: CombatState, amount: number): CombatState {
  if (state.defeated || state.victory)
    return state;
  const playerHp = Math.max(0, state.playerHp - amount);
  return { ...state, playerHp, defeated: playerHp === 0 };
}

/**
 * 使用武器を切り替える。
 *
 * @param state 現在の戦闘状態。
 * @param weapon 選択する武器。
 * @returns 武器選択と必要なリロード中断を反映した戦闘状態。
 */
export function selectWeapon(state: CombatState, weapon: WeaponId): CombatState {
  if (state.defeated || state.victory)
    return state;
  return { ...state, weapon, reloading: weapon === state.weapon ? state.reloading : null };
}

/**
 * 指定時刻に現在の武器を発射できるかを判定する。
 *
 * @param state 現在の戦闘状態。
 * @param now 現在時刻。
 * @returns 発射可能なら真。
 */
export function canFireAt(state: CombatState, now: number): boolean {
  return !state.defeated
    && !state.victory
    && state.reloading === null
    && state.ammo[state.weapon] > 0
    && now >= state.nextFireAt[state.weapon];
}

/**
 * 発射可能な場合に弾数と次回発射時刻を更新する。
 *
 * @param state 現在の戦闘状態。
 * @param now 現在時刻。
 * @returns 発射可否と更新後の戦闘状態。
 */
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

/**
 * 現在の武器のリロードを開始する。
 *
 * @param state 現在の戦闘状態。
 * @returns 開始可能な場合にリロード中を反映した戦闘状態。
 */
export function startReload(state: CombatState): CombatState {
  const weapon = state.weapon;
  if (
    state.defeated
    || state.victory
    || state.reloading !== null
    || state.ammo[weapon] >= WEAPONS[weapon].magazineSize
    || state.reserve[weapon] <= 0
  ) return state;
  return { ...state, reloading: weapon };
}

/**
 * 進行中のリロードを取り消す。
 *
 * @param state 現在の戦闘状態。
 * @returns リロードを停止した戦闘状態。
 */
export function cancelReload(state: CombatState): CombatState {
  return state.reloading === null ? state : { ...state, reloading: null };
}

/**
 * 指定武器のリロードを完了して予備弾薬を移す。
 *
 * @param state 現在の戦闘状態。
 * @param weapon 完了対象の武器。
 * @returns 装填済み弾薬と予備弾薬を更新した戦闘状態。
 */
export function completeReload(state: CombatState, weapon: WeaponId): CombatState {
  if (state.defeated || state.victory || state.reloading !== weapon) return state;
  const magazine = state.ammo[weapon];
  const amount = Math.min(
    WEAPONS[weapon].magazineSize - magazine,
    state.reserve[weapon],
  );
  return {
    ...state,
    ammo: { ...state.ammo, [weapon]: magazine + amount },
    reserve: { ...state.reserve, [weapon]: state.reserve[weapon] - amount },
    reloading: null,
  };
}

/**
 * 弾薬箱から各武器の予備弾薬を補給する。
 *
 * @param state 現在の戦闘状態。
 * @returns 補給可否と更新後の戦闘状態。
 */
export function collectAmmoBox(state: CombatState): AmmoBoxResult {
  if (state.defeated || state.victory)
    return { state, collected: false };
  const reserve = { ...state.reserve };
  let collected = false;
  (Object.keys(WEAPONS) as WeaponId[]).forEach((weapon) => {
    const amount = Math.min(
      WEAPONS[weapon].ammoBoxRecovery,
      WEAPONS[weapon].reserveMax - reserve[weapon],
    );
    if (amount > 0) {
      reserve[weapon] += amount;
      collected = true;
    }
  });
  return collected ? { state: { ...state, reserve }, collected } : { state, collected };
}

/**
 * 指定した敵へダメージを適用する。
 *
 * @param state 現在の戦闘状態。
 * @param enemyId ダメージを受ける敵枠。
 * @param amount 減算する敵体力量。
 * @returns 敵体力と撃破状態を反映した戦闘状態。
 */
export function damageEnemy(state: CombatState, enemyId: EnemyInstanceId, amount: number): CombatState {
  if (state.defeated || state.victory)
    return state;
  const enemy = state.enemies[enemyId];
  const hp = Math.max(0, enemy.hp - amount);
  return {
    ...state,
    enemies: { ...state.enemies, [enemyId]: { ...enemy, hp, defeated: hp === 0 } },
  };
}

/**
 * 指定した敵が撃破済みかを返す。
 *
 * @param state 現在の戦闘状態。
 * @param enemyId 判定する敵枠。
 * @returns 敵が撃破済みなら真。
 */
export function isEnemyDefeated(state: CombatState, enemyId: EnemyInstanceId): boolean {
  return state.enemies[enemyId].defeated;
}

/**
 * 指定した敵を最大体力で再出現状態へ戻す。
 *
 * @param state 現在の戦闘状態。
 * @param enemyId 再出現させる敵枠。
 * @returns 再出現後の戦闘状態。
 */
export function respawnEnemy(state: CombatState, enemyId: EnemyInstanceId): CombatState {
  if (state.defeated || state.victory)
    return state;
  const enemy = state.enemies[enemyId];
  return {
    ...state,
    enemies: { ...state.enemies, [enemyId]: { ...enemy, hp: enemy.maxHp, defeated: false } },
  };
}

/**
 * 初期値から独立した再挑戦用の戦闘状態を作る。
 *
 * @returns 可変部分を複製した初期戦闘状態。
 */
export function retryCombat(): CombatState {
  return {
    ...INITIAL_STATE,
    ammo: { ...INITIAL_STATE.ammo },
    reserve: { ...INITIAL_STATE.reserve },
    nextFireAt: { ...INITIAL_STATE.nextFireAt },
    enemies: cloneEnemies(INITIAL_STATE.enemies),
  };
}
