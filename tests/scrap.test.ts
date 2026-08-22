import { describe, expect, it } from 'vitest';
import {
  INITIAL_STATE,
  collectMaterial,
  craftScrapArmor,
  damagePlayer,
  retryCombat,
} from '../src/rules';
import {
  SCRAP_ARMOR_COST,
  SCRAP_PILE_CAPACITY,
  addScrapToPile,
  createScrapOriginQuantities,
  enemyOriginScrapQuantity,
  scrapPileQuantity,
  takeScrapFromPile,
} from '../src/scrap-data';

describe('Scrap循環', () => {
  it('同じ山へ由来別に集約し、tile上限を超えた分を生成しない', () => {
    const enemy = addScrapToPile(createScrapOriginQuantities(), 'enemy', 3);
    const player = addScrapToPile(enemy.origins, 'player', SCRAP_PILE_CAPACITY);

    expect(enemy.added).toBe(3);
    expect(enemyOriginScrapQuantity(player.origins)).toBe(enemy.added);
    expect(scrapPileQuantity(player.origins)).toBe(SCRAP_PILE_CAPACITY);
    expect(player.added).toBe(SCRAP_PILE_CAPACITY - enemy.added);
    expect(addScrapToPile(player.origins, 'wreck', 1)).toEqual({
      origins: player.origins,
      added: 0,
    });
  });

  it('部分取得は敵、残骸、プレイヤー由来の順で数量と脅威度を減らす', () => {
    const enemy = addScrapToPile(createScrapOriginQuantities(), 'enemy', 2);
    const wreck = addScrapToPile(enemy.origins, 'wreck', 2);
    const player = addScrapToPile(wreck.origins, 'player', 2);
    const result = takeScrapFromPile(player.origins, 3);

    expect(result.taken).toBe(3);
    expect(result.origins).toEqual({ enemy: 0, wreck: 1, player: 2 });
    expect(scrapPileQuantity(result.origins)).toBe(scrapPileQuantity(player.origins) - result.taken);
    expect(enemyOriginScrapQuantity(result.origins)).toBe(0);
  });

  it('Armor作成はScrap消費と加算を一度に行い、被ダメージはArmorからHPへ貫通する', () => {
    const funded = collectMaterial(INITIAL_STATE, 'scrap', SCRAP_ARMOR_COST);
    const crafted = craftScrapArmor(funded);

    expect(crafted.crafted).toBe(true);
    expect(funded.inventory.materials.scrap - crafted.state.inventory.materials.scrap).toBe(crafted.spent);
    expect(crafted.state.playerArmor - funded.playerArmor).toBe(crafted.armorAdded);

    const overflowDamage = 7;
    const damaged = damagePlayer(crafted.state, crafted.armorAdded + overflowDamage);
    expect(damaged.playerArmor).toBe(0);
    expect(damaged.playerHp).toBe(crafted.state.playerHp - overflowDamage);
    expect(damaged.defeated).toBe(false);

    const terminal = { ...funded, victory: true };
    expect(craftScrapArmor(terminal).state).toBe(terminal);
    expect(retryCombat().playerArmor).toBe(0);
  });
});
