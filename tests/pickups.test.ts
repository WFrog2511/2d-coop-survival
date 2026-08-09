import { describe, expect, test } from 'vitest';
import { selectNearbyPickup } from '../src/pickups';

describe('近傍pickup選択', () => {
  test('3x3近傍だけから最も近いpickupを選ぶ', () => {
    const player = { x: 10, y: 10 };
    const selected = selectNearbyPickup(player, { x: 10.5, y: 10.5 }, [
      { id: 'far', tile: { x: 12, y: 10 } },
      { id: 'diagonal', tile: { x: 11, y: 11 } },
      { id: 'same', tile: { x: 10, y: 10 } },
    ]);

    expect(selected?.id).toBe('same');
  });

  test('同距離の候補は座標とIDで決定的に選ぶ', () => {
    const selected = selectNearbyPickup({ x: 4, y: 4 }, { x: 4.5, y: 4.5 }, [
      { id: 'right', tile: { x: 5, y: 4 } },
      { id: 'upper-b', tile: { x: 4, y: 3 } },
      { id: 'upper-a', tile: { x: 4, y: 3 } },
    ]);

    expect(selected?.id).toBe('upper-a');
  });

  test('3x3外だけなら未選択にする', () => {
    expect(selectNearbyPickup({ x: 2, y: 2 }, { x: 2.5, y: 2.5 }, [
      { id: 'far-x', tile: { x: 4, y: 2 } },
      { id: 'far-y', tile: { x: 2, y: 0 } },
    ])).toBeUndefined();
  });

  test('照準側のmuzzle anchorに近い左右候補を優先する', () => {
    const selected = selectNearbyPickup({ x: 4, y: 4 }, { x: 4.9, y: 4.5 }, [
      { id: 'left', tile: { x: 3, y: 4 } },
      { id: 'right', tile: { x: 5, y: 4 } },
    ]);

    expect(selected?.id).toBe('right');
  });
});
