import { describe, expect, it } from 'vitest';
import { SCRAP_VISUAL_TIER_THRESHOLDS, scrapVisualTierFor } from '../src/game-data';
import {
  AMMO_BOX_RESPAWN_MS,
  BACKPACK_SLOT_COUNT,
  COMBAT_WAVE_DURATION_MS,
  DEFAULT_RUN_SCHEDULE,
  ENEMY_INSTANCE_IDS,
  INITIAL_STATE,
  QUICK_SLOT_COUNT,
  REST_DURATION_MS,
  STABLE_ENEMY_SLOT_COUNT,
  SURVIVAL_LIMIT_MS,
  WAVE_COUNT,
  WAVE_DURATION_MS,
  AMMO_MATERIAL_ORDER,
  AMMO_MATERIALS,
  WEAPONS,
  WEAPON_MODEL_ORDER,
  activeWeapon,
  activeEnemyCount,
  advanceRunState,
  advanceSurvivalState,
  canFireAt,
  collectMaterial,
  collectWeapon,
  completeReload,
  createRunSchedule,
  createRunState,
  createWeaponInstance,
  currentRunPhase,
  currentWaveNumber,
  damageEnemy,
  damagePlayer,
  defeatRun,
  dropAmmoMaterial,
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
  type CombatState,
} from '../src/rules';

describe('戦闘ルール', () => {
  it('スクラップ表示tierは調整用の数量境界から決定する', () => {
    expect(scrapVisualTierFor(Math.max(0, SCRAP_VISUAL_TIER_THRESHOLDS.medium - 1))).toBe('small');
    expect(scrapVisualTierFor(SCRAP_VISUAL_TIER_THRESHOLDS.medium)).toBe('medium');
    expect(scrapVisualTierFor(SCRAP_VISUAL_TIER_THRESHOLDS.large)).toBe('large');
  });

  it('7武器modelを3マテリアルへ対応付け、連弩と火炎放射器を連射可能にする', () => {
    expect(WEAPON_MODEL_ORDER).toHaveLength(7);
    expect(AMMO_MATERIAL_ORDER).toHaveLength(3);
    expect(WEAPON_MODEL_ORDER.every(model => WEAPONS[model].material in AMMO_MATERIALS)).toBe(true);
    expect(WEAPON_MODEL_ORDER.filter(model => WEAPONS[model].material === 'ballistic-material')).toHaveLength(5);
    expect(WEAPONS['repeating-crossbow']).toMatchObject({ material: 'projectile-material', automatic: true });
    expect(WEAPONS.flamethrower).toMatchObject({ material: 'special-cell', automatic: true });
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
    const weapon = activeWeapon(INITIAL_STATE);
    if (!weapon)
      throw new Error('初期weaponが必要です。');
    const victory = { ...INITIAL_STATE, victory: true, reloading: weapon.id };
    expect(canFireAt(victory, 0)).toBe(false);
    expect(fireWeapon(victory, 0).state).toBe(victory);
    expect(startReload(victory)).toBe(victory);
    expect(completeReload(victory, weapon.id)).toBe(victory);
    expect(selectWeapon(victory, 'shotgun')).toBe(victory);
    expect(damagePlayer(victory, 100)).toBe(victory);
    expect(damageEnemy(victory, 'basic-1', 100)).toBe(victory);
    expect(respawnEnemy(victory, 'basic-1')).toBe(victory);
    AMMO_MATERIAL_ORDER.forEach((material) => {
      expect(dropAmmoMaterial(victory, material)).toEqual({ state: victory, dropped: 0 });
      expect(collectMaterial(victory, material, AMMO_MATERIALS[material].boxQuantity)).toBe(victory);
    });
    expect(collectWeapon(victory, createWeaponInstance('victory-shotgun', 'shotgun'))).toBe(victory);
    expect(collectMaterial(victory, 'scrap', 1)).toBe(victory);
  });

  it('ライフルは発射時に1発消費し、境界時だけ次弾を許可する', () => {
    const initialWeapon = activeWeapon(INITIAL_STATE);
    if (!initialWeapon)
      throw new Error('初期weaponが必要です。');
    const first = fireWeapon(INITIAL_STATE, 100);
    const firedWeapon = activeWeapon(first.state);
    if (!firedWeapon)
      throw new Error('発射後weaponが必要です。');
    expect(first.fired).toBe(true);
    expect(firedWeapon.magazine).toBe(initialWeapon.magazine - 1);
    expect(canFireAt(first.state, firedWeapon.nextFireAt - 1)).toBe(false);
    expect(canFireAt(first.state, firedWeapon.nextFireAt)).toBe(true);
  });

  it('同model複数個体は弾倉と射撃待ちを共有しない', () => {
    const firstInstance = createWeaponInstance('revolver-a', 'revolver');
    const secondInstance = createWeaponInstance('revolver-b', 'revolver');
    const paired = collectWeapon(collectWeapon(INITIAL_STATE, firstInstance), secondInstance);
    const first = fireWeapon(selectQuickSlot(paired, 1), 100);
    const firedFirst = activeWeapon(first.state);
    if (!firedFirst)
      throw new Error('1個目のweaponが必要です。');
    const secondSelected = selectQuickSlot(first.state, 2);
    const secondBeforeFire = activeWeapon(secondSelected);
    if (!secondBeforeFire)
      throw new Error('2個目のweaponが必要です。');
    expect(secondBeforeFire.id).toBe(secondInstance.id);
    expect(secondBeforeFire.magazine).toBe(secondInstance.magazine);
    expect(canFireAt(secondSelected, 100)).toBe(true);
    const second = fireWeapon(secondSelected, 100);
    const firstSelected = selectQuickSlot(second.state, 1);
    expect(canFireAt(firstSelected, firedFirst.nextFireAt - 1)).toBe(false);
    expect(canFireAt(firstSelected, firedFirst.nextFireAt)).toBe(true);
  });

  it('空の武器は発射せず、reload完了時だけ対応マテリアルを消費する', () => {
    const rifle = activeWeapon(INITIAL_STATE);
    if (!rifle)
      throw new Error('初期weaponが必要です。');
    const definition = WEAPONS[rifle.model];
    const emptyRifle: CombatState = {
      ...INITIAL_STATE,
      inventory: {
        ...INITIAL_STATE.inventory,
        quickSlots: [{ ...rifle, magazine: 0 }, null, null],
      },
    };
    expect(fireWeapon(emptyRifle, 0).fired).toBe(false);
    const reloading = startReload(emptyRifle);
    expect(reloading.reloading).toBe(rifle.id);
    expect(fireWeapon(reloading, 0).fired).toBe(false);
    const completed = completeReload(reloading, rifle.id);
    const reloaded = activeWeapon(completed);
    if (!reloaded)
      throw new Error('reload後weaponが必要です。');
    expect(reloaded.magazine).toBe(definition.magazineSize);
    expect(completed.inventory.materials[definition.material]).toBe(
      emptyRifle.inventory.materials[definition.material] - definition.magazineSize * definition.materialCostPerShot,
    );
    expect(completed.reloading).toBeNull();
  });
  it('マテリアル不足時はpartial reloadし、完了callbackを二重実行しても二重消費しない', () => {
    const rifle = activeWeapon(INITIAL_STATE);
    if (!rifle)
      throw new Error('初期weaponが必要です。');
    const definition = WEAPONS[rifle.model];
    const availableRounds = 2;
    const materialQuantity = definition.materialCostPerShot * availableRounds + definition.materialCostPerShot - 1;
    const partial: CombatState = {
      ...INITIAL_STATE,
      inventory: {
        ...INITIAL_STATE.inventory,
        quickSlots: [{ ...rifle, magazine: Math.max(0, definition.magazineSize - availableRounds - 1) }, null, null],
        materials: { ...INITIAL_STATE.inventory.materials, [definition.material]: materialQuantity },
      },
    };
    const before = activeWeapon(partial);
    if (!before)
      throw new Error('partial reload前weaponが必要です。');
    const reloading = startReload(partial);
    expect(reloading.inventory.materials[definition.material]).toBe(materialQuantity);
    const completed = completeReload(reloading, before.id);
    const reloaded = activeWeapon(completed);
    if (!reloaded)
      throw new Error('partial reload後weaponが必要です。');
    const loaded = Math.floor(materialQuantity / definition.materialCostPerShot);
    expect(reloaded.magazine).toBe(before.magazine + loaded);
    expect(completed.inventory.materials[definition.material]).toBe(materialQuantity - loaded * definition.materialCostPerShot);
    expect(completeReload(completed, before.id)).toBe(completed);

    AMMO_MATERIAL_ORDER.forEach((material) => {
      const dropped = dropAmmoMaterial(INITIAL_STATE, material);
      expect(dropped.dropped).toBeGreaterThan(0);
      expect(dropped.state.inventory.materials[material]).toBe(INITIAL_STATE.inventory.materials[material] - dropped.dropped);
      const empty: CombatState = {
        ...INITIAL_STATE,
        inventory: {
          ...INITIAL_STATE.inventory,
          materials: { ...INITIAL_STATE.inventory.materials, [material]: 0 },
        },
      };
      expect(dropAmmoMaterial(empty, material)).toEqual({ state: empty, dropped: 0 });
    });
  });

  it('武器切替はリロードを中断し、残弾を保持する', () => {
    const shotgun = createWeaponInstance('switch-shotgun', 'shotgun', WEAPONS.shotgun.magazineSize - 1);
    const reloading = startReload(selectQuickSlot(collectWeapon(INITIAL_STATE, shotgun), 1));
    const switched = selectWeapon(reloading, 'rifle');
    expect(switched.reloading).toBeNull();
    expect(inventoryWeaponAt(switched, { container: 'quick', index: 1 })).toMatchObject({
      id: shotgun.id,
      magazine: shotgun.magazine,
    });
    expect(completeReload(switched, shotgun.id)).toEqual(switched);
  });

  it('同modelのreloadは個体IDごとに完了対象を限定する', () => {
    const first = createWeaponInstance('reload-revolver-a', 'revolver', WEAPONS.revolver.magazineSize - 1);
    const second = createWeaponInstance('reload-revolver-b', 'revolver', WEAPONS.revolver.magazineSize - 1);
    const paired = collectWeapon(collectWeapon(INITIAL_STATE, first), second);
    const firstReload = startReload(selectQuickSlot(paired, 1));
    expect(firstReload.reloading).toBe(first.id);
    const secondSelected = selectQuickSlot(firstReload, 2);
    expect(secondSelected.reloading).toBeNull();
    const secondReload = startReload(secondSelected);
    expect(secondReload.reloading).toBe(second.id);
    expect(completeReload(secondReload, first.id)).toBe(secondReload);
    const completed = completeReload(secondReload, second.id);
    expect(inventoryWeaponAt(completed, { container: 'quick', index: 1 })).toMatchObject({
      id: first.id,
      magazine: first.magazine,
    });
    expect(inventoryWeaponAt(completed, { container: 'quick', index: 2 })).toMatchObject({
      id: second.id,
      magazine: WEAPONS.revolver.magazineSize,
    });
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
    expect(activeWeapon(INITIAL_STATE)).toMatchObject({ model: 'rifle' });
    expect(INITIAL_STATE.inventory.backpackSlots).toEqual(Array(BACKPACK_SLOT_COUNT).fill(null));
    expect(selectQuickSlot(INITIAL_STATE, 1)).toBe(INITIAL_STATE);
    const shotgun = collectWeapon(INITIAL_STATE, createWeaponInstance('inventory-shotgun', 'shotgun'));
    const revolver = collectWeapon(shotgun, createWeaponInstance('inventory-revolver-a', 'revolver'));
    const duplicateRevolver = collectWeapon(revolver, createWeaponInstance('inventory-revolver-b', 'revolver'));
    expect(revolver.inventory.quickSlots.map(weapon => weapon?.model)).toEqual(['rifle', 'shotgun', 'revolver']);
    expect(duplicateRevolver.inventory.backpackSlots[0]).toMatchObject({ id: 'inventory-revolver-b', model: 'revolver' });
    const selected = selectQuickSlot(duplicateRevolver, 2);
    expect(activeWeapon(selected)).toMatchObject({ model: 'revolver' });
    expect(selected.inventory.selectedQuickSlot).toBe(2);
    expect(selectWeapon(selected, 'shotgun').inventory.selectedQuickSlot).toBe(1);

    const models = WEAPON_MODEL_ORDER;
    let full = INITIAL_STATE;
    for (let index = 1; index < QUICK_SLOT_COUNT + BACKPACK_SLOT_COUNT; index += 1) {
      const model = models[index % models.length];
      if (!model)
        throw new Error('武器モデル設定が空です。');
      full = collectWeapon(full, createWeaponInstance(`full-${index}`, model));
    }
    expect(full.inventory.quickSlots).not.toContain(null);
    expect(full.inventory.backpackSlots).not.toContain(null);
    const firstModel = models[0];
    if (!firstModel)
      throw new Error('武器モデル設定が空です。');
    expect(collectWeapon(full, createWeaponInstance('full-extra', firstModel))).toBe(full);

    const first = collectMaterial(selected, 'scrap', 1);
    const second = collectMaterial(first, 'scrap', 1);
    expect(second.inventory.materials.scrap).toBeGreaterThan(first.inventory.materials.scrap);
    expect(collectMaterial(second, 'scrap', 0)).toBe(second);
  });

  it('詳細インベントリは武器を移動・交換し、空いた選択quick slotを戦闘に使わない', () => {
    const shotgun = createWeaponInstance('move-shotgun', 'shotgun', WEAPONS.shotgun.magazineSize - 1);
    const collected = collectWeapon(
      collectWeapon(
        collectWeapon(INITIAL_STATE, shotgun),
        createWeaponInstance('move-revolver', 'revolver'),
      ),
      createWeaponInstance('move-compact', 'compact-pistol'),
    );
    const selected = selectQuickSlot(collected, 1);
    const reloading = startReload(selected);
    expect(reloading.reloading).toBe(shotgun.id);

    const moved = moveInventoryWeapon(reloading, { container: 'quick', index: 1 }, { container: 'backpack', index: 1 });
    expect(moved.inventory.selectedQuickSlot).toBe(1);
    expect(inventoryWeaponAt(moved, { container: 'quick', index: 1 })).toBeNull();
    expect(inventoryWeaponAt(moved, { container: 'backpack', index: 1 })).toMatchObject({ id: shotgun.id, model: 'shotgun' });
    expect(moved.reloading).toBeNull();
    expect(activeWeapon(moved)).toBeNull();

    expect(canFireAt(moved, 0)).toBe(false);
    expect(fireWeapon(moved, 0)).toEqual({ state: moved, fired: false });
    expect(startReload(moved)).toBe(moved);

    const restored = moveInventoryWeapon(moved, { container: 'backpack', index: 0 }, { container: 'quick', index: 1 });
    expect(restored.inventory.selectedQuickSlot).toBe(1);
    expect(activeWeapon(restored)).toMatchObject({ model: 'compact-pistol' });
    const swapped = moveInventoryWeapon(restored, { container: 'quick', index: 2 }, { container: 'backpack', index: 1 });
    expect(inventoryWeaponAt(swapped, { container: 'quick', index: 2 })).toMatchObject({ id: shotgun.id, model: 'shotgun' });
    expect(inventoryWeaponAt(swapped, { container: 'backpack', index: 1 })).toMatchObject({ model: 'revolver' });
    expect(removeInventoryWeapon(swapped, { container: 'backpack', index: 9 })).toBe(swapped);
  });

  it('world drop後の再取得は同じweapon個体と装填済み弾を保持する', () => {
    const droppedWeapon = createWeaponInstance('drop-revolver', 'revolver', WEAPONS.revolver.magazineSize - 1, 345);
    const carried = collectWeapon(INITIAL_STATE, droppedWeapon);
    const beforeDrop = inventoryWeaponAt(carried, { container: 'quick', index: 1 });
    if (!beforeDrop)
      throw new Error('drop前weaponが必要です。');
    const removed = removeInventoryWeapon(carried, { container: 'quick', index: 1 });
    const repicked = collectWeapon(removed, beforeDrop);
    expect(inventoryWeaponAt(repicked, { container: 'quick', index: 1 })).toEqual(beforeDrop);
  });

  it('再挑戦は所持品、個別弾倉、発射待ち、リロード、敵12個体を初期化する', () => {
    const changed = startReload(fireWeapon(INITIAL_STATE, 100).state);
    const retried = retryCombat();
    expect(changed).not.toEqual(retried);
    expect(retried).toEqual(INITIAL_STATE);
    expect(retried.victory).toBe(false);
    expect(retried.inventory).not.toBe(INITIAL_STATE.inventory);
    expect(retried.inventory.quickSlots).not.toBe(INITIAL_STATE.inventory.quickSlots);
    expect(retried.inventory.backpackSlots).not.toBe(INITIAL_STATE.inventory.backpackSlots);
    expect(retried.inventory.materials).not.toBe(INITIAL_STATE.inventory.materials);
    expect(retried.inventory.quickSlots[0]).not.toBe(INITIAL_STATE.inventory.quickSlots[0]);
    expect(retried.enemies).not.toBe(INITIAL_STATE.enemies);
    ENEMY_INSTANCE_IDS.forEach((id) => {
      expect(retried.enemies[id]).not.toBe(INITIAL_STATE.enemies[id]);
    });
  });
});
