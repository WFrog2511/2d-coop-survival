import type { ArenaTerrain, CentralReserve, Tile, TilePosition } from './arena-map';

/** 実行中の地形だけを保持する、生成metadataから分離したsnapshot。 */
export type RuntimeTopology = Readonly<{
  width: number;
  height: number;
  tileSize: number;
  tiles: readonly (readonly Tile[])[];
  revision: number;
}>;

/** 一つのtileを指定値へ置き換えるatomic batchの入力。 */
export type RuntimeTopologyMutation = TilePosition & { tile: Tile };

/**
 * 生成済みアリーナから、run専用の独立した地形snapshotを作る。
 *
 * @param map 複製元となる地形構造。
 * @returns revision 0で、tile配列を深く複製したruntime topology。
 */
export function createRuntimeTopology(map: ArenaTerrain): RuntimeTopology {
  return {
    width: map.width,
    height: map.height,
    tileSize: map.tileSize,
    tiles: map.tiles.map(row => [...row]),
    revision: 0,
  };
}

/**
 * 全入力を検証してから、成功した地形batchだけを一度に反映する。
 *
 * @param topology 更新元となる現在のruntime topology。
 * @param mutations 同時に反映するtile変更群。
 * @param centralReserve stable mapが保持する変更禁止の中央予約領域。
 * @returns 変更がなければ元のsnapshot、変更時はrevisionを一つ進めたsnapshot。
 */
export function applyRuntimeTopologyMutations(
  topology: RuntimeTopology,
  mutations: readonly RuntimeTopologyMutation[],
  centralReserve: CentralReserve,
): RuntimeTopology {
  if (!centralReserve)
    throw new Error('runtime topologyには中央予約metadataが必要です。');
  mutations.forEach(mutation => validateMutation(topology, mutation, centralReserve));
  const finalMutations = new Map<string, RuntimeTopologyMutation>();
  mutations.forEach(mutation => finalMutations.set(`${mutation.x},${mutation.y}`, mutation));
  const changed = [...finalMutations.values()].filter(mutation =>
    topology.tiles[mutation.y]?.[mutation.x] !== mutation.tile,
  );
  if (changed.length === 0)
    return topology;

  const tiles = topology.tiles.map(row => [...row]);
  changed.forEach((mutation) => {
    const row = tiles[mutation.y];
    if (!row)
      throw new Error('検証済みtile行が見つかりません。');
    row[mutation.x] = mutation.tile;
  });
  return { ...topology, tiles, revision: topology.revision + 1 };
}

function validateMutation(
  topology: RuntimeTopology,
  mutation: RuntimeTopologyMutation,
  centralReserve: CentralReserve,
): void {
  if (!Number.isInteger(mutation.x) || !Number.isInteger(mutation.y))
    throw new Error('runtime topologyのtile座標は整数である必要があります。');
  if (mutation.tile !== 'wall' && mutation.tile !== 'floor')
    throw new Error('runtime topologyのtile種別が不正です。');
  if (mutation.x < 0 || mutation.y < 0 || mutation.x >= topology.width || mutation.y >= topology.height)
    throw new Error('runtime topologyのtile座標が範囲外です。');
  if (
    mutation.x === 0
    || mutation.y === 0
    || mutation.x === topology.width - 1
    || mutation.y === topology.height - 1
  ) throw new Error('runtime topologyの外周tileは変更できません。');
  if (
    mutation.x >= centralReserve.bounds.left
    && mutation.x <= centralReserve.bounds.right
    && mutation.y >= centralReserve.bounds.top
    && mutation.y <= centralReserve.bounds.bottom
  ) throw new Error('runtime topologyの中央予約領域は変更できません。');
}
