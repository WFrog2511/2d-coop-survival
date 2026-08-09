import { describe, expect, it } from 'vitest';
import {
  AMMO_BOX_RESPAWN_MS,
  ENEMY_INSTANCE_IDS,
  INITIAL_STATE,
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
  completeReload,
  createRunState,
  currentWaveNumber,
  damageEnemy,
  damagePlayer,
  defeatRun,
  droneLateralSpeedAt,
  fireWeapon,
  hasReachedSurvivalLimit,
  isEnemyDefeated,
  recordEnemyDefeated,
  recordEnemyRecycled,
  recordEnemySpawned,
  remainingEnemyCount,
  remainingSurvivalMs,
  remainingWaveMs,
  resolveDamage,
  respawnEnemy,
  retryCombat,
  retryRun,
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

  it('3分の残り時間と勝利遷移は境界を含めて判定する', () => {
    const startedAt = 1000;
    expect(SURVIVAL_LIMIT_MS).toBe(180000);
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

  it('RunStateは3つの60秒waveを絶対経過時間から決定的に進める', () => {
    const initial = createRunState();
    const beforeFirstBoundary = advanceRunState(initial, WAVE_DURATION_MS - 1);
    const secondWave = advanceRunState(initial, WAVE_DURATION_MS);
    const thirdWave = advanceRunState(initial, WAVE_DURATION_MS * 2);
    const victory = advanceRunState(initial, SURVIVAL_LIMIT_MS);

    expect(WAVE_COUNT).toBe(3);
    expect(WAVE_DURATION_MS).toBe(60000);
    expect(beforeFirstBoundary).toMatchObject({ status: 'playing', elapsedMs: 59999 });
    expect(currentWaveNumber(beforeFirstBoundary)).toBe(1);
    expect(remainingWaveMs(beforeFirstBoundary)).toBe(1);
    expect(secondWave).toEqual(advanceRunState(beforeFirstBoundary, WAVE_DURATION_MS));
    expect(currentWaveNumber(secondWave)).toBe(2);
    expect(remainingWaveMs(secondWave)).toBe(WAVE_DURATION_MS);
    expect(currentWaveNumber(thirdWave)).toBe(3);
    expect(remainingWaveMs(thirdWave)).toBe(WAVE_DURATION_MS);
    expect(victory).toMatchObject({ status: 'victory', elapsedMs: SURVIVAL_LIMIT_MS });
    expect(currentWaveNumber(victory)).toBe(3);
    expect(remainingWaveMs(victory)).toBe(0);
    expect(advanceRunState(secondWave, 1)).toBe(secondWave);
    expect(advanceRunState(victory, SURVIVAL_LIMIT_MS + 1)).toBe(victory);
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
    const active = recordEnemySpawned(createRunState(), 'basic-1');
    const defeated = defeatRun(advanceRunState(recordEnemyDefeated(active, 'basic-1'), 1200));

    expect(defeated).toMatchObject({ status: 'defeat', elapsedMs: 1200, kills: 1 });
    expect(recordEnemySpawned(defeated, 'basic-1')).toBe(defeated);
    expect(recordEnemyRecycled(defeated, 'basic-1')).toBe(defeated);
    expect(advanceRunState(defeated, SURVIVAL_LIMIT_MS)).toBe(defeated);
    expect(retryRun()).toEqual(createRunState());
    expect(retryRun()).not.toBe(createRunState());
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
  });

  it('ライフルは発射時に1発消費し、境界時だけ次弾を許可する', () => {
    const first = fireWeapon(INITIAL_STATE, 100);
    expect(first.fired).toBe(true);
    expect(first.state.ammo.rifle).toBe(19);
    expect(canFireAt(first.state, 249)).toBe(false);
    expect(canFireAt(first.state, 250)).toBe(true);
  });

  it('ショットガンの発射待ち時間は武器切替後も維持する', () => {
    const shotgun = selectWeapon(INITIAL_STATE, 'shotgun');
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
    const fired = fireWeapon(selectWeapon(INITIAL_STATE, 'shotgun'), 0).state;
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

  it('再挑戦は武器別残弾、発射待ち、リロード、敵12個体を初期化する', () => {
    const changed = {
      ...fireWeapon(selectWeapon(INITIAL_STATE, 'shotgun'), 100).state,
      reloading: 'shotgun' as const,
    };
    const retried = retryCombat();
    expect(changed).not.toEqual(retried);
    expect(retried).toEqual(INITIAL_STATE);
    expect(retried.victory).toBe(false);
    expect(retried.ammo).not.toBe(INITIAL_STATE.ammo);
    expect(retried.nextFireAt).not.toBe(INITIAL_STATE.nextFireAt);
    expect(retried.enemies).not.toBe(INITIAL_STATE.enemies);
    ENEMY_INSTANCE_IDS.forEach((id) => {
      expect(retried.enemies[id]).not.toBe(INITIAL_STATE.enemies[id]);
    });
  });
});
