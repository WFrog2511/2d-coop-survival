import type { TilePosition } from './arena-map';

export type PickupCandidate = {
  id: string;
  tile: TilePosition;
};

export type PickupAnchor = { x: number; y: number };

export function selectNearbyPickup<T extends PickupCandidate>(
  player: TilePosition,
  anchor: PickupAnchor,
  candidates: readonly T[],
): T | undefined {
  return candidates
    .filter(candidate => Math.abs(candidate.tile.x - player.x) <= 1 && Math.abs(candidate.tile.y - player.y) <= 1)
    .sort((left, right) => {
      const leftAnchorDistance = (left.tile.x + 0.5 - anchor.x) ** 2 + (left.tile.y + 0.5 - anchor.y) ** 2;
      const rightAnchorDistance = (right.tile.x + 0.5 - anchor.x) ** 2 + (right.tile.y + 0.5 - anchor.y) ** 2;
      const leftDistance = (left.tile.x - player.x) ** 2 + (left.tile.y - player.y) ** 2;
      const rightDistance = (right.tile.x - player.x) ** 2 + (right.tile.y - player.y) ** 2;
      return leftAnchorDistance - rightAnchorDistance
        || leftDistance - rightDistance
        || left.tile.y - right.tile.y
        || left.tile.x - right.tile.x
        || left.id.localeCompare(right.id);
    })[0];
}
