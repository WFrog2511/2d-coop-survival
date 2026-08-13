/** プレイヤーが選択できる武器の識別子。 */
export type WeaponId = 'rifle' | 'shotgun' | 'handgun';

/** 予備弾薬表示で使う弾薬種の識別子。 */
export type AmmoType = 'rifle-ammo' | 'shotgun-ammo' | 'handgun-ammo';

/** 弾薬ポーチに表示する順序と、既存の武器種への対応をまとめる。 */
export const AMMO_TYPES: Record<AmmoType, { label: string; icon: string; weapon: WeaponId }> = {
  'rifle-ammo': { label: 'ライフル弾', icon: '▰', weapon: 'rifle' },
  'shotgun-ammo': { label: 'ショットガン弾', icon: '◀', weapon: 'shotgun' },
  'handgun-ammo': { label: 'ハンドガン弾', icon: '▪', weapon: 'handgun' },
};

/** 弾薬ポーチへ常に並べる既存弾薬種の順序。 */
export const AMMO_TYPE_ORDER: readonly AmmoType[] = ['rifle-ammo', 'shotgun-ammo', 'handgun-ammo'];

const AMMO_TYPE_FOR_WEAPON: Record<WeaponId, AmmoType> = {
  rifle: 'rifle-ammo',
  shotgun: 'shotgun-ammo',
  handgun: 'handgun-ammo',
};

/**
 * 戦闘上の武器種に対応する弾薬種を返す。
 * @param weapon 戦闘で共有する武器種。
 * @returns 弾薬ポーチに表示する弾薬種。
 */
export function ammoTypeForWeapon(weapon: WeaponId): AmmoType {
  return AMMO_TYPE_FOR_WEAPON[weapon];
}

/** 所持品の一枠に入る武器モデルの識別子。 */
export type WeaponModel = 'rifle' | 'shotgun' | 'handgun' | 'revolver' | 'compact-pistol';

/** 武器モデルの表示名と戦闘上の武器種を対応付ける。 */
export const WEAPON_MODELS: Record<WeaponModel, { label: string; weapon: WeaponId }> = {
  'rifle': { label: 'アサルトライフル', weapon: 'rifle' },
  'shotgun': { label: 'ショットガン', weapon: 'shotgun' },
  'handgun': { label: 'ハンドガン', weapon: 'handgun' },
  'revolver': { label: 'リボルバー', weapon: 'handgun' },
  'compact-pistol': { label: 'コンパクトピストル', weapon: 'handgun' },
};

/**
 * 武器モデルが利用する既存の戦闘上の武器種を返す。
 * @param model 所持品にある武器モデル。
 * @returns 戦闘と弾薬で共有する武器種。
 */
export function weaponIdForModel(model: WeaponModel): WeaponId {
  return WEAPON_MODELS[model].weapon;
}

export const QUICK_SLOT_COUNT = 3;
export const BACKPACK_SLOT_COUNT = 10;

/** 最小インベントリで扱う素材の識別子。 */
export type MaterialId = 'scrap';

/** 個別武器モデルと素材数だけを保持する最小インベントリ状態。 */
export type InventoryState = {
  quickSlots: Array<WeaponModel | null>;
  backpackSlots: Array<WeaponModel | null>;
  selectedQuickSlot: number;
  materials: Record<MaterialId, number>;
};

/** 詳細インベントリ内の武器枠を表す参照。 */
export type InventorySlotRef = {
  container: 'quick' | 'backpack';
  index: number;
};

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
export const WAVE_COUNT = 3;
export const COMBAT_WAVE_DURATION_MS = 150000;
export const REST_DURATION_MS = 60000;
export const WAVE_DURATION_MS = COMBAT_WAVE_DURATION_MS;
export const SURVIVAL_LIMIT_MS = COMBAT_WAVE_DURATION_MS * WAVE_COUNT + REST_DURATION_MS * WAVE_COUNT;
export const STABLE_ENEMY_SLOT_COUNT = ENEMY_INSTANCE_IDS.length;
export const AMMO_BOX_RESPAWN_MS = 30000;

/** runの継続中またはterminalの状態を表す。 */
export type RunStatus = 'playing' | 'victory' | 'defeat';

/** 初回準備、戦闘、wave間休憩を表す。 */
export type RunPhase = 'preparation' | 'combat' | 'rest';

/** 初回準備、3 combat wave、2 restを決めるrun時間設定。 */
export type RunSchedule = {
  combatWaveDurationMs: number;
  restDurationMs: number;
};

/** URL未指定時に使う3 combat waveと共通の昼時間設定。 */
export const DEFAULT_RUN_SCHEDULE: RunSchedule = {
  combatWaveDurationMs: COMBAT_WAVE_DURATION_MS,
  restDurationMs: REST_DURATION_MS,
};

/** stableな敵枠がspawn、撃破、recycleのどの段階にあるかを表す。 */
export type RunEnemySlotStatus = 'waiting' | 'active' | 'respawning' | 'recycling';

/**
 * 3 waveの時間進行と敵枠の観測値をまとめた純粋なrun状態。
 *
 * `enemySlots`は実際にspawn成功した枠だけを`active`にするため、
 * strict spawnの再試行中もHUDの現在数とPhaser spriteを一致させられる。
 */
export type RunState = {
  status: RunStatus;
  schedule: RunSchedule;
  elapsedMs: number;
  kills: number;
  enemySlots: Record<EnemyInstanceId, RunEnemySlotStatus>;
};

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

/** ハンドガンの予備弾薬を10発単位で調整する設定。 */
export const HANDGUN_AMMO = {
  reserveInitial: 30,
  reserveMax: 60,
  ammoBoxRecovery: 10,
} as const;

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
  weapon: WeaponId | null;
  inventory: InventoryState;
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
  handgun: {
    label: 'ハンドガン',
    damageType: 'smallCaliber',
    automatic: false,
    fireIntervalMs: 150,
    magazineSize: 10,
    reserveInitial: HANDGUN_AMMO.reserveInitial,
    reserveMax: HANDGUN_AMMO.reserveMax,
    ammoBoxRecovery: HANDGUN_AMMO.ammoBoxRecovery,
    reloadMs: 1200,
    pellets: 1,
    damage: 2,
    speed: 600,
    range: 520,
    spread: 0,
    knockback: 0,
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

const INITIAL_INVENTORY: InventoryState = {
  quickSlots: ['rifle', null, null],
  backpackSlots: Array<WeaponModel | null>(BACKPACK_SLOT_COUNT).fill(null),
  selectedQuickSlot: 0,
  materials: { scrap: 0 },
};

export const INITIAL_STATE: CombatState = {
  playerHp: 100,
  defeated: false,
  victory: false,
  weapon: 'rifle',
  inventory: INITIAL_INVENTORY,
  ammo: {
    rifle: WEAPONS.rifle.magazineSize,
    shotgun: WEAPONS.shotgun.magazineSize,
    handgun: WEAPONS.handgun.magazineSize,
  },
  reserve: {
    rifle: WEAPONS.rifle.reserveInitial,
    shotgun: WEAPONS.shotgun.reserveInitial,
    handgun: WEAPONS.handgun.reserveInitial,
  },
  nextFireAt: { rifle: 0, shotgun: 0, handgun: 0 },
  reloading: null,
  enemies: INITIAL_ENEMIES,
};

function cloneEnemies(enemies: Record<EnemyInstanceId, EnemyState>): Record<EnemyInstanceId, EnemyState> {
  return Object.fromEntries(ENEMY_INSTANCE_IDS.map(id => [id, { ...enemies[id] }])) as Record<EnemyInstanceId, EnemyState>;
}

function createWaitingEnemySlots(): Record<EnemyInstanceId, RunEnemySlotStatus> {
  return Object.fromEntries(ENEMY_INSTANCE_IDS.map(id => [id, 'waiting'])) as Record<EnemyInstanceId, RunEnemySlotStatus>;
}

function withEnemySlot(
  state: RunState,
  enemyId: EnemyInstanceId,
  status: RunEnemySlotStatus,
): RunState {
  return {
    ...state,
    enemySlots: { ...state.enemySlots, [enemyId]: status },
  };
}

function normalizedRunDurationMs(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * run設定を正の安全な整数へ正規化する。
 *
 * @param combatWaveDurationMs 1 combat waveの時間。
 * @param restDurationMs wave間restの時間。
 * @returns 正規化済みのrun時間設定。
 */
export function createRunSchedule(
  combatWaveDurationMs = COMBAT_WAVE_DURATION_MS,
  restDurationMs = REST_DURATION_MS,
): RunSchedule {
  return {
    combatWaveDurationMs: normalizedRunDurationMs(combatWaveDurationMs, COMBAT_WAVE_DURATION_MS),
    restDurationMs: normalizedRunDurationMs(restDurationMs, REST_DURATION_MS),
  };
}

/**
 * 初回準備、3 combat wave、wave間休憩を含むrun総時間を返す。
 *
 * @param schedule 対象runの時間設定。
 * @returns victory境界となる総ミリ秒。
 */
export function runDurationMs(schedule: RunSchedule): number {
  return schedule.combatWaveDurationMs * WAVE_COUNT + schedule.restDurationMs * WAVE_COUNT;
}

function normalizedRunElapsedMs(elapsedMs: number, schedule: RunSchedule): number {
  const value = Number.isNaN(elapsedMs) ? 0 : elapsedMs;
  return Math.min(runDurationMs(schedule), Math.max(0, Math.floor(value)));
}

/**
 * 新しいrunを未spawnの12 stable slotと初回準備時間設定とともに作成する。
 *
 * @param schedule combat/restの時間設定。
 * @returns 初期化済みのrun状態。
 */
export function createRunState(schedule: RunSchedule = DEFAULT_RUN_SCHEDULE): RunState {
  const normalizedSchedule = createRunSchedule(
    schedule.combatWaveDurationMs,
    schedule.restDurationMs,
  );
  return {
    status: 'playing',
    schedule: normalizedSchedule,
    elapsedMs: 0,
    kills: 0,
    enemySlots: createWaitingEnemySlots(),
  };
}

/**
 * run開始からの絶対経過時間を使い、waveと勝利境界へ決定的に進める。
 *
 * @param state 現在のrun状態。
 * @param elapsedMs run開始からの絶対経過ミリ秒。
 * @returns 経過時間と必要な勝利状態を反映したrun状態。
 */
export function advanceRunState(state: RunState, elapsedMs: number): RunState {
  if (state.status !== 'playing') return state;
  const nextElapsedMs = Math.max(state.elapsedMs, normalizedRunElapsedMs(elapsedMs, state.schedule));
  const status: RunStatus = nextElapsedMs >= runDurationMs(state.schedule) ? 'victory' : 'playing';
  if (nextElapsedMs === state.elapsedMs && status === state.status)
    return state;
  return { ...state, elapsedMs: nextElapsedMs, status };
}

/**
 * 初回準備または現在phaseが属する1始まりのwave番号を返す。
 *
 * @param state 現在のrun状態。
 * @returns 1から3の範囲に収めたwave番号。
 */
export function currentWaveNumber(state: RunState): number {
  if (state.elapsedMs < state.schedule.restDurationMs)
    return 1;
  const cycleDuration = state.schedule.combatWaveDurationMs + state.schedule.restDurationMs;
  const combatElapsedMs = state.elapsedMs - state.schedule.restDurationMs;
  return Math.min(WAVE_COUNT, Math.floor(combatElapsedMs / cycleDuration) + 1);
}

/**
 * 現在の初回準備、combat、rest phaseを返す。
 *
 * @param state 現在のrun状態。
 * @returns 現在のphase。
 */
export function currentRunPhase(state: RunState): RunPhase {
  if (state.elapsedMs >= runDurationMs(state.schedule))
    return 'combat';
  if (state.elapsedMs < state.schedule.restDurationMs)
    return 'preparation';
  const cycleElapsedMs = (state.elapsedMs - state.schedule.restDurationMs)
    % (state.schedule.combatWaveDurationMs + state.schedule.restDurationMs);
  return cycleElapsedMs < state.schedule.combatWaveDurationMs ? 'combat' : 'rest';
}

/**
 * 現在の初回準備、combat、rest phaseが終わるまでの残り時間を返す。
 *
 * @param state 現在のrun状態。
 * @returns 0から現在phaseの設定時間までの残りミリ秒。
 */
export function remainingPhaseMs(state: RunState): number {
  if (state.elapsedMs >= runDurationMs(state.schedule))
    return 0;
  const phase = currentRunPhase(state);
  if (phase === 'preparation')
    return state.schedule.restDurationMs - state.elapsedMs;
  const cycleElapsedMs = (state.elapsedMs - state.schedule.restDurationMs)
    % (state.schedule.combatWaveDurationMs + state.schedule.restDurationMs);
  return phase === 'combat'
    ? state.schedule.combatWaveDurationMs - cycleElapsedMs
    : state.schedule.combatWaveDurationMs + state.schedule.restDurationMs - cycleElapsedMs;
}

/**
 * 現在combat waveが終わるまでの残り時間を返す。
 *
 * 初回準備とrest中は次waveを開始するまで戦闘残り時間を0とし、既存HUDのdata-testidを維持する。
 *
 * @param state 現在のrun状態。
 * @returns 0からcombat wave設定時間までの残りミリ秒。
 */
export function remainingWaveMs(state: RunState): number {
  return currentRunPhase(state) === 'combat' ? remainingPhaseMs(state) : 0;
}

/**
 * 通常移動へ一度だけ適用するphase別の敵速度倍率を返す。
 *
 * @param phase 現在の初回準備、combatまたはrest phase。
 * @returns combatは1.5、restは0.75の速度倍率。
 */
export function enemySpeedMultiplierForPhase(phase: RunPhase): number {
  return phase === 'combat' ? 1.5 : 0.75;
}

/**
 * hidden recycleを許可する最小path距離をphase別に返す。
 *
 * @param phase 現在の初回準備、combatまたはrest phase。
 * @returns combatは10、restは5 tileの最小距離。
 */
export function hiddenRecyclePathDistanceForPhase(phase: RunPhase): number {
  return phase === 'combat' ? 10 : 5;
}

/**
 * 現在Phaser上でactiveとして観測すべき敵枠数を返す。
 *
 * @param state 現在のrun状態。
 * @returns activeなstable enemy slot数。
 */
export function activeEnemyCount(state: RunState): number {
  return ENEMY_INSTANCE_IDS.filter(id => state.enemySlots[id] === 'active').length;
}

/**
 * 現在activeかつ未撃破として残る敵数を返す。
 *
 * death eventは同時にslotを`respawning`へ移すため、ここで返す数は
 * Phaser上のactive sprite数と同期する。これは撃破quotaではない。
 *
 * @param state 現在のrun状態。
 * @returns activeかつ未撃破の敵枠数。
 */
export function remainingEnemyCount(state: RunState): number {
  return activeEnemyCount(state);
}

/**
 * Phaserの敵spawnが成功したとき、そのstable slotをactiveへ遷移する。
 *
 * @param state 現在のrun状態。
 * @param enemyId spawnに成功したstable enemy slot。
 * @returns spawn成功を反映したrun状態。
 */
export function recordEnemySpawned(state: RunState, enemyId: EnemyInstanceId): RunState {
  if (state.status !== 'playing' || state.enemySlots[enemyId] === 'active')
    return state;
  return withEnemySlot(state, enemyId, 'active');
}

/**
 * activeな敵が撃破されたとき、再出現待ちと撃破数を記録する。
 *
 * @param state 現在のrun状態。
 * @param enemyId 撃破されたstable enemy slot。
 * @returns deathを反映したrun状態。
 */
export function recordEnemyDefeated(state: RunState, enemyId: EnemyInstanceId): RunState {
  if (state.status !== 'playing' || state.enemySlots[enemyId] !== 'active')
    return state;
  return { ...withEnemySlot(state, enemyId, 'respawning'), kills: state.kills + 1 };
}

/**
 * hidden enemyをHP維持のままrecycle待ちへ遷移する。
 *
 * @param state 現在のrun状態。
 * @param enemyId recycleするstable enemy slot。
 * @returns recycle待ちを反映したrun状態。
 */
export function recordEnemyRecycled(state: RunState, enemyId: EnemyInstanceId): RunState {
  if (state.status !== 'playing' || state.enemySlots[enemyId] !== 'active')
    return state;
  return withEnemySlot(state, enemyId, 'recycling');
}

/**
 * player HPが0になったrunをdefeat terminalへ遷移する。
 *
 * @param state 現在のrun状態。
 * @returns defeatを反映したrun状態。
 */
export function defeatRun(state: RunState): RunState {
  return state.status === 'playing' ? { ...state, status: 'defeat' } : state;
}

/**
 * terminal後の再挑戦用に、独立した初期run状態を作る。
 *
 * @param schedule 再挑戦後も使うcombat/restの時間設定。
 * @returns elapsed、撃破数、敵枠を初期化したrun状態。
 */
export function retryRun(schedule: RunSchedule = DEFAULT_RUN_SCHEDULE): RunState {
  return createRunState(schedule);
}

/**
 * 生存制限までの残り時間を範囲内に丸めて返す。
 *
 * @param startedAt 生存計測を開始した時刻。
 * @param now 現在時刻。
 * @param survivalLimitMs 対象runの総時間。
 * @returns 0から生存制限までの残りミリ秒。
 */
export function remainingSurvivalMs(
  startedAt: number,
  now: number,
  survivalLimitMs = SURVIVAL_LIMIT_MS,
): number {
  return Math.min(survivalLimitMs, Math.max(0, startedAt + survivalLimitMs - now));
}

/**
 * 現在時刻が生存制限に到達したかを判定する。
 *
 * @param startedAt 生存計測を開始した時刻。
 * @param now 現在時刻。
 * @param survivalLimitMs 対象runの総時間。
 * @returns 生存制限に到達していれば真。
 */
export function hasReachedSurvivalLimit(
  startedAt: number,
  now: number,
  survivalLimitMs = SURVIVAL_LIMIT_MS,
): boolean {
  return now >= startedAt + survivalLimitMs;
}

/**
 * 生存制限到達時の勝利状態を反映する。
 *
 * @param state 現在の戦闘状態。
 * @param startedAt 生存計測を開始した時刻。
 * @param now 現在時刻。
 * @param survivalLimitMs 対象runの総時間。
 * @returns 勝利状態を反映した戦闘状態。
 */
export function advanceSurvivalState(
  state: CombatState,
  startedAt: number,
  now: number,
  survivalLimitMs = SURVIVAL_LIMIT_MS,
): CombatState {
  if (state.defeated || state.victory || !hasReachedSurvivalLimit(startedAt, now, survivalLimitMs))
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

function isInventorySlotRef(slot: InventorySlotRef): boolean {
  if (slot.container !== 'quick' && slot.container !== 'backpack') return false;
  const count = slot.container === 'quick' ? QUICK_SLOT_COUNT : BACKPACK_SLOT_COUNT;
  return Number.isInteger(slot.index) && slot.index >= 0 && slot.index < count;
}

function weaponModelAt(inventory: InventoryState, slot: InventorySlotRef): WeaponModel | null {
  if (!isInventorySlotRef(slot)) return null;
  return slot.container === 'quick'
    ? inventory.quickSlots[slot.index] ?? null
    : inventory.backpackSlots[slot.index] ?? null;
}

function inventoryWithWeaponAt(
  inventory: InventoryState,
  slot: InventorySlotRef,
  model: WeaponModel | null,
): InventoryState {
  if (slot.container === 'quick') {
    const quickSlots = [...inventory.quickSlots];
    quickSlots[slot.index] = model;
    return { ...inventory, quickSlots };
  }
  const backpackSlots = [...inventory.backpackSlots];
  backpackSlots[slot.index] = model;
  return { ...inventory, backpackSlots };
}

function activeWeaponIdForInventory(inventory: InventoryState): WeaponId | null {
  const model = inventory.quickSlots[inventory.selectedQuickSlot];
  return model ? weaponIdForModel(model) : null;
}

function withInventory(state: CombatState, inventory: InventoryState): CombatState {
  const weapon = activeWeaponIdForInventory(inventory);
  return {
    ...state,
    weapon,
    reloading: weapon !== null && weapon === state.weapon ? state.reloading : null,
    inventory,
  };
}

/**
 * 選択中クイックスロットから現在発射可能な武器種を求める。
 *
 * `CombatState.weapon`が古い値でも、空き選択枠を武器として使わないために
 * 戦闘処理はこの導出値を使う。
 *
 * @param state 現在の戦闘状態。
 * @returns 選択枠に武器があればその武器種、空ならnull。
 */
export function activeWeaponId(state: CombatState): WeaponId | null {
  return activeWeaponIdForInventory(state.inventory);
}

/**
 * 指定した詳細インベントリ枠の武器モデルを返す。
 *
 * @param state 現在の戦闘状態。
 * @param slot 読み取る枠。
 * @returns 枠内の武器モデル。無効または空きならnull。
 */
export function inventoryWeaponAt(state: CombatState, slot: InventorySlotRef): WeaponModel | null {
  return weaponModelAt(state.inventory, slot);
}

/**
 * 詳細インベントリ内の武器を空き枠へ移動し、占有枠とは交換する。
 *
 * @param state 現在の戦闘状態。
 * @param source 移動元の武器枠。
 * @param target 移動先の武器枠。
 * @returns 成功時だけ配置と選択武器を同期した状態。
 */
export function moveInventoryWeapon(
  state: CombatState,
  source: InventorySlotRef,
  target: InventorySlotRef,
): CombatState {
  if (
    state.defeated
    || state.victory
    || !isInventorySlotRef(source)
    || !isInventorySlotRef(target)
    || (source.container === target.container && source.index === target.index)
  ) return state;
  const sourceModel = weaponModelAt(state.inventory, source);
  if (!sourceModel) return state;
  const targetModel = weaponModelAt(state.inventory, target);
  const emptied = inventoryWithWeaponAt(state.inventory, source, targetModel);
  return withInventory(state, inventoryWithWeaponAt(emptied, target, sourceModel));
}

/**
 * worldへ配置できることが確定した武器だけを詳細インベントリから取り出す。
 *
 * @param state 現在の戦闘状態。
 * @param source 取り出す武器枠。
 * @returns 成功時だけ選択武器を同期した状態。
 */
export function removeInventoryWeapon(state: CombatState, source: InventorySlotRef): CombatState {
  if (state.defeated || state.victory || !isInventorySlotRef(source) || !weaponModelAt(state.inventory, source))
    return state;
  return withInventory(state, inventoryWithWeaponAt(state.inventory, source, null));
}

/**
 * クイックスロットの武器モデルを選択する。
 *
 * @param state 現在の戦闘状態。
 * @param slot 0始まりの選択するクイックスロット。
 * @returns 武器選択と必要なリロード中断を反映した戦闘状態。
 */
export function selectQuickSlot(state: CombatState, slot: number): CombatState {
  if (state.defeated || state.victory || !Number.isInteger(slot) || slot < 0 || slot >= QUICK_SLOT_COUNT)
    return state;
  const model = state.inventory.quickSlots[slot];
  if (!model || state.inventory.selectedQuickSlot === slot)
    return state;
  return withInventory(state, { ...state.inventory, selectedQuickSlot: slot });
}

/**
 * 戦闘上の武器種を持つ最初のクイックスロットを選択する。
 *
 * @param state 現在の戦闘状態。
 * @param weapon 選択する戦闘上の武器種。
 * @returns 対応するクイックスロットを選択した状態。
 */
export function selectWeapon(state: CombatState, weapon: WeaponId): CombatState {
  const slot = state.inventory.quickSlots.findIndex(model => model !== null && weaponIdForModel(model) === weapon);
  return slot < 0 ? state : selectQuickSlot(state, slot);
}

/**
 * 武器pickupを最初の空きクイックスロット、次にバックパックへ個別に格納する。
 *
 * @param state 現在の戦闘状態。
 * @param model 取得する武器モデル。
 * @returns 格納結果を反映した戦闘状態。満杯またはterminalなら元の状態。
 */
export function collectWeapon(state: CombatState, model: WeaponModel): CombatState {
  if (state.defeated || state.victory)
    return state;
  const quickSlot = state.inventory.quickSlots.indexOf(null);
  if (quickSlot >= 0) {
    return withInventory(state, inventoryWithWeaponAt(state.inventory, { container: 'quick', index: quickSlot }, model));
  }
  const backpackSlot = state.inventory.backpackSlots.indexOf(null);
  if (backpackSlot < 0)
    return state;
  return withInventory(state, inventoryWithWeaponAt(state.inventory, { container: 'backpack', index: backpackSlot }, model));
}

/**
 * 指定素材を正の個数だけ所持品へ加算する。
 *
 * @param state 現在の戦闘状態。
 * @param material 加算する素材。
 * @param amount 加算する正の安全な整数。
 * @returns 素材数を反映した戦闘状態。
 */
export function collectMaterial(state: CombatState, material: MaterialId, amount: number): CombatState {
  if (state.defeated || state.victory || !Number.isSafeInteger(amount) || amount <= 0)
    return state;
  return {
    ...state,
    inventory: {
      ...state.inventory,
      materials: { ...state.inventory.materials, [material]: state.inventory.materials[material] + amount },
    },
  };
}

/**
 * 指定時刻に現在の武器を発射できるかを判定する。
 *
 * @param state 現在の戦闘状態。
 * @param now 現在時刻。
 * @returns 発射可能なら真。
 */
export function canFireAt(state: CombatState, now: number): boolean {
  const weapon = activeWeaponId(state);
  return !state.defeated
    && !state.victory
    && weapon !== null
    && state.reloading === null
    && state.ammo[weapon] > 0
    && now >= state.nextFireAt[weapon];
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
  const weapon = activeWeaponId(state);
  if (!weapon) return { state, fired: false };
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
  const weapon = activeWeaponId(state);
  if (
    state.defeated
    || state.victory
    || weapon === null
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
  if (state.defeated || state.victory || state.reloading !== weapon || activeWeaponId(state) !== weapon) return state;
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
    inventory: {
      quickSlots: [...INITIAL_STATE.inventory.quickSlots],
      backpackSlots: [...INITIAL_STATE.inventory.backpackSlots],
      selectedQuickSlot: INITIAL_STATE.inventory.selectedQuickSlot,
      materials: { ...INITIAL_STATE.inventory.materials },
    },
    ammo: { ...INITIAL_STATE.ammo },
    reserve: { ...INITIAL_STATE.reserve },
    nextFireAt: { ...INITIAL_STATE.nextFireAt },
    enemies: cloneEnemies(INITIAL_STATE.enemies),
  };
}
