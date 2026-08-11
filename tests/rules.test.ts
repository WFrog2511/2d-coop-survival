import { describe, expect, it } from 'vitest';
import {
  AMMO_BOX_RESPAWN_MS,
  COMBAT_WAVE_DURATION_MS,
  DEFAULT_RUN_SCHEDULE,
  ENEMY_INSTANCE_IDS,
  INITIAL_STATE,
  REST_DURATION_MS,
  STABLE_ENEMY_SLOT_COUNT,
  SURVIVAL_LIMIT_MS,
  WAVE_COUNT,
  WAVE_DURATION_MS,
  WEAPONS,
  activeEnemyCount,
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
  isEnemyDefeated,
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
  runDurationMs,
  selectWeapon,
  startReload,
} from '../src/rules';

describe('戦闘ルール', () => {
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

  it('9分30秒の残り時間と勝利遷移は境界を含めて判定する', () => {
    const startedAt = 1000;
    expect(SURVIVAL_LIMIT_MS).toBe(570000);
    expect(AMMO_BOX_RESPAWN_MS).toBe(30000);
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

  it('RunStateは3 combat waveと2 restを絶対経過時間から決定的に進める', () => {
    const initial = createRunState();
    const beforeFirstRest = advanceRunState(initial, COMBAT_WAVE_DURATION_MS - 1);
    const firstRest = advanceRunState(initial, COMBAT_WAVE_DURATION_MS);
    const secondCombat = advanceRunState(initial, COMBAT_WAVE_DURATION_MS + REST_DURATION_MS);
    const secondRest = advanceRunState(initial, COMBAT_WAVE_DURATION_MS * 2 + REST_DURATION_MS);
    const thirdCombat = advanceRunState(initial, (COMBAT_WAVE_DURATION_MS + REST_DURATION_MS) * 2);
    const victory = advanceRunState(initial, SURVIVAL_LIMIT_MS);

    expect(WAVE_COUNT).toBe(3);
    expect(WAVE_DURATION_MS).toBe(COMBAT_WAVE_DURATION_MS);
    expect(COMBAT_WAVE_DURATION_MS).toBe(150000);
    expect(REST_DURATION_MS).toBe(60000);
    expect(runDurationMs(DEFAULT_RUN_SCHEDULE)).toBe(SURVIVAL_LIMIT_MS);
    expect(beforeFirstRest).toMatchObject({ status: 'playing', elapsedMs: 149999 });
    expect(currentWaveNumber(beforeFirstRest)).toBe(1);
    expect(currentRunPhase(beforeFirstRest)).toBe('combat');
    expect(remainingPhaseMs(beforeFirstRest)).toBe(1);
    expect(remainingWaveMs(beforeFirstRest)).toBe(1);
    expect(firstRest).toEqual(advanceRunState(beforeFirstRest, COMBAT_WAVE_DURATION_MS));
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
    const initial = createRunState(schedule);
    const firstRest = advanceRunState(initial, 1000);
    const secondCombat = advanceRunState(initial, 1500);
    const secondRest = advanceRunState(initial, 2500);
    const thirdCombat = advanceRunState(initial, 3000);
    const victory = advanceRunState(initial, 4000);

    expect(schedule).toEqual({ combatWaveDurationMs: 1000, restDurationMs: 500 });
    expect(runDurationMs(schedule)).toBe(4000);
    expect(createRunSchedule(0, Number.NaN)).toEqual(DEFAULT_RUN_SCHEDULE);
    expect(currentRunPhase(firstRest)).toBe('rest');
    expect(remainingPhaseMs(firstRest)).toBe(500);
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
    expect(completed.ammo).toEqual({ rifle: 20, shotgun: 4 });
    expect(completed.reserve).toEqual({ rifle: 20, shotgun: 8 });
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
      reserve: { rifle: 50, shotgun: 10 },
    });
    expect(box.collected).toBe(true);
    expect(box.state.reserve).toEqual({ rifle: 60, shotgun: 12 });
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

  it('未所持武器を選択せず、武器と素材の取得だけを所持品へ反映する', () => {
    expect(INITIAL_STATE.inventory).toEqual({
      ownedWeapons: { rifle: true, shotgun: false },
      materials: { scrap: 0 },
    });
    expect(selectWeapon(INITIAL_STATE, 'shotgun')).toBe(INITIAL_STATE);
    const collected = collectWeapon(INITIAL_STATE, 'shotgun');
    expect(collected.inventory.ownedWeapons.shotgun).toBe(true);
    expect(collectWeapon(collected, 'shotgun')).toBe(collected);
    const selected = selectWeapon(collected, 'shotgun');
    expect(selected.weapon).toBe('shotgun');
    const first = collectMaterial(selected, 'scrap', 1);
    const second = collectMaterial(first, 'scrap', 1);
    expect(second.inventory.materials.scrap).toBeGreaterThan(first.inventory.materials.scrap);
    expect(collectMaterial(second, 'scrap', 0)).toBe(second);
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
    expect(retried.inventory.ownedWeapons).not.toBe(INITIAL_STATE.inventory.ownedWeapons);
    expect(retried.inventory.materials).not.toBe(INITIAL_STATE.inventory.materials);
    expect(retried.ammo).not.toBe(INITIAL_STATE.ammo);
    expect(retried.nextFireAt).not.toBe(INITIAL_STATE.nextFireAt);
    expect(retried.enemies).not.toBe(INITIAL_STATE.enemies);
    ENEMY_INSTANCE_IDS.forEach((id) => {
      expect(retried.enemies[id]).not.toBe(INITIAL_STATE.enemies[id]);
    });
  });
});
