import type { AmmoMaterial, WeaponModel } from './ammo-data';
import type { PlayerRoleId } from './player-data';

/** Scrapと弾薬マテリアルへ共通で適用する重量・携行上限。 */
export type MaterialCarryDefinition = {
  unitWeight: number;
  capacity: number;
};

/** 重量計算で扱う素材の識別子。 */
export type WeightedMaterialId = 'scrap' | AmmoMaterial;

/** 試遊調整する武器個体1件あたりの重量。 */
export const WEAPON_WEIGHTS: Record<WeaponModel, number> = {
  'rifle': 8,
  'shotgun': 10,
  'handgun': 4,
  'revolver': 5,
  'compact-pistol': 3,
  'repeating-crossbow': 7,
  'flamethrower': 14,
};

/** 試遊調整する素材1個あたりの重量と携行上限。 */
export const MATERIAL_CARRY: Record<WeightedMaterialId, MaterialCarryDefinition> = {
  'scrap': { unitWeight: 0.1, capacity: 250 },
  'ballistic-material': { unitWeight: 0.05, capacity: 200 },
  'projectile-material': { unitWeight: 0.08, capacity: 120 },
  'special-cell': { unitWeight: 0.06, capacity: 150 },
};

/** Inventoryからworldへ1回で置くScrapの試遊調整単位。 */
export const SCRAP_PLAYER_DROP_QUANTITY = 10;

/** Role固有補正と重量補正を分離する基礎歩行速度。 */
export const ROLE_BASE_MOVE_SPEED: Record<PlayerRoleId, number> = {
  gunner: 210,
  sniper: 210,
  gunslinger: 210,
  bulwark: 210,
  quartermaster: 210,
};

/** この重量までは歩行速度を落とさない試遊開始値。 */
export const COMFORTABLE_CARRY_WEIGHT = 15;

/** 快適重量を超えた1重量あたりの速度低下率。 */
export const WEIGHT_SPEED_PENALTY_PER_UNIT = 0.01;

/** 重量だけでは下回らない歩行速度倍率。 */
export const MIN_WEIGHT_SPEED_MULTIPLIER = 0.55;

/**
 * 所持重量から歩行速度倍率を導出する。
 *
 * @param totalWeight Inventoryと将来Cargoを含む総重量。
 * @returns 重量だけから決まる最低値以上の速度倍率。
 */
export function weightSpeedMultiplier(totalWeight: number): number {
  const normalizedWeight = Number.isFinite(totalWeight) ? Math.max(0, totalWeight) : 0;
  const excessWeight = Math.max(0, normalizedWeight - COMFORTABLE_CARRY_WEIGHT);
  return Math.max(MIN_WEIGHT_SPEED_MULTIPLIER, 1 - excessWeight * WEIGHT_SPEED_PENALTY_PER_UNIT);
}

/**
 * Role基礎速度と重量補正を合成する。
 *
 * @param roleId 現在のplayer role。
 * @param totalWeight Inventoryと将来Cargoを含む総重量。
 * @returns Role固有buffを含める前の歩行速度。
 */
export function weightedMoveSpeed(roleId: PlayerRoleId, totalWeight: number): number {
  return ROLE_BASE_MOVE_SPEED[roleId] * weightSpeedMultiplier(totalWeight);
}
