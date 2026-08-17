/** リロードと補給箱で扱う3系統の弾薬素材。 */
export type AmmoMaterial = 'ballistic-material' | 'projectile-material' | 'special-cell';

/** ポーチ表示で安定して並べる弾薬素材の順序。 */
export const AMMO_MATERIAL_ORDER: readonly AmmoMaterial[] = [
  'ballistic-material',
  'projectile-material',
  'special-cell',
];

/** 既存4箱へ割り当てる素材の循環。 */
export const AMMO_MATERIAL_BOX_CYCLE: readonly AmmoMaterial[] = [
  'ballistic-material',
  'ballistic-material',
  'projectile-material',
  'special-cell',
];

/** 所持、world配置、ポーチ表示で共有する弾薬素材設定。 */
export type AmmoMaterialDefinition = {
  label: string;
  icon: string;
  initialQuantity: number;
  boxQuantity: number;
  worldColor: string;
};

/** 試遊用の素材量と見た目を一か所へ集約する。 */
export const AMMO_MATERIALS: Record<AmmoMaterial, AmmoMaterialDefinition> = {
  'ballistic-material': {
    label: '実弾マテリアル',
    icon: '▰',
    initialQuantity: 60,
    boxQuantity: 20,
    worldColor: '#55d6ff',
  },
  'projectile-material': {
    label: '投射マテリアル',
    icon: '➤',
    initialQuantity: 24,
    boxQuantity: 12,
    worldColor: '#d8a8ff',
  },
  'special-cell': {
    label: '特殊セル',
    icon: '▣',
    initialQuantity: 36,
    boxQuantity: 18,
    worldColor: '#ff8f66',
  },
};

/** 所持、world pickup、戦闘設定で扱う武器モデル。 */
export type WeaponModel
  = 'rifle'
    | 'shotgun'
    | 'handgun'
    | 'revolver'
    | 'compact-pistol'
    | 'repeating-crossbow'
    | 'flamethrower';

/** texture生成と設定網羅に使う武器モデルの順序。 */
export const WEAPON_MODEL_ORDER: readonly WeaponModel[] = [
  'rifle',
  'shotgun',
  'handgun',
  'revolver',
  'compact-pistol',
  'repeating-crossbow',
  'flamethrower',
];

/** 敵への倍率解決に渡す攻撃種別。 */
export type DamageType = 'smallCaliber' | 'scatter' | 'flame';

/** 発射と個別弾倉を決める武器モデルの静的設定。 */
export type WeaponDefinition = {
  label: string;
  damageType: DamageType;
  material: AmmoMaterial;
  materialCostPerShot: number;
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
  bulletHitboxScale: number;
  weaponColor: string;
  bulletColor: string;
};

/** 試遊で調整する全武器の静的値。 */
export const WEAPONS: Record<WeaponModel, WeaponDefinition> = {
  'rifle': {
    label: 'アサルトライフル', damageType: 'smallCaliber', material: 'ballistic-material', materialCostPerShot: 1,
    automatic: true, fireIntervalMs: 150, magazineSize: 20, reloadMs: 1200, pellets: 1,
    damage: 2, speed: 600, range: 520, spread: 0, knockback: 0, bulletHitboxScale: 1,
    weaponColor: '#9de9ff', bulletColor: '#55d6ff',
  },
  'shotgun': {
    label: 'ショットガン', damageType: 'scatter', material: 'ballistic-material', materialCostPerShot: 1,
    automatic: false, fireIntervalMs: 750, magazineSize: 4, reloadMs: 1600, pellets: 5,
    damage: 2, speed: 420, range: 220, spread: 0.2, knockback: 240, bulletHitboxScale: 1,
    weaponColor: '#ffef76', bulletColor: '#ffef76',
  },
  'handgun': {
    label: 'ハンドガン', damageType: 'smallCaliber', material: 'ballistic-material', materialCostPerShot: 1,
    automatic: false, fireIntervalMs: 150, magazineSize: 10, reloadMs: 1200, pellets: 1,
    damage: 2, speed: 600, range: 520, spread: 0, knockback: 0, bulletHitboxScale: 1,
    weaponColor: '#9de9ff', bulletColor: '#9de9ff',
  },
  'revolver': {
    label: 'リボルバー', damageType: 'smallCaliber', material: 'ballistic-material', materialCostPerShot: 1,
    automatic: false, fireIntervalMs: 260, magazineSize: 6, reloadMs: 1350, pellets: 1,
    damage: 2, speed: 620, range: 500, spread: 0, knockback: 0, bulletHitboxScale: 1,
    weaponColor: '#ffb476', bulletColor: '#ffb476',
  },
  'compact-pistol': {
    label: 'コンパクトピストル', damageType: 'smallCaliber', material: 'ballistic-material', materialCostPerShot: 1,
    automatic: false, fireIntervalMs: 125, magazineSize: 8, reloadMs: 1050, pellets: 1,
    damage: 2, speed: 580, range: 470, spread: 0, knockback: 0, bulletHitboxScale: 1,
    weaponColor: '#c8b5ff', bulletColor: '#c8b5ff',
  },
  'repeating-crossbow': {
    label: '連弩', damageType: 'smallCaliber', material: 'projectile-material', materialCostPerShot: 1,
    automatic: true, fireIntervalMs: 280, magazineSize: 8, reloadMs: 1450, pellets: 1,
    damage: 3, speed: 480, range: 480, spread: 0, knockback: 35, bulletHitboxScale: 1,
    weaponColor: '#d8a8ff', bulletColor: '#ead6ff',
  },
  'flamethrower': {
    label: '火炎放射器', damageType: 'flame', material: 'special-cell', materialCostPerShot: 1,
    automatic: true, fireIntervalMs: 110, magazineSize: 24, reloadMs: 1650, pellets: 1,
    damage: 1, speed: 300, range: 125, spread: 0.06, knockback: 0, bulletHitboxScale: 4,
    weaponColor: '#ff8f66', bulletColor: '#ffbb75',
  },
};

/** 表示だけを必要とする箇所向けの武器モデル情報。 */
export const WEAPON_MODELS: Record<WeaponModel, { label: string }> = Object.fromEntries(
  WEAPON_MODEL_ORDER.map(model => [model, { label: WEAPONS[model].label }]),
) as Record<WeaponModel, { label: string }>;
