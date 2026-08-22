import {
  AMMO_MATERIALS,
  WEAPONS,
  type AmmoMaterial,
  type DamageType,
  type WeaponModel,
} from './ammo-data';
import type { PlayerRoleId } from './player-data';
import { DEFAULT_RUN_PHASE_DURATIONS_MS } from './run-data';
import {
  SCRAP_ARMOR_CAPACITY,
  SCRAP_ARMOR_COST,
  SCRAP_ARMOR_PER_CRAFT,
  SCRAP_PLAYER_DROP_QUANTITY,
} from './scrap-data';
import { MATERIAL_CARRY, WEAPON_WEIGHTS, type WeightedMaterialId } from './weight-data';

export {
  AMMO_MATERIAL_BOX_CYCLE,
  AMMO_MATERIAL_ORDER,
  AMMO_MATERIALS,
  WEAPON_MODELS,
  WEAPON_MODEL_ORDER,
  WEAPONS,
} from './ammo-data';
export type {
  AmmoMaterial,
  AmmoMaterialDefinition,
  DamageType,
  WeaponDefinition,
  WeaponModel,
} from './ammo-data';

export const STANDARD_HOTBAR_SLOT_COUNT = 4;
export const QUARTERMASTER_HOTBAR_SLOT_COUNT = 6;
export const QUICK_SLOT_COUNT = STANDARD_HOTBAR_SLOT_COUNT;
export const BACKPACK_SLOT_COUNT = 10;

/** 最小インベントリで扱う素材の識別子。 */
export type MaterialId = WeightedMaterialId;

/** 個別の弾倉と射撃待ちを持つ武器の恒久識別子。 */
export type WeaponInstanceId = string;

/** world、クイックスロット、バックパック間を同じまま移動する武器状態。 */
export type WeaponInstance = {
  kind: 'weapon';
  id: WeaponInstanceId;
  model: WeaponModel;
  magazine: number;
  nextFireAt: number;
  slotSpan: 1 | 2;
  hotbarOnly: boolean;
  droppable: boolean;
};

/** world武器生成時に必要な携行制約だけを上書きする。 */
export type WeaponCarryOptions = {
  slotSpan?: 1 | 2;
  hotbarOnly?: boolean;
  droppable?: boolean;
};

/** 手動固定装備をHotbarへ置くための共通状態。 */
export type FixedEquipmentInstance = {
  kind: 'fixed-equipment';
  id: string;
  label: string;
  slotSpan: 1;
  hotbarOnly: true;
  droppable: false;
  weight: number;
};

/** Hotbarへ配置できる武器または固定装備。 */
export type HotbarItem = WeaponInstance | FixedEquipmentInstance;

/** 2slot itemの2枠目から先頭枠を参照するmarker。 */
export type HotbarContinuation = {
  kind: 'continuation';
  itemId: string;
  anchorIndex: number;
};

/** Hotbarの空き、item本体、2枠目markerを表す。 */
export type HotbarSlot = HotbarItem | HotbarContinuation | null;

/** 個別武器、固定装備、素材数を保持する共通インベントリ状態。 */
export type InventoryState = {
  quickSlots: HotbarSlot[];
  backpackSlots: Array<WeaponInstance | null>;
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
export const STABLE_ENEMY_SLOT_COUNT = ENEMY_INSTANCE_IDS.length;
export const AMMO_BOX_RESPAWN_MS = 30000;

/** runの継続中またはterminalの状態を表す。 */
export type RunStatus = 'playing' | 'victory' | 'defeat';

/** 昼、通常夜、時間制限のないBoss夜を表す。 */
export type RunPhase = 'day' | 'night' | 'boss-night';

/** run内で一意な昼夜phaseの識別子。 */
export type RunPhaseId = 'day-1' | 'night-1' | 'day-2' | 'night-2' | 'day-3' | 'night-3' | 'final-day' | 'boss-night';

/** 7つの時間制phaseを個別に調整するrun時間設定。 */
export type RunSchedule = {
  day1DurationMs: number;
  night1DurationMs: number;
  day2DurationMs: number;
  night2DurationMs: number;
  day3DurationMs: number;
  night3DurationMs: number;
  finalDayDurationMs: number;
};

type RunScheduleKey = keyof RunSchedule;

type TimedRunPhaseDefinition = Readonly<{
  id: Exclude<RunPhaseId, 'boss-night'>;
  kind: Exclude<RunPhase, 'boss-night'>;
  wave: 1 | 2 | 3 | null;
  scheduleKey: RunScheduleKey;
}>;

const TIMED_RUN_PHASES: readonly TimedRunPhaseDefinition[] = [
  { id: 'day-1', kind: 'day', wave: 1, scheduleKey: 'day1DurationMs' },
  { id: 'night-1', kind: 'night', wave: 1, scheduleKey: 'night1DurationMs' },
  { id: 'day-2', kind: 'day', wave: 2, scheduleKey: 'day2DurationMs' },
  { id: 'night-2', kind: 'night', wave: 2, scheduleKey: 'night2DurationMs' },
  { id: 'day-3', kind: 'day', wave: 3, scheduleKey: 'day3DurationMs' },
  { id: 'night-3', kind: 'night', wave: 3, scheduleKey: 'night3DurationMs' },
  { id: 'final-day', kind: 'day', wave: null, scheduleKey: 'finalDayDurationMs' },
];

/** stableな敵枠がspawn、撃破、recycleのどの段階にあるかを表す。 */
export type RunEnemySlotStatus = 'waiting' | 'active' | 'respawning' | 'recycling';

/**
 * 3回の昼夜とBoss夜の進行、敵枠の観測値をまとめた純粋なrun状態。
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
  playerArmor: number;
  defeated: boolean;
  victory: boolean;
  inventory: InventoryState;
  reloading: WeaponInstanceId | null;
  enemies: Record<EnemyInstanceId, EnemyState>;
};

/** 弾薬ポーチからworldへ出す量を返す。 */
export type MaterialDropResult = {
  state: CombatState;
  dropped: number;
};

/** 素材上限内で実際に取得した個数を返す。 */
export type MaterialCollectResult = {
  state: CombatState;
  collected: number;
};

/** Scrap Armor作成の成否と単一transactionの差分。 */
export type ScrapArmorCraftResult = {
  state: CombatState;
  crafted: boolean;
  spent: number;
  armorAdded: number;
};

/** 発射可否と更新後の状態。 */
export type FireResult = {
  state: CombatState;
  fired: boolean;
};

const DAMAGE_MULTIPLIERS: Record<EnemyKind, Record<DamageType, number>> = {
  basic: { smallCaliber: 1, scatter: 1, flame: 1 },
  drone: { smallCaliber: 1, scatter: 1, flame: 1 },
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

/**
 * 武器設定の上限内へ初期またはpickup時の弾倉数を正規化する。
 *
 * @param id 個別武器を識別するID。
 * @param model 設定を参照する武器モデル。
 * @param magazine 初期弾倉数。
 * @param nextFireAt 次回発射可能な時刻。
 * @param carry Hotbar占有数とdrop制約。
 * @returns 正規化済みの個別武器状態。
 */
export function createWeaponInstance(
  id: WeaponInstanceId,
  model: WeaponModel,
  magazine = WEAPONS[model].magazineSize,
  nextFireAt = 0,
  carry: WeaponCarryOptions = {},
): WeaponInstance {
  const definition = WEAPONS[model];
  return {
    kind: 'weapon',
    id,
    model,
    magazine: Number.isSafeInteger(magazine)
      ? Math.min(definition.magazineSize, Math.max(0, magazine))
      : definition.magazineSize,
    nextFireAt: Number.isFinite(nextFireAt) ? nextFireAt : 0,
    slotSpan: carry.slotSpan ?? 1,
    hotbarOnly: carry.hotbarOnly ?? false,
    droppable: carry.droppable ?? true,
  };
}

/**
 * Hotbar内だけで並べ替えられる手動固定装備を作る。
 *
 * @param id 固定装備の安定ID。
 * @param label HUDに表示する装備名。
 * @param weight 装備固有の重量。
 * @returns drop不可の1slot固定装備。
 */
export function createFixedEquipmentInstance(id: string, label: string, weight = 0): FixedEquipmentInstance {
  return {
    kind: 'fixed-equipment',
    id,
    label,
    slotSpan: 1,
    hotbarOnly: true,
    droppable: false,
    weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
  };
}

function createInitialMaterials(): Record<MaterialId, number> {
  return {
    scrap: 0,
    ...Object.fromEntries(
      Object.entries(AMMO_MATERIALS).map(([material, definition]) => [material, definition.initialQuantity]),
    ),
  } as Record<MaterialId, number>;
}

/**
 * Roleが利用できるHotbar枠数を返す。
 *
 * @param roleId 現在のRole ID。
 * @returns 通常Roleは4枠、QMは6枠。
 */
export function hotbarSlotCountForRole(roleId: PlayerRoleId): number {
  return roleId === 'quartermaster' ? QUARTERMASTER_HOTBAR_SLOT_COUNT : STANDARD_HOTBAR_SLOT_COUNT;
}

/**
 * RoleごとのHotbar枠数を反映した新規戦闘状態を作る。
 *
 * @param roleId 開始時のRole ID。
 * @returns 独立した初期戦闘状態。
 */
export function createInitialCombatState(roleId: PlayerRoleId = 'gunner'): CombatState {
  const quickSlots = Array<HotbarSlot>(hotbarSlotCountForRole(roleId)).fill(null);
  quickSlots[0] = createWeaponInstance('starter-rifle', 'rifle');
  return {
    playerHp: 100,
    playerArmor: 0,
    defeated: false,
    victory: false,
    inventory: {
      quickSlots,
      backpackSlots: Array<WeaponInstance | null>(BACKPACK_SLOT_COUNT).fill(null),
      selectedQuickSlot: 0,
      materials: createInitialMaterials(),
    },
    reloading: null,
    enemies: cloneEnemies(INITIAL_ENEMIES),
  };
}

export const INITIAL_STATE: CombatState = createInitialCombatState();

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

/** URL未指定時に使う7つの時間制phase設定。 */
export const DEFAULT_RUN_SCHEDULE: RunSchedule = { ...DEFAULT_RUN_PHASE_DURATIONS_MS };

/**
 * run設定を正の安全な整数へ正規化する。
 *
 * 数値2引数は既存DEVテスト用に、全Nightと全Dayへ同じ時間を適用する。
 * object指定では7 phaseを個別に上書きできる。
 *
 * @param input phase別上書き、または全Nightへ使う時間。
 * @param uniformDayDurationMs 数値指定時に全Dayへ使う時間。
 * @returns 正規化済みのrun時間設定。
 */
export function createRunSchedule(
  input: Partial<RunSchedule> | number = {},
  uniformDayDurationMs: number = DEFAULT_RUN_PHASE_DURATIONS_MS.day1DurationMs,
): RunSchedule {
  const overrides: Partial<RunSchedule> = typeof input === 'number'
    ? {
        day1DurationMs: uniformDayDurationMs,
        night1DurationMs: input,
        day2DurationMs: uniformDayDurationMs,
        night2DurationMs: input,
        day3DurationMs: uniformDayDurationMs,
        night3DurationMs: input,
        finalDayDurationMs: uniformDayDurationMs,
      }
    : input;
  return Object.fromEntries(
    Object.entries(DEFAULT_RUN_PHASE_DURATIONS_MS).map(([key, fallback]) => {
      const scheduleKey = key as RunScheduleKey;
      return [scheduleKey, normalizedRunDurationMs(overrides[scheduleKey] ?? fallback, fallback)];
    }),
  ) as RunSchedule;
}

/**
 * Boss Night開始までの7つの時間制phase総時間を返す。
 *
 * @param schedule 対象runの時間設定。
 * @returns Boss Night開始境界となる総ミリ秒。
 */
export function runDurationMs(schedule: RunSchedule): number {
  return TIMED_RUN_PHASES.reduce((total, phase) => total + schedule[phase.scheduleKey], 0);
}

function normalizedRunElapsedMs(elapsedMs: number, schedule: RunSchedule): number {
  const value = Number.isNaN(elapsedMs) ? 0 : elapsedMs;
  return Math.min(runDurationMs(schedule), Math.max(0, Math.floor(value)));
}

/**
 * 新しいrunを未spawnの12 stable slotとDay 1時間設定とともに作成する。
 *
 * @param schedule 7つの時間制phase設定。
 * @returns 初期化済みのrun状態。
 */
export function createRunState(schedule: RunSchedule = DEFAULT_RUN_SCHEDULE): RunState {
  const normalizedSchedule = createRunSchedule(schedule);
  return {
    status: 'playing',
    schedule: normalizedSchedule,
    elapsedMs: 0,
    kills: 0,
    enemySlots: createWaitingEnemySlots(),
  };
}

/**
 * run開始からの絶対経過時間を使い、Boss Night境界まで決定的に進める。
 *
 * @param state 現在のrun状態。
 * @param elapsedMs run開始からの絶対経過ミリ秒。
 * @returns 経過時間を反映したrun状態。時間だけでは勝利しない。
 */
export function advanceRunState(state: RunState, elapsedMs: number): RunState {
  if (state.status !== 'playing') return state;
  const nextElapsedMs = Math.max(state.elapsedMs, normalizedRunElapsedMs(elapsedMs, state.schedule));
  if (nextElapsedMs === state.elapsedMs)
    return state;
  return { ...state, elapsedMs: nextElapsedMs };
}

function timedRunPhaseAt(state: RunState): { definition: TimedRunPhaseDefinition; startMs: number; endMs: number } | undefined {
  let startMs = 0;
  for (const definition of TIMED_RUN_PHASES) {
    const endMs = startMs + state.schedule[definition.scheduleKey];
    if (state.elapsedMs < endMs)
      return { definition, startMs, endMs };
    startMs = endMs;
  }
  return undefined;
}

/**
 * 指定phaseが始まるrun経過時間を返す。
 *
 * @param schedule 対象runの時間設定。
 * @param phaseId 探すphase ID。
 * @returns run開始からphase開始までのミリ秒。
 */
export function runPhaseStartMs(schedule: RunSchedule, phaseId: RunPhaseId): number {
  let startMs = 0;
  for (const definition of TIMED_RUN_PHASES) {
    if (definition.id === phaseId)
      return startMs;
    startMs += schedule[definition.scheduleKey];
  }
  return startMs;
}

/**
 * 現在phaseの安定IDを返す。
 *
 * @param state 現在のrun状態。
 * @returns day/night番号またはBoss NightのID。
 */
export function currentRunPhaseId(state: RunState): RunPhaseId {
  return timedRunPhaseAt(state)?.definition.id ?? 'boss-night';
}

/**
 * 現在の昼、通常夜、Boss夜種別を返す。
 *
 * @param state 現在のrun状態。
 * @returns 現在phaseの種別。
 */
export function currentRunPhase(state: RunState): RunPhase {
  return timedRunPhaseAt(state)?.definition.kind ?? 'boss-night';
}

/**
 * 現在phaseが対応する通常Night番号を返す。
 *
 * Final DayとBoss Nightでは既存HUD互換の3を返す。
 *
 * @param state 現在のrun状態。
 * @returns 1から3の通常Night番号。
 */
export function currentWaveNumber(state: RunState): number {
  return timedRunPhaseAt(state)?.definition.wave ?? WAVE_COUNT;
}

/**
 * HUDへ表示する現在phase名を返す。
 *
 * @param state 現在のrun状態。
 * @returns 昼夜番号を含む日本語phase名。
 */
export function currentRunPhaseLabel(state: RunState): string {
  const labels: Record<RunPhaseId, string> = {
    'day-1': '昼1（探索）',
    'night-1': '夜1（戦闘）',
    'day-2': '昼2（準備）',
    'night-2': '夜2（戦闘）',
    'day-3': '昼3（準備）',
    'night-3': '夜3（戦闘）',
    'final-day': '最終昼（ボス準備）',
    'boss-night': 'ボス夜',
  };
  return labels[currentRunPhaseId(state)];
}

/**
 * 現在の時間制phaseが終わるまでの残り時間を返す。
 *
 * @param state 現在のrun状態。
 * @returns 時間制phaseの残りミリ秒。Boss Nightはnull。
 */
export function remainingPhaseMs(state: RunState): number | null {
  const phase = timedRunPhaseAt(state);
  return phase ? phase.endMs - state.elapsedMs : null;
}

/**
 * 現在の通常Nightが終わるまでの残り時間を返す。
 *
 * @param state 現在のrun状態。
 * @returns 通常Night以外は0。
 */
export function remainingWaveMs(state: RunState): number {
  return currentRunPhase(state) === 'night' ? remainingPhaseMs(state) ?? 0 : 0;
}

/**
 * Boss撃破eventでだけrunを勝利terminalへ遷移する。
 *
 * @param state 現在のrun状態。
 * @returns Boss Night中なら勝利、それ以外は元の状態。
 */
export function recordBossDefeated(state: RunState): RunState {
  return state.status === 'playing' && currentRunPhaseId(state) === 'boss-night'
    ? { ...state, status: 'victory' }
    : state;
}

/**
 * 通常移動へ一度だけ適用するphase別の敵速度倍率を返す。
 *
 * 昼夜差は敵の量と構成で表現するため、基礎速度は変更しない。
 *
 * @param phase 現在の昼夜phase。
 * @returns 常に1。
 */
export function enemySpeedMultiplierForPhase(phase: RunPhase): number {
  void phase;
  return 1;
}

/**
 * hidden recycleを許可する最小path距離をphase別に返す。
 *
 * @param phase 現在の昼夜phase。
 * @returns Nightは10、Dayは5 tileの最小距離。
 */
export function hiddenRecyclePathDistanceForPhase(phase: RunPhase): number {
  return phase === 'day' ? 5 : 10;
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
 * Boss Night開始までの残り時間を範囲内に丸めて返す。
 *
 * @param startedAt 生存計測を開始した時刻。
 * @param now 現在時刻。
 * @param bossNightStartMs 対象runのBoss Night開始時間。
 * @returns 0からBoss Night開始までの残りミリ秒。
 */
export function remainingSurvivalMs(
  startedAt: number,
  now: number,
  bossNightStartMs = runDurationMs(DEFAULT_RUN_SCHEDULE),
): number {
  return Math.min(bossNightStartMs, Math.max(0, startedAt + bossNightStartMs - now));
}

/**
 * Boss撃破後の勝利を戦闘状態へ一度だけ反映する。
 *
 * @param state 現在の戦闘状態。
 * @returns 勝利状態を反映した戦闘状態。
 */
export function completeCombatVictory(state: CombatState): CombatState {
  if (state.defeated || state.victory)
    return state;
  return { ...state, victory: true, reloading: null };
}

/**
 * 現在stateで一回分の共通Scrap Armorを作成できるか返す。
 *
 * @param state 現在の戦闘状態。
 * @returns Scrap、Armor空き、terminal条件を満たす場合はtrue。
 */
export function canCraftScrapArmor(state: CombatState): boolean {
  return !state.defeated
    && !state.victory
    && state.inventory.materials.scrap >= SCRAP_ARMOR_COST
    && state.playerArmor + SCRAP_ARMOR_PER_CRAFT <= SCRAP_ARMOR_CAPACITY;
}

/**
 * Scrap消費とArmor加算を一つのtransactionとして適用する。
 *
 * @param state 現在の戦闘状態。
 * @returns 作成成否、消費量、追加Armorを含む更新結果。
 */
export function craftScrapArmor(state: CombatState): ScrapArmorCraftResult {
  if (!canCraftScrapArmor(state))
    return { state, crafted: false, spent: 0, armorAdded: 0 };
  return {
    crafted: true,
    spent: SCRAP_ARMOR_COST,
    armorAdded: SCRAP_ARMOR_PER_CRAFT,
    state: {
      ...state,
      playerArmor: state.playerArmor + SCRAP_ARMOR_PER_CRAFT,
      inventory: {
        ...state.inventory,
        materials: {
          ...state.inventory.materials,
          scrap: state.inventory.materials.scrap - SCRAP_ARMOR_COST,
        },
      },
    },
  };
}

/**
 * プレイヤーへArmor優先でダメージを適用する。
 *
 * @param state 現在の戦闘状態。
 * @param amount 減算する体力量。
 * @returns 体力と敗北状態を反映した戦闘状態。
 */
export function damagePlayer(state: CombatState, amount: number): CombatState {
  if (state.defeated || state.victory)
    return state;
  const damage = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (damage === 0)
    return state;
  const armorDamage = Math.min(state.playerArmor, damage);
  const playerArmor = state.playerArmor - armorDamage;
  const playerHp = Math.max(0, state.playerHp - (damage - armorDamage));
  return {
    ...state,
    playerHp,
    playerArmor,
    defeated: playerHp === 0,
    reloading: playerHp === 0 ? null : state.reloading,
  };
}

function isInventorySlotRef(inventory: InventoryState, slot: InventorySlotRef): boolean {
  if (slot.container !== 'quick' && slot.container !== 'backpack') return false;
  const count = slot.container === 'quick' ? inventory.quickSlots.length : inventory.backpackSlots.length;
  return Number.isInteger(slot.index) && slot.index >= 0 && slot.index < count;
}

/**
 * Hotbarの継続枠を本体へ解決し、配置itemを返す。
 *
 * @param inventory 対象Inventory。
 * @param index 確認するHotbar位置。
 * @returns 対応item。空きまたは無効位置ならnull。
 */
export function hotbarItemAt(inventory: InventoryState, index: number): HotbarItem | null {
  if (!Number.isInteger(index) || index < 0 || index >= inventory.quickSlots.length)
    return null;
  const slot = inventory.quickSlots[index];
  if (!slot)
    return null;
  if (slot.kind !== 'continuation')
    return slot;
  const anchor = inventory.quickSlots[slot.anchorIndex];
  return anchor && anchor.kind !== 'continuation' && anchor.id === slot.itemId ? anchor : null;
}

/**
 * Hotbarの表示枠が2slot itemの継続枠なら真を返す。
 *
 * @param slot 判定するHotbar枠。
 * @returns 2slot itemの継続枠ならtrue。
 */
export function isHotbarContinuation(slot: HotbarSlot): slot is HotbarContinuation {
  return slot?.kind === 'continuation';
}

function inventoryItemAt(inventory: InventoryState, slot: InventorySlotRef): HotbarItem | null {
  if (!isInventorySlotRef(inventory, slot))
    return null;
  return slot.container === 'quick'
    ? hotbarItemAt(inventory, slot.index)
    : inventory.backpackSlots[slot.index] ?? null;
}

function normalizedInventorySlot(inventory: InventoryState, slot: InventorySlotRef): InventorySlotRef | null {
  if (!isInventorySlotRef(inventory, slot))
    return null;
  if (slot.container === 'backpack')
    return slot;
  const value = inventory.quickSlots[slot.index];
  return value?.kind === 'continuation'
    ? { container: 'quick', index: value.anchorIndex }
    : slot;
}

function clearInventoryItem(inventory: InventoryState, slot: InventorySlotRef): InventoryState {
  const normalized = normalizedInventorySlot(inventory, slot);
  const item = normalized ? inventoryItemAt(inventory, normalized) : null;
  if (!normalized || !item)
    return inventory;
  if (normalized.container === 'backpack') {
    const backpackSlots = [...inventory.backpackSlots];
    backpackSlots[normalized.index] = null;
    return { ...inventory, backpackSlots };
  }
  const quickSlots = [...inventory.quickSlots];
  for (let offset = 0; offset < item.slotSpan; offset += 1) {
    const occupied = quickSlots[normalized.index + offset];
    if (offset === 0 || (occupied?.kind === 'continuation' && occupied.itemId === item.id))
      quickSlots[normalized.index + offset] = null;
  }
  return { ...inventory, quickSlots };
}

function canPlaceInventoryItem(inventory: InventoryState, slot: InventorySlotRef, item: HotbarItem): boolean {
  if (!isInventorySlotRef(inventory, slot))
    return false;
  if (slot.container === 'backpack')
    return item.kind === 'weapon'
      && item.slotSpan === 1
      && !item.hotbarOnly
      && inventory.backpackSlots[slot.index] === null;
  if (slot.index + item.slotSpan > inventory.quickSlots.length)
    return false;
  return inventory.quickSlots.slice(slot.index, slot.index + item.slotSpan).every(value => value === null);
}

function placeInventoryItem(
  inventory: InventoryState,
  slot: InventorySlotRef,
  item: HotbarItem,
): InventoryState | undefined {
  if (!canPlaceInventoryItem(inventory, slot, item))
    return undefined;
  if (slot.container === 'backpack') {
    if (item.kind !== 'weapon')
      return undefined;
    const backpackSlots = [...inventory.backpackSlots];
    backpackSlots[slot.index] = { ...item };
    return { ...inventory, backpackSlots };
  }
  const quickSlots = [...inventory.quickSlots];
  quickSlots[slot.index] = { ...item };
  for (let offset = 1; offset < item.slotSpan; offset += 1) {
    quickSlots[slot.index + offset] = {
      kind: 'continuation',
      itemId: item.id,
      anchorIndex: slot.index,
    };
  }
  return { ...inventory, quickSlots };
}

function replaceHotbarItem(inventory: InventoryState, selectedIndex: number, item: HotbarItem): InventoryState {
  const anchor = normalizedInventorySlot(inventory, { container: 'quick', index: selectedIndex });
  if (!anchor || anchor.container !== 'quick')
    return inventory;
  const cleared = clearInventoryItem(inventory, anchor);
  return placeInventoryItem(cleared, anchor, item) ?? inventory;
}

function activeWeaponForInventory(inventory: InventoryState): WeaponInstance | null {
  const item = hotbarItemAt(inventory, inventory.selectedQuickSlot);
  return item?.kind === 'weapon' ? item : null;
}

function withInventory(state: CombatState, inventory: InventoryState): CombatState {
  const weapon = activeWeaponForInventory(inventory);
  return {
    ...state,
    reloading: weapon?.id === state.reloading ? state.reloading : null,
    inventory,
  };
}

/**
 * 選択中クイックスロットから現在発射可能な武器個体を求める。
 *
 * 空き選択枠を武器として使わないために、戦闘処理はこの導出値を使う。
 *
 * @param state 現在の戦闘状態。
 * @returns 選択枠に武器があればその個体、空ならnull。
 */
export function activeWeapon(state: CombatState): WeaponInstance | null {
  return activeWeaponForInventory(state.inventory);
}

/**
 * 指定した詳細インベントリ枠の武器個体を返す。
 *
 * @param state 現在の戦闘状態。
 * @param slot 読み取る枠。
 * @returns 枠内の武器個体。無効または空きならnull。
 */
export function inventoryWeaponAt(state: CombatState, slot: InventorySlotRef): WeaponInstance | null {
  const item = inventoryItemAt(state.inventory, slot);
  return item?.kind === 'weapon' ? item : null;
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
    || !isInventorySlotRef(state.inventory, source)
    || !isInventorySlotRef(state.inventory, target)
  ) return state;
  const normalizedSource = normalizedInventorySlot(state.inventory, source);
  const normalizedTarget = normalizedInventorySlot(state.inventory, target);
  if (!normalizedSource || !normalizedTarget || (
    normalizedSource.container === normalizedTarget.container
    && normalizedSource.index === normalizedTarget.index
  )) return state;
  const sourceItem = inventoryItemAt(state.inventory, normalizedSource);
  if (!sourceItem)
    return state;
  const targetItem = inventoryItemAt(state.inventory, normalizedTarget);
  let inventory = clearInventoryItem(state.inventory, normalizedSource);
  if (targetItem)
    inventory = clearInventoryItem(inventory, normalizedTarget);
  const withSource = placeInventoryItem(inventory, normalizedTarget, sourceItem);
  if (!withSource)
    return state;
  const swapped = targetItem ? placeInventoryItem(withSource, normalizedSource, targetItem) : withSource;
  return swapped ? withInventory(state, swapped) : state;
}

/**
 * worldへ配置できることが確定した武器だけを詳細インベントリから取り出す。
 *
 * @param state 現在の戦闘状態。
 * @param source 取り出す武器枠。
 * @returns 成功時だけ選択武器を同期した状態。
 */
export function removeInventoryWeapon(state: CombatState, source: InventorySlotRef): CombatState {
  const item = inventoryItemAt(state.inventory, source);
  if (state.defeated || state.victory || !item || item.kind !== 'weapon' || !item.droppable)
    return state;
  return withInventory(state, clearInventoryItem(state.inventory, source));
}

/**
 * クイックスロットの武器モデルを選択する。
 *
 * @param state 現在の戦闘状態。
 * @param slot 0始まりの選択するクイックスロット。
 * @returns 武器選択と必要なリロード中断を反映した戦闘状態。
 */
export function selectQuickSlot(state: CombatState, slot: number): CombatState {
  if (state.defeated || state.victory || !Number.isInteger(slot) || slot < 0 || slot >= state.inventory.quickSlots.length)
    return state;
  const item = hotbarItemAt(state.inventory, slot);
  if (!item || state.inventory.selectedQuickSlot === slot)
    return state;
  return withInventory(state, { ...state.inventory, selectedQuickSlot: slot });
}

/**
 * 指定modelを持つ最初のクイックスロットを選択する。
 *
 * @param state 現在の戦闘状態。
 * @param model 選択する武器model。
 * @returns 対応するクイックスロットを選択した状態。
 */
export function selectWeapon(state: CombatState, model: WeaponModel): CombatState {
  const slot = state.inventory.quickSlots.findIndex(item => item?.kind === 'weapon' && item.model === model);
  return slot < 0 ? state : selectQuickSlot(state, slot);
}

/**
 * Hotbar itemを連続枠へ格納し、1slot武器だけは満杯時にバックパックへ回す。
 *
 * @param state 現在の戦闘状態。
 * @param item 取得する武器または固定装備。
 * @returns 原子的に全枠を確保できた場合だけ更新した状態。
 */
export function collectHotbarItem(state: CombatState, item: HotbarItem): CombatState {
  if (state.defeated || state.victory)
    return state;
  for (let index = 0; index < state.inventory.quickSlots.length; index += 1) {
    const placed = placeInventoryItem(state.inventory, { container: 'quick', index }, item);
    if (placed)
      return withInventory(state, placed);
  }
  if (item.kind !== 'weapon' || item.slotSpan !== 1 || item.hotbarOnly)
    return state;
  const backpackSlot = state.inventory.backpackSlots.indexOf(null);
  if (backpackSlot < 0)
    return state;
  const placed = placeInventoryItem(state.inventory, { container: 'backpack', index: backpackSlot }, item);
  return placed ? withInventory(state, placed) : state;
}

/**
 * 武器pickupを最初の空きクイックスロット、次にバックパックへ個別に格納する。
 *
 * @param state 現在の戦闘状態。
 * @param weapon 取得する武器個体。
 * @returns 格納結果を反映した戦闘状態。満杯またはterminalなら元の状態。
 */
export function collectWeapon(state: CombatState, weapon: WeaponInstance): CombatState {
  return collectHotbarItem(state, weapon);
}

/**
 * 指定素材を携行上限まで取得し、worldに残す個数を呼出し側へ返す。
 *
 * @param state 現在の戦闘状態。
 * @param material 加算する素材。
 * @param amount 加算する正の安全な整数。
 * @returns 状態と実際に取得した個数。
 */
export function collectMaterialAmount(state: CombatState, material: MaterialId, amount: number): MaterialCollectResult {
  if (state.defeated || state.victory || !Number.isSafeInteger(amount) || amount <= 0)
    return { state, collected: 0 };
  const current = state.inventory.materials[material];
  const collected = Math.min(amount, Math.max(0, MATERIAL_CARRY[material].capacity - current));
  if (collected <= 0)
    return { state, collected: 0 };
  return {
    collected,
    state: {
      ...state,
      inventory: {
        ...state.inventory,
        materials: { ...state.inventory.materials, [material]: current + collected },
      },
    },
  };
}

/**
 * 指定素材を携行上限まで加算する互換入口。
 *
 * @param state 現在の戦闘状態。
 * @param material 加算する素材。
 * @param amount world側が渡す取得候補数。
 * @returns 実際に取得できた個数を反映した状態。
 */
export function collectMaterial(state: CombatState, material: MaterialId, amount: number): CombatState {
  return collectMaterialAmount(state, material, amount).state;
}

/**
 * Inventory、素材、将来Cargoの重量を一度だけ合算する。
 *
 * @param inventory 対象Inventory。
 * @param cargoWeight 将来Cargo側から渡す追加重量。
 * @returns 非負の総重量。
 */
export function inventoryWeight(inventory: InventoryState, cargoWeight = 0): number {
  let weight = Number.isFinite(cargoWeight) ? Math.max(0, cargoWeight) : 0;
  inventory.quickSlots.forEach((slot) => {
    if (!slot || slot.kind === 'continuation')
      return;
    weight += slot.kind === 'weapon' ? WEAPON_WEIGHTS[slot.model] : slot.weight;
  });
  inventory.backpackSlots.forEach((weapon) => {
    if (weapon)
      weight += WEAPON_WEIGHTS[weapon.model];
  });
  (Object.keys(inventory.materials) as MaterialId[]).forEach((material) => {
    weight += inventory.materials[material] * MATERIAL_CARRY[material].unitWeight;
  });
  return weight;
}

/**
 * 指定時刻に現在の武器を発射できるかを判定する。
 *
 * @param state 現在の戦闘状態。
 * @param now 現在時刻。
 * @returns 発射可能なら真。
 */
export function canFireAt(state: CombatState, now: number): boolean {
  const weapon = activeWeapon(state);
  return !state.defeated
    && !state.victory
    && weapon !== null
    && state.reloading === null
    && weapon.magazine > 0
    && now >= weapon.nextFireAt;
}

function inventoryWithActiveWeapon(inventory: InventoryState, weapon: WeaponInstance): InventoryState {
  return replaceHotbarItem(inventory, inventory.selectedQuickSlot, weapon);
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
  const weapon = activeWeapon(state);
  if (!weapon) return { state, fired: false };
  const definition = WEAPONS[weapon.model];
  return {
    fired: true,
    state: {
      ...state,
      inventory: inventoryWithActiveWeapon(state.inventory, {
        ...weapon,
        magazine: weapon.magazine - 1,
        nextFireAt: now + definition.fireIntervalMs,
      }),
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
  const weapon = activeWeapon(state);
  const definition = weapon ? WEAPONS[weapon.model] : undefined;
  if (
    state.defeated
    || state.victory
    || weapon === null
    || definition === undefined
    || state.reloading !== null
    || weapon.magazine >= definition.magazineSize
    || state.inventory.materials[definition.material] < definition.materialCostPerShot
  ) return state;
  return { ...state, reloading: weapon.id };
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
 * 指定個体のリロードを完了し、実際に装填した分だけ素材を消費する。
 *
 * @param state 現在の戦闘状態。
 * @param weaponId 完了対象の武器個体ID。
 * @returns 個別弾倉と素材数を更新した戦闘状態。
 */
export function completeReload(state: CombatState, weaponId: WeaponInstanceId): CombatState {
  const weapon = activeWeapon(state);
  if (
    state.defeated
    || state.victory
    || !weapon
    || state.reloading !== weaponId
    || weapon.id !== weaponId
  ) return state;
  const definition = WEAPONS[weapon.model];
  const materialQuantity = state.inventory.materials[definition.material];
  const availableRounds = Math.floor(materialQuantity / definition.materialCostPerShot);
  const loaded = Math.min(definition.magazineSize - weapon.magazine, availableRounds);
  if (loaded <= 0)
    return { ...state, reloading: null };
  return {
    ...state,
    inventory: {
      ...inventoryWithActiveWeapon(state.inventory, { ...weapon, magazine: weapon.magazine + loaded }),
      materials: {
        ...state.inventory.materials,
        [definition.material]: materialQuantity - loaded * definition.materialCostPerShot,
      },
    },
    reloading: null,
  };
}

/**
 * 弾薬素材ポーチから設定済みの一箱分以下をworldへ出す。
 *
 * @param state 現在の戦闘状態。
 * @param material worldへ置く弾薬素材。
 * @returns 出した個数と更新後の戦闘状態。
 */
export function dropAmmoMaterial(state: CombatState, material: AmmoMaterial): MaterialDropResult {
  if (state.defeated || state.victory)
    return { state, dropped: 0 };
  const dropped = Math.min(state.inventory.materials[material], AMMO_MATERIALS[material].boxQuantity);
  if (dropped <= 0)
    return { state, dropped: 0 };
  return {
    state: {
      ...state,
      inventory: {
        ...state.inventory,
        materials: { ...state.inventory.materials, [material]: state.inventory.materials[material] - dropped },
      },
    },
    dropped,
  };
}

/**
 * Inventory内のScrapを設定単位以下でworld配置候補として取り出す。
 *
 * 実際のstate反映はworld配置成功後に呼出し側が採用する。
 *
 * @param state 現在の戦闘状態。
 * @param maximum 一回で取り出す上限。
 * @returns worldへ出すScrap数と候補state。
 */
export function dropScrapMaterial(
  state: CombatState,
  maximum = SCRAP_PLAYER_DROP_QUANTITY,
): MaterialDropResult {
  if (state.defeated || state.victory)
    return { state, dropped: 0 };
  const normalizedMaximum = Number.isSafeInteger(maximum) ? Math.max(0, maximum) : 0;
  const dropped = Math.min(state.inventory.materials.scrap, normalizedMaximum);
  if (dropped <= 0)
    return { state, dropped: 0 };
  return {
    state: {
      ...state,
      inventory: {
        ...state.inventory,
        materials: { ...state.inventory.materials, scrap: state.inventory.materials.scrap - dropped },
      },
    },
    dropped,
  };
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
 * @param roleId 再挑戦時に選択中のRole ID。
 * @returns RoleのHotbar枠数を反映した独立初期状態。
 */
export function retryCombat(roleId: PlayerRoleId = 'gunner'): CombatState {
  return createInitialCombatState(roleId);
}
