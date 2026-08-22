/** world上のScrapが発生した経路。 */
export type ScrapOrigin = 'enemy' | 'player' | 'wreck';

/** 同じtileに集約したScrapの由来別数量。 */
export type ScrapOriginQuantities = Record<ScrapOrigin, number>;

/** Scrap山の表示用段階。 */
export type ScrapVisualTier = 'small' | 'medium' | 'large';

/** 敵撃破時に発生するScrapの試遊調整値。 */
export const SCRAP_DROP_AMOUNTS = { basic: 1, drone: 1 } as const;

/** Inventoryからworldへ一回で置くScrapの試遊調整単位。 */
export const SCRAP_PLAYER_DROP_QUANTITY = 10;

/** 一つのtileへ集約できるScrapの試遊調整上限。 */
export const SCRAP_PILE_CAPACITY = 250;

/** Scrap山の見た目を切り替える試遊調整境界。 */
export const SCRAP_VISUAL_TIER_THRESHOLDS = { medium: 3, large: 6 } as const;

/** 一回の共通Scrap Armor作成に必要なScrap。 */
export const SCRAP_ARMOR_COST = 10;

/** 一回の作成で得られるArmor量。 */
export const SCRAP_ARMOR_PER_CRAFT = 25;

/** 共通Scrap Armorの最大値。 */
export const SCRAP_ARMOR_CAPACITY = 100;

/** 装備残骸へ戻る元Scrap費用の割合。 */
export const EQUIPMENT_WRECK_SCRAP_RECOVERY_MULTIPLIER = 0.5;

const SCRAP_COLLECTION_ORIGIN_ORDER: readonly ScrapOrigin[] = ['enemy', 'wreck', 'player'];

/** 由来別数量が0の新しいScrap山を作る。 */
export function createScrapOriginQuantities(): ScrapOriginQuantities {
  return { enemy: 0, player: 0, wreck: 0 };
}

/** 由来別数量からScrap山の合計を返す。 */
export function scrapPileQuantity(origins: ScrapOriginQuantities): number {
  return origins.enemy + origins.player + origins.wreck;
}

/** 将来の敵AIが脅威度へ使う、敵由来だけの残存Scrap量を返す。 */
export function enemyOriginScrapQuantity(origins: ScrapOriginQuantities): number {
  return origins.enemy;
}

/**
 * tile上限まで同じScrap山へ由来を維持して追加する。
 *
 * @param origins 現在の由来別数量。
 * @param origin 追加するScrapの由来。
 * @param quantity 追加候補数。
 * @returns 更新後の由来別数量と実際に追加した数。
 */
export function addScrapToPile(
  origins: ScrapOriginQuantities,
  origin: ScrapOrigin,
  quantity: number,
): { origins: ScrapOriginQuantities; added: number } {
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    return { origins, added: 0 };
  const added = Math.min(quantity, Math.max(0, SCRAP_PILE_CAPACITY - scrapPileQuantity(origins)));
  if (added <= 0)
    return { origins, added: 0 };
  return {
    added,
    origins: { ...origins, [origin]: origins[origin] + added },
  };
}

/**
 * 取得量を敵、残骸、プレイヤー由来の順で決定的に減らす。
 *
 * @param origins 現在の由来別数量。
 * @param quantity 取得候補数。
 * @returns 更新後の由来別数量と実際に取得した数。
 */
export function takeScrapFromPile(
  origins: ScrapOriginQuantities,
  quantity: number,
): { origins: ScrapOriginQuantities; taken: number } {
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    return { origins, taken: 0 };
  const taken = Math.min(quantity, scrapPileQuantity(origins));
  if (taken <= 0)
    return { origins, taken: 0 };
  const next = { ...origins };
  let remaining = taken;
  SCRAP_COLLECTION_ORIGIN_ORDER.forEach((origin) => {
    const amount = Math.min(next[origin], remaining);
    next[origin] -= amount;
    remaining -= amount;
  });
  return { origins: next, taken };
}

/** 装備に使ったScrap費用から残骸として戻る量を決定的に求める。 */
export function equipmentWreckScrapQuantity(scrapCost: number): number {
  return Number.isSafeInteger(scrapCost) && scrapCost > 0
    ? Math.floor(scrapCost * EQUIPMENT_WRECK_SCRAP_RECOVERY_MULTIPLIER)
    : 0;
}

/** 集約済みScrap数量から表示段階を決める。 */
export function scrapVisualTierFor(quantity: number): ScrapVisualTier {
  if (quantity >= SCRAP_VISUAL_TIER_THRESHOLDS.large)
    return 'large';
  if (quantity >= SCRAP_VISUAL_TIER_THRESHOLDS.medium)
    return 'medium';
  return 'small';
}
