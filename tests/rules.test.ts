import { describe, expect, it } from 'vitest';
import { SCRAP_VISUAL_TIER_THRESHOLDS, scrapVisualTierFor } from '../src/game-data';
import {
  AMMO_BOX_RESPAWN_MS,
  AMMO_TYPES,
  AMMO_TYPE_ORDER,
  BACKPACK_SLOT_COUNT,
  COMBAT_WAVE_DURATION_MS,
  DEFAULT_RUN_SCHEDULE,
  ENEMY_INSTANCE_IDS,
  HANDGUN_AMMO,
  INITIAL_STATE,
  QUICK_SLOT_COUNT,
  REST_DURATION_MS,
  STABLE_ENEMY_SLOT_COUNT,
  SURVIVAL_LIMIT_MS,
  WAVE_COUNT,
  WAVE_DURATION_MS,
  WEAPONS,
  WEAPON_MODELS,
  activeWeaponId,
  activeEnemyCount,
  ammoTypeForWeapon,
  advanceRunState,
  advanceSurvivalState,
  canFireAt,
  collectAmmoBox,
  collectMaterial,
  collectWeapon,
  completeReload,
  createRunSchedule,
  createRunState,
  currentRunPhase,
  currentWaveNumber,
  damageEnemy,
  damagePlayer,
  defeatRun,
  droneLateralSpeedAt,
  enemySpeedMultiplierForPhase,
  fireWeapon,
  hasReachedSurvivalLimit,
  hiddenRecyclePathDistanceForPhase,
  inventoryWeaponAt,
  isEnemyDefeated,
  moveInventoryWeapon,
  recordEnemyDefeated,
  recordEnemyRecycled,
  recordEnemySpawned,
  remainingEnemyCount,
  remainingPhaseMs,
  remainingSurvivalMs,
  remainingWaveMs,
  resolveDamage,
  respawnEnemy,
  retryCombat,
  retryRun,
  removeInventoryWeapon,
  runDurationMs,
  selectWeapon,
  selectQuickSlot,
  startReload,
  weaponIdForModel,
} from '../src/rules';

describe('戦闘ルール', () => {
  it('スクラップ表示tierは調整用の数量境界から決定する', () => {
    expect(scrapVisualTierFor(Math.max(0, SCRAP_VISUAL_TIER_THRESHOLDS.medium - 1))).toBe('small');
    expect(scrapVisualTierFor(SCRAP_VISUAL_TIER_THRESHOLDS.medium)).toBe('medium');
    expect(scrapVisualTierFor(SCRAP_VISUAL_TIER_THRESHOLDS.large)).toBe('large');
  });

  it('武器ごとの射撃、弾倉、リロード、弾種契約を定義する', () => {
    expect(WEAPONS.rifle).toMatchObject({
      damageType: 'smallCaliber',
      damage: 2,
      automatic: true,
      fireIntervalMs: 150,
      magazineSize: 20,
      reserveInitial: 40,
      reserveMax: 60,
      ammoBoxRecovery: 20,
      reloadMs: 1200,
      pellets: 1,
      knockback: 0,
    });
    expect(WEAPONS.shotgun).toMatchObject({
      damageType: 'scatter',
      damage: 2,
      automatic: false,
      fireIntervalMs: 750,
      magazineSize: 4,
      reserveInitial: 8,
      reserveMax: 12,
      ammoBoxRecovery: 4,
      reloadMs: 1600,
      pellets: 5,
      knockback: 240,
    });
    expect(WEAPONS.shotgun.spread).toBeGreaterThan(0);
    expect(WEAPONS.shotgun.range).toBeLessThan(WEAPONS.rifle.range);
    expect(WEAPONS.handgun).toMatchObject({
      damageType: WEAPONS.rifle.damageType,
      damage: WEAPONS.rifle.damage,
      speed: WEAPONS.rifle.speed,
      range: WEAPONS.rifle.range,
      spread: WEAPONS.rifle.spread,
      knockback: WEAPONS.rifle.knockback,
      reloadMs: WEAPONS.rifle.reloadMs,
      automatic: false,
      pellets: 1,
      reserveInitial: HANDGUN_AMMO.reserveInitial,
      reserveMax: HANDGUN_AMMO.reserveMax,
      ammoBoxRecovery: HANDGUN_AMMO.ammoBoxRecovery,
    });
    expect(Object.values(HANDGUN_AMMO).every(amount => amount % WEAPONS.handgun.magazineSize === 0)).toBe(true);
  });

  it('敵種と弾種のダメージ倍率を解決する', () => {
    expect(resolveDamage('basic', 'smallCaliber', 2)).toEqual({ amount: 2, resisted: false });
    expect(resolveDamage('basic', 'scatter', 2)).toEqual({ amount: 2, resisted: false });
    const smallCaliber = resolveDamage('drone', 'smallCaliber', 2);
    const scatter = resolveDamage('drone', 'scatter', 2);
    expect(smallCaliber).toEqual({ amount: 2, resisted: false });
    expect(scatter).toEqual({ amount: 2, resisted: false });
    expect(damageEnemy(INITIAL_STATE, 'drone-1', smallCaliber.amount).enemies['drone-1']).toMatchObject({
      hp: 0,
      defeated: true,
    });
    expect(damageEnemy(INITIAL_STATE, 'drone-1', scatter.amount).enemies['drone-1'].hp).toBe(0);
  });

  it('ドローン横速度は決定的で複数時刻に応じて変化する', () => {
    expect(droneLateralSpeedAt(100)).toBe(droneLateralSpeedAt(100));
    expect(new Set([droneLateralSpeedAt(0), droneLateralSpeedAt(100), droneLateralSpeedAt(200)])).toHaveLength(3);
  });

  it('初回準備を含むrunの残り時間と勝利遷移は境界を含めて判定する', () => {
    const startedAt = 1000;
    expect(AMMO_BOX_RESPAWN_MS).toBe(30000);
    expect(SURVIVAL_LIMIT_MS).toBe(runDurationMs(DEFAULT_RUN_SCHEDULE));
    expect(remainingSurvivalMs(startedAt, startedAt)).toBe(SURVIVAL_LIMIT_MS);
    expect(remainingSurvivalMs(startedAt, startedAt + SURVIVAL_LIMIT_MS - 1)).toBe(1);
    expect(remainingSurvivalMs(startedAt, startedAt + SURVIVAL_LIMIT_MS)).toBe(0);
    expect(hasReachedSurvivalLimit(startedAt, startedAt + SURVIVAL_LIMIT_MS - 1)).toBe(false);
    expect(hasReachedSurvivalLimit(startedAt, startedAt + SURVIVAL_LIMIT_MS)).toBe(true);
    expect(advanceSurvivalState(INITIAL_STATE, startedAt, startedAt + SURVIVAL_LIMIT_MS - 1)).toBe(INITIAL_STATE);
    const victory = advanceSurvivalState(INITIAL_STATE, startedAt, startedAt + SURVIVAL_LIMIT_MS);
    expect(victory).toMatchObject({ victory: true, defeated: false, reloading: null });
    expect(advanceSurvivalState(victory, startedAt, startedAt + SURVIVAL_LIMIT_MS)).toBe(victory);
  });

  it('RunStateは初回準備、3 combat wave、2 restを絶対経過時間から決定的に進める', () => {
    const initial = createRunState();
    const beforeFirstCombat = advanceRunState(initial, REST_DURATION_MS - 1);
    const firstCombat = advanceRunState(initial, REST_DURATION_MS);
    const firstRest = advanceRunState(initial, REST_DURATION_MS + COMBAT_WAVE_DURATION_MS);
    const secondCombat = advanceRunState(initial, REST_DURATION_MS + COMBAT_WAVE_DURATION_MS + REST_DURATION_MS);
    const secondRest = advanceRunState(initial, REST_DURATION_MS + COMBAT_WAVE_DURATION_MS * 2 + REST_DURATION_MS);
    const thirdCombat = advanceRunState(initial, REST_DURATION_MS * 3 + COMBAT_WAVE_DURATION_MS * 2);
    const victory = advanceRunState(initial, SURVIVAL_LIMIT_MS);

    expect(WAVE_COUNT).toBe(3);
    expect(WAVE_DURATION_MS).toBe(COMBAT_WAVE_DURATION_MS);
    expect(runDurationMs(DEFAULT_RUN_SCHEDULE)).toBe(SURVIVAL_LIMIT_MS);
    expect(beforeFirstCombat).toMatchObject({ status: 'playing', elapsedMs: REST_DURATION_MS - 1 });
    expect(currentWaveNumber(beforeFirstCombat)).toBe(1);
    expect(currentRunPhase(beforeFirstCombat)).toBe('preparation');
    expect(remainingPhaseMs(beforeFirstCombat)).toBe(1);
    expect(remainingWaveMs(beforeFirstCombat)).toBe(0);
    expect(firstCombat).toEqual(advanceRunState(beforeFirstCombat, REST_DURATION_MS));
    expect(currentWaveNumber(firstCombat)).toBe(1);
    expect(currentRunPhase(firstCombat)).toBe('combat');
    expect(remainingPhaseMs(firstCombat)).toBe(COMBAT_WAVE_DURATION_MS);
    expect(currentWaveNumber(firstRest)).toBe(1);
    expect(currentRunPhase(firstRest)).toBe('rest');
    expect(remainingPhaseMs(firstRest)).toBe(REST_DURATION_MS);
    expect(remainingWaveMs(firstRest)).toBe(0);
    expect(currentWaveNumber(secondCombat)).toBe(2);
    expect(currentRunPhase(secondCombat)).toBe('combat');
    expect(remainingPhaseMs(secondCombat)).toBe(COMBAT_WAVE_DURATION_MS);
    expect(currentWaveNumber(secondRest)).toBe(2);
    expect(currentRunPhase(secondRest)).toBe('rest');
    expect(currentWaveNumber(thirdCombat)).toBe(3);
    expect(currentRunPhase(thirdCombat)).toBe('combat');
    expect(remainingPhaseMs(thirdCombat)).toBe(COMBAT_WAVE_DURATION_MS);
    expect(victory).toMatchObject({ status: 'victory', elapsedMs: SURVIVAL_LIMIT_MS });
    expect(currentWaveNumber(victory)).toBe(3);
    expect(currentRunPhase(victory)).toBe('combat');
    expect(remainingPhaseMs(victory)).toBe(0);
    expect(remainingWaveMs(victory)).toBe(0);
    expect(advanceRunState(secondCombat, 1)).toBe(secondCombat);
    expect(advanceRunState(victory, SURVIVAL_LIMIT_MS + 1)).toBe(victory);
  });

  it('RunStateは短いDEV schedule、phase別速度、recycle距離を純粋に解決する', () => {
    const schedule = createRunSchedule(1000, 500);
    const { combatWaveDurationMs: combatDurationMs, restDurationMs } = schedule;
    const initial = createRunState(schedule);
    const preparation = advanceRunState(initial, restDurationMs - 1);
    const firstCombat = advanceRunState(initial, restDurationMs);
    const firstRest = advanceRunState(initial, restDurationMs + combatDurationMs);
    const secondCombat = advanceRunState(initial, restDurationMs + combatDurationMs + restDurationMs);
    const secondRest = advanceRunState(initial, restDurationMs + combatDurationMs * 2 + restDurationMs);
    const thirdCombat = advanceRunState(initial, restDurationMs * 3 + combatDurationMs * 2);
    const victory = advanceRunState(initial, runDurationMs(schedule));

    expect(schedule).toEqual({ combatWaveDurationMs: 1000, restDurationMs: 500 });
    expect(runDurationMs(schedule)).toBe(combatDurationMs * WAVE_COUNT + restDurationMs * WAVE_COUNT);
    expect(createRunSchedule(0, Number.NaN)).toEqual(DEFAULT_RUN_SCHEDULE);
    expect(currentRunPhase(preparation)).toBe('preparation');
    expect(remainingPhaseMs(preparation)).toBe(1);
    expect(currentWaveNumber(firstCombat)).toBe(1);
    expect(currentRunPhase(firstCombat)).toBe('combat');
    expect(currentRunPhase(firstRest)).toBe('rest');
    expect(remainingPhaseMs(firstRest)).toBe(restDurationMs);
    expect(currentWaveNumber(secondCombat)).toBe(2);
    expect(currentRunPhase(secondCombat)).toBe('combat');
    expect(currentRunPhase(secondRest)).toBe('rest');
    expect(currentWaveNumber(thirdCombat)).toBe(3);
    expect(currentRunPhase(thirdCombat)).toBe('combat');
    expect(victory.status).toBe('victory');
    expect(enemySpeedMultiplierForPhase('combat')).toBe(1.5);
    expect(enemySpeedMultiplierForPhase('rest')).toBe(0.75);
    expect(hiddenRecyclePathDistanceForPhase('combat')).toBe(10);
    expect(hiddenRecyclePathDistanceForPhase('rest')).toBe(5);
  });

  it('RunStateはspawn、撃破、recycleの実成功を現在敵数、残敵数、撃破数へ反映する', () => {
    let state = createRunState();
    expect(STABLE_ENEMY_SLOT_COUNT).toBe(12);
    expect(activeEnemyCount(state)).toBe(0);
    expect(remainingEnemyCount(state)).toBe(0);

    ENEMY_INSTANCE_IDS.slice(0, 8).forEach((id) => {
      state = recordEnemySpawned(state, id);
    });
    expect(activeEnemyCount(state)).toBe(8);
    expect(remainingEnemyCount(state)).toBe(8);
    expect(state.kills).toBe(0);

    ENEMY_INSTANCE_IDS.slice(8).forEach((id) => {
      state = recordEnemySpawned(state, id);
    });
    expect(activeEnemyCount(state)).toBe(12);
    expect(remainingEnemyCount(state)).toBe(12);

    const defeated = recordEnemyDefeated(state, 'basic-1');
    expect(defeated.enemySlots['basic-1']).toBe('respawning');
    expect(activeEnemyCount(defeated)).toBe(11);
    expect(remainingEnemyCount(defeated)).toBe(11);
    expect(defeated.kills).toBe(1);
    expect(recordEnemyDefeated(defeated, 'basic-1')).toBe(defeated);

    const respawned = recordEnemySpawned(defeated, 'basic-1');
    const recycled = recordEnemyRecycled(respawned, 'drone-1');
    expect(recycled.enemySlots['drone-1']).toBe('recycling');
    expect(activeEnemyCount(recycled)).toBe(11);
    expect(remainingEnemyCount(recycled)).toBe(11);
    expect(recycled.kills).toBe(1);
    const returned = recordEnemySpawned(recycled, 'drone-1');
    expect(activeEnemyCount(returned)).toBe(12);
    expect(remainingEnemyCount(returned)).toBe(12);
    expect(returned.kills).toBe(1);
  });

  it('RunStateのdefeat terminalとretryは時間、敵枠、撃破数を初期化する', () => {
    const schedule = createRunSchedule(1000, 500);
    const active = recordEnemySpawned(createRunState(schedule), 'basic-1');
    const defeated = defeatRun(advanceRunState(recordEnemyDefeated(active, 'basic-1'), 1200));

    expect(defeated).toMatchObject({ status: 'defeat', elapsedMs: 1200, kills: 1 });
    expect(recordEnemySpawned(defeated, 'basic-1')).toBe(defeated);
    expect(recordEnemyRecycled(defeated, 'basic-1')).toBe(defeated);
    expect(advanceRunState(defeated, runDurationMs(schedule))).toBe(defeated);
    expect(retryRun(schedule)).toEqual(createRunState(schedule));
    expect(retryRun(schedule)).not.toBe(createRunState(schedule));
  });

  it('勝利状態は射撃、リロード、被ダメージ、敵、箱取得を無副作用で拒否する', () => {
    const victory = { ...INITIAL_STATE, victory: true, reloading: 'rifle' as const };
    expect(canFireAt(victory, 0)).toBe(false);
    expect(fireWeapon(victory, 0).state).toBe(victory);
    expect(startReload(victory)).toBe(victory);
    expect(completeReload(victory, 'rifle')).toBe(victory);
    expect(selectWeapon(victory, 'shotgun')).toBe(victory);
    expect(damagePlayer(victory, 100)).toBe(victory);
    expect(damageEnemy(victory, 'basic-1', 100)).toBe(victory);
    expect(respawnEnemy(victory, 'basic-1')).toBe(victory);
    expect(collectAmmoBox(victory)).toEqual({ state: victory, collected: false });
    expect(collectWeapon(victory, 'shotgun')).toBe(victory);
    expect(collectMaterial(victory, 'scrap', 1)).toBe(victory);
  });

  it('ライフルは発射時に1発消費し、境界時だけ次弾を許可する', () => {
    const first = fireWeapon(INITIAL_STATE, 100);
    expect(first.fired).toBe(true);
    expect(first.state.ammo.rifle).toBe(19);
    expect(canFireAt(first.state, 249)).toBe(false);
    expect(canFireAt(first.state, 250)).toBe(true);
  });

  it('ショットガンの発射待ち時間は武器切替後も維持する', () => {
    const shotgun = selectWeapon(collectWeapon(INITIAL_STATE, 'shotgun'), 'shotgun');
    const first = fireWeapon(shotgun, 100);
    const switched = selectWeapon(first.state, 'rifle');
    expect(first.state.ammo.shotgun).toBe(3);
    expect(fireWeapon(selectWeapon(switched, 'shotgun'), 849).fired).toBe(false);
    expect(fireWeapon(selectWeapon(switched, 'shotgun'), 850).fired).toBe(true);
  });

  it('空の武器は発射せず、リロード完了で選択武器だけを補充する', () => {
    const emptyRifle = { ...INITIAL_STATE, ammo: { ...INITIAL_STATE.ammo, rifle: 0 } };
    expect(fireWeapon(emptyRifle, 0).fired).toBe(false);
    const reloading = startReload(emptyRifle);
    expect(reloading.reloading).toBe('rifle');
    expect(fireWeapon(reloading, 0).fired).toBe(false);
    const completed = completeReload(reloading, 'rifle');
    expect(completed.ammo.rifle).toBe(WEAPONS.rifle.magazineSize);
    expect(completed.ammo.shotgun).toBe(INITIAL_STATE.ammo.shotgun);
    expect(completed.ammo.handgun).toBe(INITIAL_STATE.ammo.handgun);
    expect(completed.reserve.rifle).toBe(INITIAL_STATE.reserve.rifle - WEAPONS.rifle.magazineSize);
    expect(completed.reserve.shotgun).toBe(INITIAL_STATE.reserve.shotgun);
    expect(completed.reserve.handgun).toBe(INITIAL_STATE.reserve.handgun);
    expect(completed.reloading).toBeNull();
  });
  it('予備弾薬が不足するリロードと共通箱の上限回復を扱う', () => {
    const partial = {
      ...INITIAL_STATE,
      ammo: { ...INITIAL_STATE.ammo, rifle: 12 },
      reserve: { ...INITIAL_STATE.reserve, rifle: 3 },
    };
    const reloading = startReload(partial);
    const completed = completeReload(reloading, 'rifle');
    expect(completed.ammo.rifle).toBe(15);
    expect(completed.reserve.rifle).toBe(0);
    const emptyReserve = {
      ...INITIAL_STATE,
      ammo: { ...INITIAL_STATE.ammo, rifle: 0 },
      reserve: { ...INITIAL_STATE.reserve, rifle: 0 },
    };
    expect(startReload(emptyReserve)).toBe(emptyReserve);
    expect(emptyReserve.reloading).toBeNull();
    expect(completeReload(emptyReserve, 'rifle')).toBe(emptyReserve);
    const box = collectAmmoBox({
      ...INITIAL_STATE,
      reserve: {
        rifle: WEAPONS.rifle.reserveMax - WEAPONS.rifle.ammoBoxRecovery / 2,
        shotgun: WEAPONS.shotgun.reserveMax - WEAPONS.shotgun.ammoBoxRecovery / 2,
        handgun: WEAPONS.handgun.reserveMax,
      },
    });
    expect(box.collected).toBe(true);
    expect(box.state.reserve.rifle).toBe(WEAPONS.rifle.reserveMax);
    expect(box.state.reserve.shotgun).toBe(WEAPONS.shotgun.reserveMax);
    expect(box.state.reserve.handgun).toBe(WEAPONS.handgun.reserveMax);
    const full = collectAmmoBox(box.state);
    expect(full.collected).toBe(false);
    expect(full.state).toBe(box.state);
  });

  it('武器切替はリロードを中断し、残弾を保持する', () => {
    const fired = fireWeapon(selectWeapon(collectWeapon(INITIAL_STATE, 'shotgun'), 'shotgun'), 0).state;
    const reloading = startReload(fired);
    const switched = selectWeapon(reloading, 'rifle');
    expect(switched.reloading).toBeNull();
    expect(switched.ammo.shotgun).toBe(3);
    expect(completeReload(switched, 'shotgun')).toEqual(switched);
  });

  it('同じhandgun WeaponIdのsidearm model切替は共有弾薬とリロードを維持する', () => {
    const sidearms = collectWeapon(collectWeapon(INITIAL_STATE, 'revolver'), 'compact-pistol');
    const revolver = selectQuickSlot(sidearms, 1);
    expect(revolver.weapon).toBe('handgun');
    const fired = fireWeapon(revolver, 0);
    expect(fired.fired).toBe(true);
    const reloading = startReload(fired.state);
    expect(reloading.reloading).toBe('handgun');
    const compactPistol = selectQuickSlot(reloading, 2);
    expect(compactPistol.weapon).toBe(weaponIdForModel('compact-pistol'));
    expect(compactPistol.inventory.selectedQuickSlot).toBe(2);
    expect(compactPistol.ammo.handgun).toBe(reloading.ammo.handgun);
    expect(compactPistol.reserve.handgun).toBe(reloading.reserve.handgun);
    expect(compactPistol.reloading).toBe(reloading.reloading);
    expect(compactPistol.nextFireAt.handgun).toBe(reloading.nextFireAt.handgun);
  });

  it('弾薬種は既存WeaponIdへ一意に対応し、sidearmはhandgun弾薬を共有する', () => {
    const weaponIds = AMMO_TYPE_ORDER.map(type => AMMO_TYPES[type].weapon);
    expect(new Set(weaponIds).size).toBe(Object.keys(WEAPONS).length);
    AMMO_TYPE_ORDER.forEach((type) => {
      expect(ammoTypeForWeapon(AMMO_TYPES[type].weapon)).toBe(type);
    });
    expect(ammoTypeForWeapon(weaponIdForModel('revolver'))).toBe(ammoTypeForWeapon(weaponIdForModel('compact-pistol')));
  });

  it('基本敵9体とドローン3体を初期化し、対象だけへダメージと再出現を適用する', () => {
    const damaged = damageEnemy(INITIAL_STATE, 'basic-2', 9);
    expect(ENEMY_INSTANCE_IDS).toHaveLength(12);
    expect(ENEMY_INSTANCE_IDS.filter(id => id.startsWith('basic-'))).toHaveLength(9);
    expect(ENEMY_INSTANCE_IDS.filter(id => id.startsWith('drone-'))).toHaveLength(3);
    expect(Object.keys(INITIAL_STATE.enemies)).toEqual([...ENEMY_INSTANCE_IDS]);
    expect(damaged.enemies['basic-2']).toMatchObject({ hp: 0, defeated: true });
    expect(damaged.enemies['basic-1']).toMatchObject({ hp: 4, maxHp: 4, defeated: false });
    expect(damaged.enemies['basic-9']).toMatchObject({ kind: 'basic', hp: 4, maxHp: 4, defeated: false });
    expect(damaged.enemies['drone-1']).toMatchObject({ hp: 2, maxHp: 2, defeated: false });
    expect(damaged.enemies['drone-3']).toMatchObject({ kind: 'drone', hp: 2, maxHp: 2, defeated: false });
    expect(isEnemyDefeated(damaged, 'basic-2')).toBe(true);
    expect(respawnEnemy(damaged, 'basic-2').enemies['basic-2']).toMatchObject({ hp: 4, defeated: false });
  });

  it('プレイヤーへの部分ダメージと致死ダメージを区別する', () => {
    expect(damagePlayer(INITIAL_STATE, 20)).toMatchObject({ playerHp: 80, defeated: false });
    expect(damagePlayer(INITIAL_STATE, 120)).toMatchObject({ playerHp: 0, defeated: true });
  });

  it('武器モデルを空きquick slot優先で非stack格納し、slot選択と満杯no-opを保つ', () => {
    expect(INITIAL_STATE.inventory).toEqual({
      quickSlots: ['rifle', null, null],
      backpackSlots: Array(BACKPACK_SLOT_COUNT).fill(null),
      selectedQuickSlot: 0,
      materials: { scrap: 0 },
    });
    expect(selectQuickSlot(INITIAL_STATE, 1)).toBe(INITIAL_STATE);
    const shotgun = collectWeapon(INITIAL_STATE, 'shotgun');
    const revolver = collectWeapon(shotgun, 'revolver');
    const duplicateRevolver = collectWeapon(revolver, 'revolver');
    expect(revolver.inventory.quickSlots).toEqual(['rifle', 'shotgun', 'revolver']);
    expect(duplicateRevolver.inventory.backpackSlots[0]).toBe('revolver');
    expect(weaponIdForModel('revolver')).toBe('handgun');
    expect(weaponIdForModel('compact-pistol')).toBe('handgun');
    const selected = selectQuickSlot(duplicateRevolver, 2);
    expect(selected.weapon).toBe('handgun');
    expect(selected.inventory.selectedQuickSlot).toBe(2);
    expect(selectWeapon(selected, 'shotgun').inventory.selectedQuickSlot).toBe(1);

    const models = Object.keys(WEAPON_MODELS) as (keyof typeof WEAPON_MODELS)[];
    let full = INITIAL_STATE;
    for (let index = 1; index < QUICK_SLOT_COUNT + BACKPACK_SLOT_COUNT; index += 1) {
      const model = models[index % models.length];
      if (!model)
        throw new Error('武器モデル設定が空です。');
      full = collectWeapon(full, model);
    }
    expect(full.inventory.quickSlots).not.toContain(null);
    expect(full.inventory.backpackSlots).not.toContain(null);
    const firstModel = models[0];
    if (!firstModel)
      throw new Error('武器モデル設定が空です。');
    expect(collectWeapon(full, firstModel)).toBe(full);

    const first = collectMaterial(selected, 'scrap', 1);
    const second = collectMaterial(first, 'scrap', 1);
    expect(second.inventory.materials.scrap).toBeGreaterThan(first.inventory.materials.scrap);
    expect(collectMaterial(second, 'scrap', 0)).toBe(second);
  });

  it('詳細インベントリは武器を移動・交換し、空いた選択quick slotを戦闘に使わない', () => {
    const collected = collectWeapon(collectWeapon(collectWeapon(INITIAL_STATE, 'shotgun'), 'revolver'), 'compact-pistol');
    const selected = {
      ...selectQuickSlot(collected, 1),
      ammo: { ...collected.ammo, shotgun: Math.max(0, WEAPONS.shotgun.magazineSize - 1) },
    };
    const reloading = startReload(selected);
    expect(reloading.reloading).toBe('shotgun');

    const moved = moveInventoryWeapon(reloading, { container: 'quick', index: 1 }, { container: 'backpack', index: 1 });
    expect(moved.inventory.selectedQuickSlot).toBe(1);
    expect(inventoryWeaponAt(moved, { container: 'quick', index: 1 })).toBeNull();
    expect(inventoryWeaponAt(moved, { container: 'backpack', index: 1 })).toBe('shotgun');
    expect(moved.weapon).toBeNull();
    expect(moved.reloading).toBeNull();
    expect(activeWeaponId(moved)).toBeNull();

    const staleWeapon = { ...moved, weapon: 'rifle' as const };
    expect(canFireAt(staleWeapon, staleWeapon.nextFireAt.rifle)).toBe(false);
    expect(fireWeapon(staleWeapon, staleWeapon.nextFireAt.rifle)).toEqual({ state: staleWeapon, fired: false });
    expect(startReload(staleWeapon)).toBe(staleWeapon);

    const restored = moveInventoryWeapon(moved, { container: 'backpack', index: 0 }, { container: 'quick', index: 1 });
    expect(restored.inventory.selectedQuickSlot).toBe(1);
    expect(restored.weapon).toBe(weaponIdForModel('compact-pistol'));
    const swapped = moveInventoryWeapon(restored, { container: 'quick', index: 2 }, { container: 'backpack', index: 1 });
    expect(inventoryWeaponAt(swapped, { container: 'quick', index: 2 })).toBe('shotgun');
    expect(inventoryWeaponAt(swapped, { container: 'backpack', index: 1 })).toBe('revolver');
    expect(removeInventoryWeapon(swapped, { container: 'backpack', index: 9 })).toBe(swapped);
  });

  it('再挑戦は所持品、武器別残弾、発射待ち、リロード、敵12個体を初期化する', () => {
    const changed = {
      ...fireWeapon(selectWeapon(collectWeapon(INITIAL_STATE, 'shotgun'), 'shotgun'), 100).state,
      reloading: 'shotgun' as const,
    };
    const retried = retryCombat();
    expect(changed).not.toEqual(retried);
    expect(retried).toEqual(INITIAL_STATE);
    expect(retried.victory).toBe(false);
    expect(retried.inventory).not.toBe(INITIAL_STATE.inventory);
    expect(retried.inventory.quickSlots).not.toBe(INITIAL_STATE.inventory.quickSlots);
    expect(retried.inventory.backpackSlots).not.toBe(INITIAL_STATE.inventory.backpackSlots);
    expect(retried.inventory.materials).not.toBe(INITIAL_STATE.inventory.materials);
    expect(retried.ammo).not.toBe(INITIAL_STATE.ammo);
    expect(retried.reserve).not.toBe(INITIAL_STATE.reserve);
    expect(retried.nextFireAt).not.toBe(INITIAL_STATE.nextFireAt);
    expect(retried.enemies).not.toBe(INITIAL_STATE.enemies);
    ENEMY_INSTANCE_IDS.forEach((id) => {
      expect(retried.enemies[id]).not.toBe(INITIAL_STATE.enemies[id]);
    });
    AMMO_TYPE_ORDER.forEach((type) => {
      const weapon = AMMO_TYPES[type].weapon;
      expect(retried.reserve[weapon]).toBe(INITIAL_STATE.reserve[weapon]);
    });
  });
});
