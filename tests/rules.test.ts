import { describe, expect, it } from 'vitest';
import {
  ENEMY_INSTANCE_IDS,
  INITIAL_STATE,
  WEAPONS,
  canFireAt,
  completeReload,
  damageEnemy,
  damagePlayer,
  droneLateralSpeedAt,
  fireWeapon,
  isEnemyDefeated,
  resolveDamage,
  respawnEnemy,
  retryCombat,
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
    expect(smallCaliber).toEqual({ amount: 1, resisted: true });
    expect(scatter).toEqual({ amount: 2, resisted: false });
    expect(damageEnemy(INITIAL_STATE, 'drone-1', smallCaliber.amount).enemies['drone-1'].hp).toBe(3);
    expect(damageEnemy(INITIAL_STATE, 'drone-1', scatter.amount).enemies['drone-1'].hp).toBe(2);
  });

  it('ドローン横速度は決定的で複数時刻に応じて変化する', () => {
    expect(droneLateralSpeedAt(100)).toBe(droneLateralSpeedAt(100));
    expect(new Set([droneLateralSpeedAt(0), droneLateralSpeedAt(100), droneLateralSpeedAt(200)])).toHaveLength(3);
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
    expect(completed.reloading).toBeNull();
  });

  it('武器切替はリロードを中断し、残弾を保持する', () => {
    const fired = fireWeapon(selectWeapon(INITIAL_STATE, 'shotgun'), 0).state;
    const reloading = startReload(fired);
    const switched = selectWeapon(reloading, 'rifle');
    expect(switched.reloading).toBeNull();
    expect(switched.ammo.shotgun).toBe(3);
    expect(completeReload(switched, 'shotgun')).toEqual(switched);
  });

  it('4個体のダメージと再出現は対象だけを変更する', () => {
    const damaged = damageEnemy(INITIAL_STATE, 'basic-2', 9);
    expect(ENEMY_INSTANCE_IDS).toHaveLength(4);
    expect(damaged.enemies['basic-2']).toMatchObject({ hp: 0, defeated: true });
    expect(damaged.enemies['basic-1']).toMatchObject({ hp: 6, defeated: false });
    expect(damaged.enemies['basic-3']).toMatchObject({ hp: 6, defeated: false });
    expect(damaged.enemies['drone-1']).toMatchObject({ hp: 4, defeated: false });
    expect(isEnemyDefeated(damaged, 'basic-2')).toBe(true);
    expect(respawnEnemy(damaged, 'basic-2').enemies['basic-2']).toMatchObject({ hp: 6, defeated: false });
  });

  it('プレイヤーへの部分ダメージと致死ダメージを区別する', () => {
    expect(damagePlayer(INITIAL_STATE, 20)).toMatchObject({ playerHp: 80, defeated: false });
    expect(damagePlayer(INITIAL_STATE, 120)).toMatchObject({ playerHp: 0, defeated: true });
  });

  it('再挑戦は武器別残弾、発射待ち、リロード、敵4個体を初期化する', () => {
    const changed = {
      ...fireWeapon(selectWeapon(INITIAL_STATE, 'shotgun'), 100).state,
      reloading: 'shotgun' as const,
    };
    const retried = retryCombat();
    expect(changed).not.toEqual(retried);
    expect(retried).toEqual(INITIAL_STATE);
    expect(retried.ammo).not.toBe(INITIAL_STATE.ammo);
    expect(retried.nextFireAt).not.toBe(INITIAL_STATE.nextFireAt);
    expect(retried.enemies).not.toBe(INITIAL_STATE.enemies);
  });
});
